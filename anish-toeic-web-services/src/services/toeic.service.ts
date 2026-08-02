import { pool } from './db.service';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { ScorerService } from './scorer.service';
import { getMediaAdapter } from './media.adapter';
import { forbidden, notFound, conflict } from '../errors/http.error';

interface ExamFilters {
  search?: string;
  skillType?: string;
  collectionId?: string;
  page?: number;
  pageSize?: number;
}

// A7 M1: fixed explicit safe projection for the public catalog DTO. Lifecycle
// internals (status/version/published_version) and snapshot/audit data are
// never selected nor forwarded to anonymous callers.
const PUBLIC_EXAM_COLUMNS =
  'id, collection_id, slug, title, duration_minutes, question_count, skill_type';

// Defense in depth: even if a row sneaks extra columns through, strip them.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function projectPublicExam(row: Record<string, any>) {
  return {
    id: row.id,
    collection_id: row.collection_id,
    slug: row.slug,
    title: row.title,
    duration_minutes: row.duration_minutes,
    question_count: row.question_count,
    skill_type: row.skill_type,
  };
}

export class ToeicService {
  static async getExams(filters: ExamFilters = {}) {
    // A7 M1: public catalog serves PUBLISHED exams only. The status predicate
    // lives in both the COUNT and the row query, so DRAFT/ARCHIVED rows are
    // never countable, listable, or guessable by anonymous callers.
    const conditions: string[] = ['status = ?'];
    const params: unknown[] = ['PUBLISHED'];

    if (filters.search) {
      conditions.push('(title LIKE ? OR slug LIKE ?)');
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }
    if (filters.skillType) {
      conditions.push('skill_type = ?');
      params.push(filters.skillType);
    }
    if (filters.collectionId) {
      conditions.push('collection_id = ?');
      params.push(filters.collectionId);
    }

    const whereSql = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';

    const [countRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM toeic_exams${whereSql}`,
      params
    );
    const total = Number(countRows[0]?.total || 0);

    const page = Math.max(1, filters.page || 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize || 20));

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT ${PUBLIC_EXAM_COLUMNS} FROM toeic_exams${whereSql} ORDER BY id LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize]
    );

    return {
      items: rows.map(projectPublicExam),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  static async getExamBySlug(slug: string) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT ${PUBLIC_EXAM_COLUMNS} FROM toeic_exams WHERE slug = ? AND status = 'PUBLISHED' LIMIT 1`,
      [slug]
    );
    if (!rows.length) return null;

    const exam = rows[0];
    const [sections] = await pool.query(
      'SELECT id, exam_id, title, instructions, order_index FROM toeic_exam_sections WHERE exam_id = ? ORDER BY order_index',
      [exam.id]
    );

    return { ...projectPublicExam(exam), sections };
  }

  static async createAttempt(userId: string, examId: number, mode: string, expectedVersion?: number) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Lock exam row to pin the snapshot version atomically.
      const [examRows] = await connection.query<RowDataPacket[]>(
        `SELECT id, status, version, published_version FROM toeic_exams WHERE id = ? FOR UPDATE`,
        [examId]
      );
      if (!examRows.length) {
        await connection.rollback();
        throw notFound('Exam not found');
      }

      const exam = examRows[0];

      if (exam.status !== 'PUBLISHED') {
        await connection.rollback();
        throw forbidden('Exam is not available for attempts');
      }

      // expectedVersion check: if specified, must match current published_version.
      // ponytail: remove this check and use only published_version when expectedVersion semantics are finalized.
      if (expectedVersion !== undefined && expectedVersion !== exam.published_version) {
        await connection.rollback();
        throw conflict(`Stale exam version. Expected ${expectedVersion}, current ${exam.published_version}`);
      }

      const pinnedVersion = exam.published_version as number;

      // Atomic insert with pinned snapshot version. UNIQUE constraint on (user_id, exam_id, pinned_snapshot_version)
      // prevents duplicate attempts on the same exam version.
      const [result] = await connection.query<ResultSetHeader>(
        `INSERT INTO toeic_attempts (user_id, exam_id, status, mode, pinned_snapshot_version)
         VALUES (?, ?, 'IN_PROGRESS', ?, ?)`,
        [userId, examId, mode, pinnedVersion]
      );

      await connection.commit();

      return {
        attemptId: result.insertId,
        status: 'IN_PROGRESS',
        mode,
        pinnedSnapshotVersion: pinnedVersion,
      };
    } catch (err: unknown) {
      await connection.rollback();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((err as any)?.code === 'ER_DUP_ENTRY') {
        throw conflict('Attempt already exists for this exam version');
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((err as any)?.code === 'ER_NO_REFERENCED_ROW_2') {
        throw forbidden('Account no longer exists');
      }
      throw err;
    } finally {
      connection.release();
    }
  }

  /** Resolve pinned snapshot content for an attempt. Falls back to current published_version for legacy attempts. */
  static async resolvePinnedSnapshot(attemptId: number, userId: string) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT a.pinned_snapshot_version, a.exam_id, e.published_version
       FROM toeic_attempts a
       JOIN toeic_exams e ON a.exam_id = e.id
       WHERE a.id = ? AND a.user_id = ?`,
      [attemptId, userId]
    );
    if (!rows.length) return null;

    const attempt = rows[0];
    // Use pinned version if set, otherwise fall back to current published version (legacy).
    const version = attempt.pinned_snapshot_version ?? attempt.published_version;

    const [snapshotRows] = await pool.query<RowDataPacket[]>(
      'SELECT snapshot FROM exam_snapshots WHERE exam_id = ? AND version = ? LIMIT 1',
      [attempt.exam_id, version]
    );

    if (!snapshotRows.length) return null;

    return {
      attemptId,
      examId: attempt.exam_id,
      pinnedVersion: attempt.pinned_snapshot_version,
      snapshot: typeof snapshotRows[0].snapshot === 'string'
        ? JSON.parse(snapshotRows[0].snapshot)
        : snapshotRows[0].snapshot,
    };
  }

  static async getAttempt(attemptId: number, userId: string) {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM toeic_attempts WHERE id = ? AND user_id = ? LIMIT 1',
      [attemptId, userId]
    );
    if (!rows.length) return null;

    const attempt = rows[0];

    const [responses] = await pool.query(
      'SELECT question_id, selected_option_id, text_response, marked_for_review, note, client_revision FROM toeic_attempt_responses WHERE attempt_id = ?',
      [attemptId]
    );

    const [sections] = await pool.query('SELECT * FROM toeic_exam_sections WHERE exam_id = ? ORDER BY order_index', [attempt.exam_id]);
    const [questions] = await pool.query(
      `SELECT q.id, q.section_id, q.type, q.order_index, q.content, q.audio_url, q.image_url, q.prep_time_seconds, q.record_time_seconds, q.min_words
       FROM toeic_questions q
       JOIN toeic_exam_sections s ON q.section_id = s.id
       WHERE s.exam_id = ? ORDER BY q.order_index`,
      [attempt.exam_id]
    );
    const [options] = await pool.query(
      `SELECT o.id, o.question_id, o.label, o.content, o.order_index
       FROM toeic_question_options o
       JOIN toeic_questions q ON o.question_id = q.id
       JOIN toeic_exam_sections s ON q.section_id = s.id
       WHERE s.exam_id = ? ORDER BY o.order_index`,
      [attempt.exam_id]
    );

    return { ...attempt, responses, session: { sections, questions, options } };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async updateResponse(attemptId: number, userId: string, questionId: number, data: Record<string, any>) {
    const [attemptRows] = await pool.query<RowDataPacket[]>(
      'SELECT id, status, exam_id FROM toeic_attempts WHERE id = ? AND user_id = ? LIMIT 1',
      [attemptId, userId]
    );
    if (!attemptRows.length) throw forbidden('Attempt not found or access denied');
    if (attemptRows[0].status !== 'IN_PROGRESS') throw conflict('Attempt is not IN_PROGRESS');
    const examId = attemptRows[0].exam_id;

    const [questionRows] = await pool.query<RowDataPacket[]>(
      `SELECT q.id FROM toeic_questions q
       JOIN toeic_exam_sections s ON q.section_id = s.id
       WHERE q.id = ? AND s.exam_id = ? LIMIT 1`,
      [questionId, examId]
    );
    if (!questionRows.length) throw conflict('Question does not belong to this exam');

    const { selectedOptionId = null, textResponse = null, markedForReview = false, note = null, clientRevision = 0 } = data;

    if (selectedOptionId !== null) {
      const [optionRows] = await pool.query<RowDataPacket[]>(
        'SELECT id FROM toeic_question_options WHERE id = ? AND question_id = ? LIMIT 1',
        [selectedOptionId, questionId]
      );
      if (!optionRows.length) throw conflict('Selected option does not belong to this question');
    }

    const [existing] = await pool.query<RowDataPacket[]>(
      'SELECT client_revision, selected_option_id, text_response, marked_for_review, note FROM toeic_attempt_responses WHERE attempt_id = ? AND question_id = ? LIMIT 1',
      [attemptId, questionId]
    );

    if (existing.length > 0) {
      const current = existing[0];
      if (clientRevision < current.client_revision) throw conflict('Stale client_revision');

      if (clientRevision === current.client_revision) {
        const samePayload =
          (current.selected_option_id ?? null) === selectedOptionId &&
          (current.text_response ?? null) === (textResponse ?? null) &&
          Boolean(current.marked_for_review) === Boolean(markedForReview) &&
          (current.note ?? null) === (note ?? null);
        if (samePayload) return { success: true, replayed: true };
        throw conflict('Concurrent update conflict at same client_revision');
      }
    }

    await pool.query(
      `INSERT INTO toeic_attempt_responses (attempt_id, question_id, selected_option_id, text_response, marked_for_review, note, client_revision)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
       selected_option_id = VALUES(selected_option_id),
       text_response = VALUES(text_response),
       marked_for_review = VALUES(marked_for_review),
       note = VALUES(note),
       client_revision = VALUES(client_revision)`,
      [attemptId, questionId, selectedOptionId, textResponse, markedForReview, note, clientRevision]
    );

    return { success: true };
  }

  static async presignMedia(attemptId: number, userId: string, questionId: number, fileName: string, fileType: string, fileSize: number) {
    const [attemptRows] = await pool.query<RowDataPacket[]>(
      'SELECT id, status, exam_id FROM toeic_attempts WHERE id = ? AND user_id = ? LIMIT 1',
      [attemptId, userId]
    );
    if (!attemptRows.length) throw forbidden('Attempt not found or access denied');
    if (attemptRows[0].status !== 'IN_PROGRESS') throw conflict('Attempt is not IN_PROGRESS');

    const [questionRows] = await pool.query<RowDataPacket[]>(
      `SELECT q.id FROM toeic_questions q
       JOIN toeic_exam_sections s ON q.section_id = s.id
       WHERE q.id = ? AND s.exam_id = ? LIMIT 1`,
      [questionId, attemptRows[0].exam_id]
    );
    if (!questionRows.length) throw conflict('Question does not belong to this exam');

    // Generate presigned upload URL via the media adapter.
    // The adapter never touches raw audio — it only generates a signed URL
    // that the browser uses to upload audio directly to the bucket.
    const adapter = getMediaAdapter();
    const presignResult = await adapter.generatePresignedUpload({
      attemptId,
      questionId,
      fileName,
      fileType,
      fileSize,
    });

    // Record the uploaded media metadata in the database after a successful
    // client-side upload is reported (done separately). For presign, we only
    // insert a placeholder so the backend knows this media key was authorized.
    await pool.query(
      `INSERT INTO toeic_attempt_media (attempt_id, question_id, s3_key)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE s3_key = VALUES(s3_key)`,
      [attemptId, questionId, presignResult.s3Key]
    );

    return {
      uploadUrl: presignResult.uploadUrl,
      s3Key: presignResult.s3Key,
      expiresAt: presignResult.expiresAt,
    };
  }

  static async submitAttempt(attemptId: number, userId: string) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT a.id, a.status, a.pinned_snapshot_version, e.skill_type
         FROM toeic_attempts a
         JOIN toeic_exams e ON a.exam_id = e.id
         WHERE a.id = ? AND a.user_id = ? FOR UPDATE`,
        [attemptId, userId]
      );
      if (!rows.length) throw forbidden('Attempt not found or access denied');

      const { status, skill_type, pinned_snapshot_version } = rows[0];

      if (status === 'SUBMITTED' || status === 'GRADING' || status === 'COMPLETED') {
        await connection.rollback();
        return { success: true, alreadySubmitted: true };
      }

      if (status !== 'IN_PROGRESS' && status !== 'FAILED') {
        throw conflict('Attempt cannot be submitted');
      }

      // Record the snapshot version used for grading (for audit/replay).
      await connection.query(
        `UPDATE toeic_attempts
         SET status = ?, completed_at = CURRENT_TIMESTAMP, grading_snapshot_version = ?
         WHERE id = ?`,
        ['SUBMITTED', pinned_snapshot_version, attemptId]
      );

      if (skill_type === 'LR') {
        await ScorerService.scoreLR(attemptId, userId, connection);
        await connection.query('UPDATE toeic_attempts SET status = ? WHERE id = ?', ['COMPLETED', attemptId]);
      } else {
        // Idempotent enqueue with reset retry_count on resubmit.
        await connection.query(
          `INSERT INTO toeic_grading_jobs (attempt_id, status, retry_count)
           VALUES (?, 'QUEUED', 0)
           ON DUPLICATE KEY UPDATE
           status = CASE
             WHEN status IN ('FAILED', 'RETRY', 'PARTIAL') THEN 'QUEUED'
             ELSE status
           END,
           retry_count = 0,
           error_message = NULL,
           updated_at = NOW()`,
          [attemptId]
        );
      }

      await connection.commit();
      return { success: true };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async getGradingStatus(attemptId: number, userId: string) {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT j.* FROM toeic_grading_jobs j JOIN toeic_attempts a ON j.attempt_id = a.id WHERE a.id = ? AND a.user_id = ? ORDER BY j.created_at DESC LIMIT 1',
      [attemptId, userId]
    );
    if (!rows.length) return null;
    return rows[0];
  }

  static async getResult(attemptId: number, userId: string) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT r.listening_score, r.reading_score, r.total_score, r.status
       FROM toeic_attempt_results r
       JOIN toeic_attempts a ON r.attempt_id = a.id
       WHERE a.id = ? AND a.user_id = ? LIMIT 1`,
      [attemptId, userId]
    );
    if (!rows.length) return null;
    const row = rows[0];
    return {
      listeningScore: row.listening_score,
      readingScore: row.reading_score,
      totalScore: row.total_score,
      status: row.status,
    };
  }

  /** Safe projection of a raw result row — strips internal columns. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static projectResult(row: Record<string, any>) {
    return {
      listeningScore: row.listening_score ?? 0,
      readingScore: row.reading_score ?? 0,
      totalScore: row.total_score ?? 0,
      status: row.status,
    };
  }

  static async getReview(attemptId: number, userId: string) {
    const [attemptRows] = await pool.query<RowDataPacket[]>(
      'SELECT id, status, exam_id FROM toeic_attempts WHERE id = ? AND user_id = ? LIMIT 1',
      [attemptId, userId]
    );
    if (!attemptRows.length) return null;

    const attempt = attemptRows[0];
    if (attempt.status !== 'COMPLETED') throw forbidden('Review not available until the attempt is completed');

    const [reviewRows] = await pool.query(
      `SELECT q.id as question_id, rc.correct_option_id, rc.explanation, rc.sample_response, rc.rubric
       FROM toeic_questions q
       JOIN toeic_exam_sections s ON q.section_id = s.id
       LEFT JOIN toeic_question_review_content rc ON q.id = rc.question_id
       WHERE s.exam_id = ?`,
      [attempt.exam_id]
    );

    return reviewRows;
  }

  static async getAttemptHistory(userId: string) {
    const [rows] = await pool.query(
      'SELECT * FROM toeic_attempts WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    return rows;
  }
}
