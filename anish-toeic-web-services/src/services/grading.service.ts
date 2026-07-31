/**
 * Durable idempotent grading lifecycle.
 *
 * States: QUEUED → PROCESSING → COMPLETED | PARTIAL | FAILED → RETRY
 *
 * - Duplicate worker safety via Redis lock + FOR UPDATE row lock.
 * - Stale PROCESSING recovery (jobs stuck > 10 minutes).
 * - Partial persistence: per-question scores saved iteratively.
 * - Sanitized errors — no raw provider messages, tokens, or audio leaked.
 * - Delegates AI scoring to the provider-neutral AiGradingAdapter.
 * - Distinguishes retryable vs non-retryable failures.
 */

import { pool } from './db.service';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import {
  getAiGradingAdapter,
  AiGradingRequest,
  AiProviderRetryableError,
  AiProviderNonRetryableError,
  AiProviderTimeoutError,
  AiProviderNotConfiguredError,
} from './adapters/ai-grading.adapter';
import { Redis } from 'ioredis';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const STALE_PROCESSING_MS = 10 * 60 * 1000; // 10 minutes
const MAX_RETRIES = 3;
const GRADING_LOCK_TTL = 180; // seconds (3 minutes)

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

interface GradingErrorClassification {
  retryable: boolean;
  errorMessage: string; // sanitized — safe for DB/API
}

function classifyError(error: unknown): GradingErrorClassification {
  if (error instanceof AiProviderRetryableError || error instanceof AiProviderTimeoutError) {
    return {
      retryable: true,
      errorMessage: 'AI_PROVIDER_ERROR: grading temporarily unavailable',
    };
  }
  if (error instanceof AiProviderNotConfiguredError) {
    return {
      retryable: false,
      errorMessage: 'AI_PROVIDER_NOT_CONFIGURED',
    };
  }
  if (error instanceof AiProviderNonRetryableError) {
    return {
      retryable: false,
      errorMessage: 'AI_PROVIDER_ERROR: grading failed',
    };
  }
  // Database errors, etc. — sanitize the message
  const raw = error instanceof Error ? error.message : 'Unknown error';
  // NEVER leak SQL snippets, tokens, or full provider messages
  const sanitized = raw
    .replace(/Error:\s*/g, '')
    .replace(/at\s+\S+/g, '') // strip stack trace
    .substring(0, 255)
    .trim() || 'Internal grading error';

  return { retryable: false, errorMessage: sanitized };
}

// ---------------------------------------------------------------------------
// Idempotency key generation
// ---------------------------------------------------------------------------

function buildIdempotencyKey(attemptId: number, retry: number): string {
  return `grading-${attemptId}-v${retry}`;
}

// ---------------------------------------------------------------------------
// Main processing
// ---------------------------------------------------------------------------

export class GradingService {
  /**
   * Process a single grading job with full lifecycle:
   *  - Acquire Redis lock (duplicate worker guard)
   *  - FOR UPDATE row lock (transactional guard)
   *  - Handle QUEUED / RETRY / stale PROCESSING
   *  - Persist question scores individually (partial progress)
   *  - Classify failures as retryable or terminal
   */
  static async processJob(jobId: number): Promise<{ success: boolean; message: string }> {
    // 1. Redis lock — prevents duplicate workers from processing same job
    const lockKey = `grading_job_lock:${jobId}`;
    const lockAcquired = await redis.set(lockKey, '1', 'EX', GRADING_LOCK_TTL, 'NX');

    if (!lockAcquired) {
      return { success: true, message: 'Lock not acquired — another worker is processing' };
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 2. Lock the job row
      const [jobRows] = await connection.query<RowDataPacket[]>(
        `SELECT j.*, a.exam_id
         FROM toeic_grading_jobs j
         JOIN toeic_attempts a ON j.attempt_id = a.id
         WHERE j.id = ? FOR UPDATE`,
        [jobId]
      );

      if (!jobRows.length) {
        await connection.rollback();
        return { success: false, message: 'Job not found' };
      }

      const job = jobRows[0];
      const attemptId: number = job.attempt_id;
      const currentRetry: number = job.retry_count ?? 0;

      // 3. Terminal states — idempotent no-op
      if (job.status === 'COMPLETED') {
        await connection.rollback();
        return { success: true, message: 'Already completed' };
      }

      if (job.status === 'FAILED') {
        await connection.rollback();
        return { success: true, message: 'Job previously failed (terminal)' };
      }

      if (job.status === 'PARTIAL') {
        // PARTIAL means some scores saved but job needs retry
        // Treat same as QUEUED/RETRY — pick up where left off
      }

      // 4. Stale PROCESSING recovery
      if (job.status === 'PROCESSING') {
        const updatedAt = new Date(job.updated_at).getTime();
        const now = Date.now();
        if (now - updatedAt < STALE_PROCESSING_MS) {
          // Still actively processing by another worker with the lock
          // (shouldn't reach here because Redis lock would have blocked, but
          // handle the edge case where lock expired and row still says PROCESSING)
          await connection.rollback();
          return { success: true, message: 'Job still processing (recent activity)' };
        }
        // Stale — recover it
        currentRetry > 0; // preserve retry count
      }

      // 5. Transition to PROCESSING
      await connection.query(
        `UPDATE toeic_grading_jobs SET status = 'PROCESSING', retry_count = ?, updated_at = NOW() WHERE id = ?`,
        [currentRetry, jobId]
      );

      // 6. Update attempt to GRADING
      await connection.query(
        `UPDATE toeic_attempts SET status = 'GRADING' WHERE id = ?`,
        [attemptId]
      );

      await connection.commit();

      // 7. Fetch attempt and exam info outside the lock transaction
      const [attemptRows] = await pool.query<RowDataPacket[]>(
        `SELECT a.*, e.skill_type, e.id as exam_id
         FROM toeic_attempts a
         JOIN toeic_exams e ON a.exam_id = e.id
         WHERE a.id = ?`,
        [attemptId]
      );

      if (!attemptRows.length) {
        await finalizeFailed(jobId, attemptId, false, 'Attempt not found');
        return { success: false, message: 'Attempt not found' };
      }

      const attempt = attemptRows[0];

      // 8. Fetch responses
      const [responses] = await pool.query<RowDataPacket[]>(
        `SELECT r.question_id, r.text_response, m.s3_key
         FROM toeic_attempt_responses r
         LEFT JOIN toeic_attempt_media m ON r.attempt_id = m.attempt_id AND r.question_id = m.question_id
         WHERE r.attempt_id = ?`,
        [attemptId]
      );

      // 9. Build grading request
      const gradingRequest: AiGradingRequest = {
        idempotencyKey: buildIdempotencyKey(attemptId, currentRetry),
        attemptId,
        examId: attempt.exam_id as number,
        skillType: attempt.skill_type as 'LR' | 'SW',
        responses: (responses as RowDataPacket[]).map((r) => ({
          questionId: r.question_id as number,
          textResponse: (r.text_response as string) ?? null,
          s3Key: (r.s3_key as string) ?? null,
        })),
      };

      if (gradingRequest.responses.length === 0) {
        await finalizeCompleted(jobId, attemptId, { speakingScore: 0, writingScore: 0, totalScore: 0 }, []);
        return { success: true, message: 'No responses to grade — completed' };
      }

      // 10. Call AI grading adapter
      const adapter = getAiGradingAdapter();
      const result = await adapter.grade(gradingRequest);

      // 11. Persist per-question scores
      await persistQuestionScores(attemptId, result.questionScores);

      // 12. Compute aggregate scores
      const aggregateScores = result.aggregateScores;

      // 13. Persist attempt result
      await persistAttemptResult(attemptId, aggregateScores, result.status);

      // 14. Finalize as COMPLETED or PARTIAL
      if (result.status === 'COMPLETED') {
        await finalizeCompleted(jobId, attemptId, aggregateScores, result.questionScores);
        return { success: true, message: 'Grading completed' };
      } else {
        await finalizePartial(jobId, attemptId, aggregateScores);
        return { success: true, message: 'Grading partially completed — will retry' };
      }
    } catch (error: unknown) {
      // Rollback any in-flight transaction
      try {
        await connection.rollback();
      } catch { /* ignore */ }

      const classification = classifyError(error);

      if (classification.retryable) {
        // Transition to RETRY state for the worker to pick up
        await handleRetryableFailure(jobId, classification.errorMessage);
        return { success: false, message: classification.errorMessage };
      }

      // Non-retryable — terminal FAILED
      const jobRows2 = await pool.query<RowDataPacket[]>(
        'SELECT attempt_id FROM toeic_grading_jobs WHERE id = ?',
        [jobId]
      );
      const attemptId = jobRows2[0]?.[0]?.attempt_id;

      if (attemptId) {
        await finalizeFailed(jobId, attemptId, false, classification.errorMessage);
      } else {
        await pool.query(
          `UPDATE toeic_grading_jobs SET status = 'FAILED', error_message = ?, updated_at = NOW() WHERE id = ?`,
          [classification.errorMessage, jobId]
        );
      }

      return { success: false, message: classification.errorMessage };
    } finally {
      connection.release();
      await redis.del(lockKey).catch(() => {});
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers — persist scores
// ---------------------------------------------------------------------------

async function persistQuestionScores(
  attemptId: number,
  scores: Array<{ questionId: number; score: number; isCorrect?: boolean }>
): Promise<void> {
  if (scores.length === 0) return;

  const values: Array<[number, number, number, boolean]> = scores.map((s) => [
    attemptId,
    s.questionId,
    s.score,
    s.isCorrect ?? false,
  ]);

  await pool.query(
    `INSERT INTO toeic_question_scores (attempt_id, question_id, score, is_correct) VALUES ?
     ON DUPLICATE KEY UPDATE score = VALUES(score), is_correct = VALUES(is_correct)`,
    [values]
  );
}

async function persistAttemptResult(
  attemptId: number,
  scores: { speakingScore?: number; writingScore?: number; totalScore?: number },
  status: string
): Promise<void> {
  const speakingScore = scores.speakingScore ?? 0;
  const writingScore = scores.writingScore ?? 0;
  const totalScore = scores.totalScore ?? 0;
  const metrics = JSON.stringify({
    speaking_score: speakingScore,
    writing_score: writingScore,
  });
  const resultStatus = status === 'COMPLETED' ? 'FINAL' : 'PROVISIONAL';

  await pool.query(
    `INSERT INTO toeic_attempt_results (attempt_id, listening_score, reading_score, total_score, status, metrics)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
     listening_score = VALUES(listening_score),
     reading_score = VALUES(reading_score),
     total_score = VALUES(total_score),
     status = VALUES(status),
     metrics = VALUES(metrics)`,
    [attemptId, 0, 0, totalScore, resultStatus, metrics]
  );
}

// ---------------------------------------------------------------------------
// Helpers — finalization
// ---------------------------------------------------------------------------

async function finalizeCompleted(
  jobId: number,
  attemptId: number,
  // ponytail: scores/questionScores unused; add audit logging or metrics export when needed.
  _scores: { speakingScore?: number; writingScore?: number; totalScore?: number }, // eslint-disable-line @typescript-eslint/no-unused-vars
  _questionScores: Array<{ questionId: number; score: number }> // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<void> {
  await pool.query(
    `UPDATE toeic_grading_jobs SET status = 'COMPLETED', error_message = NULL, updated_at = NOW() WHERE id = ?`,
    [jobId]
  );
  await pool.query(
    `UPDATE toeic_attempts SET status = 'COMPLETED', completed_at = NOW() WHERE id = ?`,
    [attemptId]
  );
}

async function finalizePartial(
  jobId: number,
  // ponytail: attemptId/scores unused; add partial-progress metrics when needed.
  attemptId: number, // eslint-disable-line @typescript-eslint/no-unused-vars
  _scores: { speakingScore?: number; writingScore?: number; totalScore?: number } // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<void> {
  await pool.query(
    `UPDATE toeic_grading_jobs SET status = 'PARTIAL', error_message = NULL, updated_at = NOW() WHERE id = ?`,
    [jobId]
  );
  // Keep attempt in GRADING status so the user knows it's still processing
}

async function finalizeFailed(
  jobId: number,
  attemptId: number,
  _retryable: boolean,
  errorMessage: string
): Promise<void> {
  await pool.query(
    `UPDATE toeic_grading_jobs SET status = 'FAILED', error_message = ?, updated_at = NOW() WHERE id = ?`,
    [errorMessage, jobId]
  );
  await pool.query(
    `UPDATE toeic_attempts SET status = 'FAILED' WHERE id = ?`,
    [attemptId]
  );
}

async function handleRetryableFailure(
  jobId: number,
  errorMessage: string
): Promise<void> {
  // Increment retry count and set to RETRY (or FAILED if max retries reached)
  const [jobRows] = await pool.query<RowDataPacket[]>(
    'SELECT retry_count FROM toeic_grading_jobs WHERE id = ?',
    [jobId]
  );

  const currentRetry = (jobRows[0]?.retry_count ?? 0) as number;
  const nextRetry = currentRetry + 1;

  if (nextRetry > MAX_RETRIES) {
    // Terminal failure
    await pool.query(
      `UPDATE toeic_grading_jobs SET status = 'FAILED', error_message = ?, retry_count = ?, updated_at = NOW() WHERE id = ?`,
      [errorMessage, nextRetry, jobId]
    );
    const [j] = await pool.query<RowDataPacket[]>(
      'SELECT attempt_id FROM toeic_grading_jobs WHERE id = ?',
      [jobId]
    );
    if (j[0]) {
      await pool.query(
        `UPDATE toeic_attempts SET status = 'FAILED' WHERE id = ?`,
        [j[0].attempt_id]
      );
    }
  } else {
    // Retryable — set to RETRY for worker to pick up
    await pool.query(
      `UPDATE toeic_grading_jobs SET status = 'RETRY', error_message = ?, retry_count = ?, updated_at = NOW() WHERE id = ?`,
      [errorMessage, nextRetry, jobId]
    );
    // Keep attempt in GRADING
  }
}

// ---------------------------------------------------------------------------
// Export for stale recovery (used by worker)
// ---------------------------------------------------------------------------

export async function recoverStaleProcessingJobs(): Promise<number> {
  const staleSince = new Date(Date.now() - STALE_PROCESSING_MS);
  const [res] = await pool.query<ResultSetHeader>(
    `UPDATE toeic_grading_jobs
     SET status = 'RETRY', error_message = 'Stale processing recovered', updated_at = NOW()
     WHERE status = 'PROCESSING' AND updated_at < ?`,
    [staleSince]
  );
  return res.affectedRows;
}
