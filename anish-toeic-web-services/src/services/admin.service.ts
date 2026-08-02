import { pool } from './db.service';
import { RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';
import { HttpError } from '../errors/http.error';

// A7 M1: admin list projection — exam columns + lifecycle internals. Snapshot
// JSON and audit rows live in other tables and are never selected here.
const ADMIN_EXAM_COLUMNS =
  'id, collection_id, slug, title, duration_minutes, question_count, skill_type, status, version, published_version';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function projectAdminExam(row: Record<string, any>) {
  return {
    id: row.id,
    collection_id: row.collection_id,
    slug: row.slug,
    title: row.title,
    duration_minutes: row.duration_minutes,
    question_count: row.question_count,
    skill_type: row.skill_type,
    status: row.status,
    version: row.version,
    published_version: row.published_version ?? null,
  };
}

export class AdminService {
  /** Protected admin list — exams with lifecycle columns, no snapshot/audit data. */
  static async getExams(filters: { page?: number; pageSize?: number } = {}) {
    const [countRows] = await pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS total FROM toeic_exams'
    );
    const total = Number(countRows[0]?.total || 0);

    const page = Math.max(1, filters.page || 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize || 20));

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT ${ADMIN_EXAM_COLUMNS} FROM toeic_exams ORDER BY id LIMIT ? OFFSET ?`,
      [pageSize, (page - 1) * pageSize]
    );

    return {
      items: rows.map(projectAdminExam),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  static async publishArchive(
    examId: number,
    actorUserId: string,
    status: string,
    expectedVersion?: number
  ) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Lock the exam row for update.
      const [examRows] = await connection.query<RowDataPacket[]>(
        'SELECT id, status, version, published_version FROM toeic_exams WHERE id = ? FOR UPDATE',
        [examId]
      );
      if (!examRows.length) {
        await connection.rollback();
        throw new HttpError(404, 'Exam not found');
      }

      const exam = examRows[0];

      // expectedVersion optimistic locking for publish operations.
      if (status === 'PUBLISHED' && expectedVersion !== undefined) {
        if (exam.version !== expectedVersion) {
          await connection.rollback();
          throw new HttpError(409, `Stale version. Expected ${expectedVersion}, current ${exam.version}`);
        }
      }

      if (status === 'PUBLISHED') {
        if (exam.status === 'PUBLISHED') {
          await connection.rollback();
          throw new HttpError(409, 'Exam is already PUBLISHED');
        }
        if (exam.status === 'ARCHIVED') {
          await connection.rollback();
          throw new HttpError(409, 'Cannot publish an ARCHIVED exam');
        }

        // Build the immutable JSON snapshot of the exam's full data.
        const snapshot = await buildExamSnapshot(connection, examId);

        const newVersion = (exam.version as number) + 1;

        // Insert the immutable snapshot.
        await connection.query(
          'INSERT INTO exam_snapshots (exam_id, version, snapshot) VALUES (?, ?, ?)',
          [examId, newVersion, JSON.stringify(snapshot)]
        );

        // Update exam status, version, and published pointer atomically.
        await connection.query(
          'UPDATE toeic_exams SET status = ?, version = ?, published_version = ? WHERE id = ?',
          ['PUBLISHED', newVersion, newVersion, examId]
        );

        // Append audit event.
        await connection.query(
          'INSERT INTO exam_audit_log (exam_id, action, actor_user_id, details) VALUES (?, ?, ?, ?)',
          [examId, 'PUBLISH', actorUserId, JSON.stringify({ version: newVersion })]
        );
      } else if (status === 'ARCHIVED') {
        if (exam.status === 'ARCHIVED') {
          await connection.rollback();
          throw new HttpError(409, 'Exam is already ARCHIVED');
        }

        await connection.query(
          'UPDATE toeic_exams SET status = ? WHERE id = ?',
          ['ARCHIVED', examId]
        );

        // Append audit event.
        await connection.query(
          'INSERT INTO exam_audit_log (exam_id, action, actor_user_id, details) VALUES (?, ?, ?, ?)',
          [examId, 'ARCHIVE', actorUserId, JSON.stringify({ previousStatus: exam.status })]
        );
      } else if (status === 'RESTORE') {
        // RESTORE: rollback from ARCHIVED to DRAFT. Re-publish uses expectedVersion check.
        if (exam.status !== 'ARCHIVED') {
          await connection.rollback();
          throw new HttpError(409, 'Only ARCHIVED exams can be restored');
        }

        await connection.query(
          'UPDATE toeic_exams SET status = ? WHERE id = ?',
          ['DRAFT', examId]
        );

        await connection.query(
          'INSERT INTO exam_audit_log (exam_id, action, actor_user_id, details) VALUES (?, ?, ?, ?)',
          [examId, 'RESTORE', actorUserId, JSON.stringify({ previousStatus: exam.status })]
        );
      } else {
        await connection.rollback();
        throw new HttpError(400, `Invalid status: ${status}`);
      }

      await connection.commit();
      return { success: true, examId, status };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async getSnapshot(examId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT version, snapshot, created_at FROM exam_snapshots WHERE exam_id = ? ORDER BY version DESC LIMIT 1',
      [examId]
    );
    if (!rows.length) return null;
    const row = rows[0];
    return {
      examId,
      version: row.version,
      snapshot: typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) : row.snapshot,
      createdAt: row.created_at,
    };
  }

  static async getAuditLog(examId?: number) {
    if (examId) {
      const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT id, exam_id, action, actor_user_id, details, created_at FROM exam_audit_log WHERE exam_id = ? ORDER BY created_at DESC',
        [examId]
      );
      return rows;
    }
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT id, exam_id, action, actor_user_id, details, created_at FROM exam_audit_log ORDER BY created_at DESC LIMIT 100'
    );
    return rows;
  }
}

// Builds a full immutable snapshot of the exam's data at publish time.
async function buildExamSnapshot(
  connection: PoolConnection,
  examId: number
): Promise<Record<string, unknown>> {
  // Exam metadata.
  const [examRows] = await connection.query<RowDataPacket[]>(
    'SELECT id, collection_id, slug, title, duration_minutes, question_count, skill_type, status, version FROM toeic_exams WHERE id = ?',
    [examId]
  );
  const exam = examRows[0];

  // Sections.
  const [sectionRows] = await connection.query<RowDataPacket[]>(
    'SELECT id, exam_id, title, instructions, order_index FROM toeic_exam_sections WHERE exam_id = ? ORDER BY order_index',
    [examId]
  );
  const sectionIds = sectionRows.map((s: RowDataPacket) => s.id);

  // Questions (indexed by section_id).
  const questions: Record<string, unknown>[] = [];
  if (sectionIds.length > 0) {
    const [questionRows] = await connection.query<RowDataPacket[]>(
      `SELECT id, section_id, type, order_index, content, audio_url, image_url, prep_time_seconds, record_time_seconds, min_words
       FROM toeic_questions
       WHERE section_id IN (?)
       ORDER BY order_index`,
      [sectionIds]
    );

    const questionIds = questionRows.map((q: RowDataPacket) => q.id);

    // Options (indexed by question_id).
    const optionsMap: Record<number, RowDataPacket[]> = {};
    if (questionIds.length > 0) {
      const [optionRows] = await connection.query<RowDataPacket[]>(
        `SELECT id, question_id, label, content, order_index
         FROM toeic_question_options
         WHERE question_id IN (?)
         ORDER BY order_index`,
        [questionIds]
      );
      for (const opt of optionRows) {
        const qid = opt.question_id as number;
        if (!optionsMap[qid]) optionsMap[qid] = [];
        optionsMap[qid].push(opt);
      }

      // Review content (indexed by question_id).
      const [reviewRows] = await connection.query<RowDataPacket[]>(
        `SELECT question_id, correct_option_id, explanation, sample_response, rubric
         FROM toeic_question_review_content
         WHERE question_id IN (?)`,
        [questionIds]
      );
      const reviewMap: Record<number, RowDataPacket> = {};
      for (const r of reviewRows) {
        reviewMap[r.question_id as number] = r;
      }

      for (const q of questionRows) {
        const qid = q.id as number;
        questions.push({
          id: qid,
          sectionId: q.section_id,
          type: q.type,
          orderIndex: q.order_index,
          content: q.content,
          audioUrl: q.audio_url,
          imageUrl: q.image_url,
          prepTimeSeconds: q.prep_time_seconds,
          recordTimeSeconds: q.record_time_seconds,
          minWords: q.min_words,
          options: (optionsMap[qid] || []).map((o: RowDataPacket) => ({
            id: o.id,
            label: o.label,
            content: o.content,
            orderIndex: o.order_index,
          })),
          review: reviewMap[qid]
            ? {
                correctOptionId: reviewMap[qid].correct_option_id,
                explanation: reviewMap[qid].explanation,
                sampleResponse: reviewMap[qid].sample_response,
                rubric: reviewMap[qid].rubric,
              }
            : null,
        });
      }
    }
  }

  const sections = sectionRows.map((s: RowDataPacket) => ({
    id: s.id,
    examId: s.exam_id,
    title: s.title,
    instructions: s.instructions,
    orderIndex: s.order_index,
    questions: questions.filter((q: Record<string, unknown>) => q.sectionId === s.id),
  }));

  return {
    examId: exam.id,
    slug: exam.slug,
    title: exam.title,
    durationMinutes: exam.duration_minutes,
    questionCount: exam.question_count,
    skillType: exam.skill_type,
    status: exam.status,
    version: exam.version,
    sections,
  };
}
