import { pool } from './db.service';
import { RowDataPacket } from 'mysql2';
import { HttpError, notFound, conflict } from '../errors/http.error';
import crypto from 'crypto';

export interface ResultFilters {
  examId?: number;
  userId?: string;
  status?: string;
  minScore?: number;
  maxScore?: number;
  page?: number;
  pageSize?: number;
}

export interface RegradeInput {
  attemptId: number;
  reason: string;
  idempotencyKey?: string;
}

export interface OverrideInput {
  attemptId: number;
  listeningScore?: number;
  readingScore?: number;
  reason: string;
  idempotencyKey?: string;
}

export interface RestoreInput {
  attemptId: number;
  targetSnapshotVersion: number;
  reason: string;
}

/** Hash of result state for idempotency deduplication. */
function hashResultState(scores: { listening: number; reading: number; total: number }): string {
  return crypto.createHash('sha256').update(JSON.stringify(scores)).digest('hex');
}

/** Check idempotency key and return existing result hash if duplicate. */
async function checkIdempotency(
  idempotencyKey: string,
  attemptId: number,
  action: string,
  canonicalHash?: string
): Promise<{ exists: boolean; hashMatch: boolean; existingHash: string | null }> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT result_hash FROM result_idempotency_keys WHERE idempotency_key = ? AND attempt_id = ? AND action = ? LIMIT 1',
    [idempotencyKey, attemptId, action]
  );
  if (!rows.length) return { exists: false, hashMatch: false, existingHash: null };
  const existingHash = rows[0].result_hash;
  // If canonical hash provided, verify match (same key + same request)
  if (canonicalHash !== undefined && existingHash !== canonicalHash) {
    return { exists: true, hashMatch: false, existingHash };
  }
  return { exists: true, hashMatch: true, existingHash };
}

/** Store idempotency key after successful operation. */
async function storeIdempotency(
  idempotencyKey: string,
  attemptId: number,
  action: string,
  resultHash: string
): Promise<void> {
  // Keys expire after 24 hours. Never overwrite existing hash (idempotency contract).
  await pool.query(
    `INSERT INTO result_idempotency_keys (idempotency_key, attempt_id, action, result_hash, expires_at)
     VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 24 HOUR))`,
    [idempotencyKey, attemptId, action, resultHash]
  );
}

export class AdminResultService {
  /** List results with filtering and pagination. */
  static async listResults(filters: ResultFilters = {}) {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.examId) {
      conditions.push('a.exam_id = ?');
      params.push(filters.examId);
    }
    if (filters.userId) {
      conditions.push('a.user_id = ?');
      params.push(filters.userId);
    }
    if (filters.status) {
      conditions.push('r.status = ?');
      params.push(filters.status);
    }
    if (filters.minScore !== undefined) {
      conditions.push('r.total_score >= ?');
      params.push(filters.minScore);
    }
    if (filters.maxScore !== undefined) {
      conditions.push('r.total_score <= ?');
      params.push(filters.maxScore);
    }

    const whereSql = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';

    const [countRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM toeic_attempt_results r
       JOIN toeic_attempts a ON r.attempt_id = a.id${whereSql}`,
      params
    );
    const total = Number(countRows[0]?.total || 0);

    const page = Math.max(1, filters.page || 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize || 20));

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT r.*, a.user_id, a.exam_id, a.grading_snapshot_version, a.status as attempt_status,
              e.title as exam_title, e.slug as exam_slug
       FROM toeic_attempt_results r
       JOIN toeic_attempts a ON r.attempt_id = a.id
       JOIN toeic_exams e ON a.exam_id = e.id
       ${whereSql}
       ORDER BY r.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize]
    );

    return {
      items: rows.map(r => ({
        attemptId: r.attempt_id,
        userId: r.user_id,
        examId: r.exam_id,
        examTitle: r.exam_title,
        examSlug: r.exam_slug,
        listeningScore: r.listening_score,
        readingScore: r.reading_score,
        totalScore: r.total_score,
        status: r.status,
        gradingSnapshotVersion: r.grading_snapshot_version,
        attemptStatus: r.attempt_status,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /** Get result detail for a specific attempt. */
  static async getResultDetail(attemptId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT r.*, a.user_id, a.exam_id, a.status as attempt_status,
              a.pinned_snapshot_version, a.grading_snapshot_version,
              e.title as exam_title, e.slug as exam_slug
       FROM toeic_attempt_results r
       JOIN toeic_attempts a ON r.attempt_id = a.id
       JOIN toeic_exams e ON a.exam_id = e.id
       WHERE r.attempt_id = ?`,
      [attemptId]
    );
    if (!rows.length) return null;

    const r = rows[0];

    // Get question-level scores.
    const [scoreRows] = await pool.query<RowDataPacket[]>(
      `SELECT qs.*, q.section_id, q.type
       FROM toeic_question_scores qs
       JOIN toeic_questions q ON qs.question_id = q.id
       WHERE qs.attempt_id = ?`,
      [attemptId]
    );

    return {
      attemptId: r.attempt_id,
      userId: r.user_id,
      examId: r.exam_id,
      examTitle: r.exam_title,
      examSlug: r.exam_slug,
      listeningScore: r.listening_score,
      readingScore: r.reading_score,
      totalScore: r.total_score,
      status: r.status,
      pinnedSnapshotVersion: r.pinned_snapshot_version,
      gradingSnapshotVersion: r.grading_snapshot_version,
      attemptStatus: r.attempt_status,
      questionScores: scoreRows,
      metrics: r.metrics,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  /** Regrade an attempt using the pinned snapshot version - produces new deterministic revision. */
  static async regrade(input: RegradeInput, actorUserId: string) {
    const { attemptId, reason, idempotencyKey } = input;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Lock attempt and result.
      const [attemptRows] = await connection.query<RowDataPacket[]>(
        `SELECT a.*, e.skill_type, r.listening_score as prev_listening, r.reading_score as prev_reading,
                r.total_score as prev_total, r.status as result_status
         FROM toeic_attempts a
         JOIN toeic_exams e ON a.exam_id = e.id
         LEFT JOIN toeic_attempt_results r ON a.id = r.attempt_id
         WHERE a.id = ?
         FOR UPDATE`,
        [attemptId]
      );

      if (!attemptRows.length) {
        await connection.rollback();
        throw notFound('Attempt not found');
      }

      const attempt = attemptRows[0];

      if (!['COMPLETED', 'SUBMITTED', 'GRADING'].includes(attempt.status)) {
        await connection.rollback();
        throw conflict('Only COMPLETED, SUBMITTED, or GRADING attempts can be regraded');
      }

      const prevScores = {
        listening: attempt.prev_listening ?? 0,
        reading: attempt.prev_reading ?? 0,
        total: attempt.prev_total ?? 0,
      };

      // Regrading uses the pinned snapshot version (or grading version if pinned is null).
      const snapshotVersion = attempt.grading_snapshot_version ?? attempt.pinned_snapshot_version;

      // Compute result hash before scoring for idempotency check
      const preHash = hashResultState(prevScores);

      // Check idempotency with pre-computed hash
      if (idempotencyKey) {
        const idempotencyResult = await checkIdempotency(idempotencyKey, attemptId, 'REGRADE', preHash);
        if (idempotencyResult.exists && idempotencyResult.hashMatch) {
          await connection.rollback();
          return { success: true, replayed: true, message: 'Operation already completed with this idempotency key' };
        }
        if (idempotencyResult.exists && !idempotencyResult.hashMatch) {
          await connection.rollback();
          throw conflict('Idempotency key already used with different request parameters');
        }
      }

      // Perform deterministic re-grading using canonical scoring path
      // For LR exams, use ScorerService logic inline within transaction
      let newScores: { listening: number; reading: number; total: number };
      if (attempt.skill_type === 'LR') {
        // Deterministic LR scoring: count correct answers by section
        const LISTENING_SECTION_CUTOFF = 4;

        // Fetch correct options for this exam version
        const [correctOptions] = await connection.query<RowDataPacket[]>(
          `SELECT rc.question_id, rc.correct_option_id, s.order_index as section_order
           FROM toeic_question_review_content rc
           JOIN toeic_questions q ON rc.question_id = q.id
           JOIN toeic_exam_sections s ON q.section_id = s.id
           WHERE s.exam_id = ?`,
          [attempt.exam_id]
        );

        // Fetch attempt responses
        const [responses] = await connection.query<RowDataPacket[]>(
          `SELECT question_id, selected_option_id FROM toeic_attempt_responses WHERE attempt_id = ?`,
          [attemptId]
        );

        // Build maps for scoring
        const correctMap = new Map<number, { correctId: number | null; sectionOrder: number }>();
        for (const row of correctOptions as RowDataPacket[]) {
          correctMap.set(row.question_id, { correctId: row.correct_option_id, sectionOrder: row.section_order });
        }

        let listeningCorrect = 0;
        let readingCorrect = 0;
        let totalCorrect = 0;
        const questionScores: Array<[number, number, number, boolean]> = [];

        for (const response of responses as RowDataPacket[]) {
          const qId: number = response.question_id;
          const selectedId: number | null = response.selected_option_id;
          const info = correctMap.get(qId);
          const isCorrect = info && selectedId !== null && selectedId === info.correctId;
          const score = isCorrect ? 1 : 0;

          questionScores.push([attemptId, qId, score, isCorrect ?? false]);
          totalCorrect += score;

          if (isCorrect && info) {
            if (info.sectionOrder <= LISTENING_SECTION_CUTOFF) {
              listeningCorrect += 1;
            } else {
              readingCorrect += 1;
            }
          }
        }

        // Persist question-level scores
        if (questionScores.length > 0) {
          await connection.query(
            `INSERT INTO toeic_question_scores (attempt_id, question_id, score, is_correct) VALUES ?
             ON DUPLICATE KEY UPDATE score = VALUES(score), is_correct = VALUES(is_correct)`,
            [questionScores]
          );
        }

        newScores = { listening: listeningCorrect, reading: readingCorrect, total: totalCorrect };
      } else {
        // SW or other skill types: use previous scores as-is (scoring delegated to GradingService)
        newScores = { ...prevScores };
      }

      const resultHash = hashResultState(newScores);

      // Validate total score
      if (newScores.total > 990) {
        await connection.rollback();
        throw conflict(`Score total ${newScores.total} exceeds maximum of 990`);
      }

      // Update or insert result with new revision.
      await connection.query(
        `INSERT INTO toeic_attempt_results (attempt_id, listening_score, reading_score, total_score, status)
         VALUES (?, ?, ?, ?, 'FINAL')
         ON DUPLICATE KEY UPDATE
         listening_score = VALUES(listening_score),
         reading_score = VALUES(reading_score),
         total_score = VALUES(total_score),
         status = 'FINAL'`,
        [attemptId, newScores.listening, newScores.reading, newScores.total]
      );

      // Audit log for revision traceability.
      await connection.query(
        `INSERT INTO result_audit_log
         (attempt_id, action, actor_user_id, previous_snapshot_version, new_snapshot_version,
          previous_scores, new_scores, reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          attemptId,
          'REGRADE',
          actorUserId,
          snapshotVersion,
          snapshotVersion,
          JSON.stringify(prevScores),
          JSON.stringify(newScores),
          reason,
        ]
      );

      await connection.commit();

      // Store idempotency key after commit.
      if (idempotencyKey) {
        await storeIdempotency(idempotencyKey, attemptId, 'REGRADE', resultHash);
      }

      return { success: true, attemptId, previousScores: prevScores, newScores };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /** Override scores directly with idempotency protection. */
  static async override(input: OverrideInput, actorUserId: string) {
    const { attemptId, listeningScore, readingScore, reason, idempotencyKey } = input;

    if (listeningScore === undefined && readingScore === undefined) {
      throw new HttpError(400, 'At least one score (listeningScore or readingScore) must be provided');
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [attemptRows] = await connection.query<RowDataPacket[]>(
        `SELECT a.*, r.listening_score as prev_listening, r.reading_score as prev_reading,
                r.total_score as prev_total
         FROM toeic_attempts a
         LEFT JOIN toeic_attempt_results r ON a.id = r.attempt_id
         WHERE a.id = ?
         FOR UPDATE`,
        [attemptId]
      );

      if (!attemptRows.length) {
        await connection.rollback();
        throw notFound('Attempt not found');
      }

      const attempt = attemptRows[0];

      const prevListening = attempt.prev_listening ?? 0;
      const prevReading = attempt.prev_reading ?? 0;
      const newListening = listeningScore ?? prevListening;
      const newReading = readingScore ?? prevReading;
      const newTotal = newListening + newReading;

      const prevScores = { listening: prevListening, reading: prevReading, total: prevListening + prevReading };
      const newScores = { listening: newListening, reading: newReading, total: newTotal };

      // Compute pre-override hash for idempotency check
      const preHash = hashResultState(prevScores);

      // Check idempotency with pre-computed hash
      if (idempotencyKey) {
        const idempotencyResult = await checkIdempotency(idempotencyKey, attemptId, 'OVERRIDE', preHash);
        if (idempotencyResult.exists && idempotencyResult.hashMatch) {
          await connection.rollback();
          return { success: true, replayed: true, message: 'Operation already completed with this idempotency key' };
        }
        if (idempotencyResult.exists && !idempotencyResult.hashMatch) {
          await connection.rollback();
          throw conflict('Idempotency key already used with different request parameters');
        }
      }

      // Validate total score
      if (newTotal > 990) {
        await connection.rollback();
        throw conflict(`Score total ${newTotal} exceeds maximum of 990`);
      }

      // Update or insert result.
      await connection.query(
        `INSERT INTO toeic_attempt_results (attempt_id, listening_score, reading_score, total_score, status)
         VALUES (?, ?, ?, ?, 'FINAL')
         ON DUPLICATE KEY UPDATE
         listening_score = VALUES(listening_score),
         reading_score = VALUES(reading_score),
         total_score = VALUES(total_score),
         status = 'FINAL'`,
        [attemptId, newListening, newReading, newTotal]
      );

      // Audit log.
      await connection.query(
        `INSERT INTO result_audit_log
         (attempt_id, action, actor_user_id, previous_snapshot_version, new_snapshot_version,
          previous_scores, new_scores, reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          attemptId,
          'OVERRIDE',
          actorUserId,
          attempt.grading_snapshot_version,
          attempt.grading_snapshot_version,
          JSON.stringify(prevScores),
          JSON.stringify(newScores),
          reason,
        ]
      );

      await connection.commit();

      if (idempotencyKey) {
        const resultHash = hashResultState(newScores);
        await storeIdempotency(idempotencyKey, attemptId, 'OVERRIDE', resultHash);
      }

      return { success: true, attemptId, previousScores: prevScores, newScores };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /** Restore attempt to a specific prior snapshot version - re-applies immutable revision score payload. */
  static async restore(input: RestoreInput, actorUserId: string) {
    const { attemptId, targetSnapshotVersion, reason } = input;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [attemptRows] = await connection.query<RowDataPacket[]>(
        `SELECT a.*, r.listening_score as prev_listening, r.reading_score as prev_reading,
                r.total_score as prev_total
         FROM toeic_attempts a
         LEFT JOIN toeic_attempt_results r ON a.id = r.attempt_id
         WHERE a.id = ?
         FOR UPDATE`,
        [attemptId]
      );

      if (!attemptRows.length) {
        await connection.rollback();
        throw notFound('Attempt not found');
      }

      const attempt = attemptRows[0];

      // Verify target snapshot exists and belongs to this exam.
      const [snapshotRows] = await connection.query<RowDataPacket[]>(
        'SELECT version FROM exam_snapshots WHERE exam_id = ? AND version = ? LIMIT 1',
        [attempt.exam_id, targetSnapshotVersion]
      );
      if (!snapshotRows.length) {
        await connection.rollback();
        throw notFound(`Snapshot version ${targetSnapshotVersion} not found for this exam`);
      }

      // Look up the score payload from a prior revision at the target snapshot version
      // from the audit log (result_audit_log stores new_scores per REGRADE/OVERRIDE)
      const [revisionRows] = await connection.query<RowDataPacket[]>(
        `SELECT new_scores, created_at FROM result_audit_log
         WHERE attempt_id = ? AND new_snapshot_version = ?
         ORDER BY id DESC LIMIT 1`,
        [attemptId, targetSnapshotVersion]
      );

      let restoredScores: { listening: number; reading: number; total: number };
      if (revisionRows.length) {
        // Restore the score payload from prior revision
        const scoresJson = typeof revisionRows[0].new_scores === 'string'
          ? JSON.parse(revisionRows[0].new_scores)
          : revisionRows[0].new_scores;
        restoredScores = {
          listening: scoresJson.listening ?? 0,
          reading: scoresJson.reading ?? 0,
          total: scoresJson.total ?? 0,
        };
      } else {
        // No prior revision at this version - restore using current scores as fallback
        restoredScores = {
          listening: attempt.prev_listening ?? 0,
          reading: attempt.prev_reading ?? 0,
          total: (attempt.prev_listening ?? 0) + (attempt.prev_reading ?? 0),
        };
      }

      // Validate total score
      if (restoredScores.total > 990) {
        await connection.rollback();
        throw conflict(`Score total ${restoredScores.total} exceeds maximum of 990`);
      }

      const prevScores = {
        listening: attempt.prev_listening ?? 0,
        reading: attempt.prev_reading ?? 0,
        total: (attempt.prev_listening ?? 0) + (attempt.prev_reading ?? 0),
      };

      // Update grading snapshot version to target
      await connection.query(
        'UPDATE toeic_attempts SET grading_snapshot_version = ? WHERE id = ?',
        [targetSnapshotVersion, attemptId]
      );

      // Apply the restored score payload to current result
      await connection.query(
        `INSERT INTO toeic_attempt_results (attempt_id, listening_score, reading_score, total_score, status)
         VALUES (?, ?, ?, ?, 'FINAL')
         ON DUPLICATE KEY UPDATE
         listening_score = VALUES(listening_score),
         reading_score = VALUES(reading_score),
         total_score = VALUES(total_score),
         status = 'FINAL'`,
        [attemptId, restoredScores.listening, restoredScores.reading, restoredScores.total]
      );

      // Audit log.
      await connection.query(
        `INSERT INTO result_audit_log
         (attempt_id, action, actor_user_id, previous_snapshot_version, new_snapshot_version,
          previous_scores, new_scores, reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          attemptId,
          'RESTORE',
          actorUserId,
          attempt.grading_snapshot_version ?? attempt.pinned_snapshot_version,
          targetSnapshotVersion,
          JSON.stringify(prevScores),
          JSON.stringify(restoredScores),
          reason,
        ]
      );

      await connection.commit();

      return {
        success: true,
        attemptId,
        restoredToVersion: targetSnapshotVersion,
        previousScores: prevScores,
        restoredScores,
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /** Get result audit log for an attempt. */
  static async getResultAuditLog(attemptId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM result_audit_log WHERE attempt_id = ? ORDER BY created_at DESC`,
      [attemptId]
    );
    return rows;
  }
}
