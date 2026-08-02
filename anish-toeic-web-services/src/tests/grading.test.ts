/**
 * Grading lifecycle tests (S6-BE):
 *  - Idempotency (already COMPLETED / FAILED)
 *  - Duplicate worker lock via Redis
 *  - PROCESSING → COMPLETED via test adapter (deterministic mock)
 *  - PARTIAL state persistence
 *  - RETRY classification
 *  - Stale PROCESSING recovery
 *  - Sanitized error messages (no raw provider/token leakage)
 *  - Max retries → terminal FAILED
 */

import { GradingService, recoverStaleProcessingJobs } from '../services/grading.service';
import { pool } from '../services/db.service';
// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Jest hoists jest.mock above all code. Use a shared mutable holder so factories
// can reference fns that are assigned after hoisting (in describe/beforeEach).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mocks: Record<string, any> = {};

jest.mock('../services/db.service', () => ({
  pool: {
    getConnection: jest.fn(),
    query: jest.fn(),
  },
}));

jest.mock('../services/adapters/ai-grading.adapter', () => {
  const actual = jest.requireActual('../services/adapters/ai-grading.adapter');
  return {
    ...actual,
    getAiGradingAdapter: jest.fn(() => ({ grade: (...args: unknown[]) => mocks.aiGrade(...args) })),
    setAiGradingAdapter: jest.fn(),
    resetAiGradingAdapter: jest.fn(),
    AiProviderRetryableError: actual.AiProviderRetryableError,
    AiProviderNonRetryableError: actual.AiProviderNonRetryableError,
    AiProviderTimeoutError: actual.AiProviderTimeoutError,
    AiProviderNotConfiguredError: actual.AiProviderNotConfiguredError,
  };
});

jest.mock('ioredis', () => ({
  Redis: jest.fn().mockImplementation(() => ({
    set: (...args: unknown[]) => mocks.redisSet(...args),
    del: (...args: unknown[]) => mocks.redisDel(...args),
  })),
}));

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('GradingService — Durable Lifecycle (S6-BE)', () => {
  let mockConnection: {
    beginTransaction: jest.Mock;
    query: jest.Mock;
    commit: jest.Mock;
    rollback: jest.Mock;
    release: jest.Mock;
  };

  let mockAiGrade: jest.Mock;
  let mockRedisSet: jest.Mock;
  let mockRedisDel: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConnection = {
      beginTransaction: jest.fn(),
      query: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn(),
    };

    // Assign shared mocks AFTER hoisting — factories delegate through `mocks` holder.
    mockAiGrade = jest.fn();
    mockRedisSet = jest.fn().mockResolvedValue('OK');
    mockRedisDel = jest.fn().mockResolvedValue(1);
    mocks.aiGrade = mockAiGrade;
    mocks.redisSet = mockRedisSet;
    mocks.redisDel = mockRedisDel;

    (pool.getConnection as jest.Mock).mockResolvedValue(mockConnection);
  });

  // -----------------------------------------------------------------------
  // 1. Idempotency
  // -----------------------------------------------------------------------

  it('should return Already completed for COMPLETED jobs (idempotent)', async () => {
    mockConnection.query.mockResolvedValueOnce([
      [{ id: 1, attempt_id: 10, status: 'COMPLETED', retry_count: 0, exam_id: 100 }],
    ]);

    const result = await GradingService.processJob(1);

    expect(result.success).toBe(true);
    expect(result.message).toBe('Already completed');
    expect(mockConnection.rollback).toHaveBeenCalled();
  });

  it('should return terminal message for FAILED jobs', async () => {
    mockConnection.query.mockResolvedValueOnce([
      [{ id: 1, attempt_id: 10, status: 'FAILED', retry_count: 3, exam_id: 100 }],
    ]);

    const result = await GradingService.processJob(1);

    expect(result.success).toBe(true);
    expect(result.message).toContain('terminal');
  });

  it('should not process if Redis lock not acquired', async () => {
    mockRedisSet.mockResolvedValue(null); // lock not acquired

    const result = await GradingService.processJob(1);

    expect(result.success).toBe(true);
    expect(result.message).toContain('Lock not acquired');
    // Should not have touched DB
    expect(mockConnection.query).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 2. Full happy path: QUEUED → COMPLETED
  // -----------------------------------------------------------------------

  it('should process QUEUED job through to COMPLETED via test adapter', async () => {
    // Lock job
    mockConnection.query.mockResolvedValueOnce([
      [{ id: 1, attempt_id: 10, status: 'QUEUED', retry_count: 0, exam_id: 100 }],
    ]);
    // Update job to PROCESSING
    mockConnection.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    // Update attempt to GRADING
    mockConnection.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    // Commit
    mockConnection.commit.mockResolvedValue(undefined);

    // Fetch attempt
    (pool.query as jest.Mock).mockResolvedValueOnce([
      [{ id: 10, exam_id: 100, skill_type: 'SW', status: 'IN_PROGRESS' }],
    ]);
    // Fetch responses
    (pool.query as jest.Mock).mockResolvedValueOnce([
      [
        { question_id: 5, text_response: 'A good answer', s3_key: null },
        { question_id: 12, text_response: 'Another answer', s3_key: 'key2.mp3' },
      ],
    ]);

    // Mock AI adapter response
    mockAiGrade.mockResolvedValueOnce({
      status: 'COMPLETED',
      questionScores: [
        { questionId: 5, score: 2, isCorrect: true, aiConfidence: 0.9 },
        { questionId: 12, score: 4, isCorrect: true, aiConfidence: 0.95 },
      ],
      aggregateScores: { speakingScore: 150, writingScore: 150, totalScore: 300 },
      workerTraceId: 'trace-abc',
    });

    // Persist question scores
    (pool.query as jest.Mock).mockResolvedValueOnce([{ affectedRows: 2 }]);
    // Persist attempt result
    (pool.query as jest.Mock).mockResolvedValueOnce([{ affectedRows: 1 }]);
    // Finalize COMPLETED (job)
    (pool.query as jest.Mock).mockResolvedValueOnce([{ affectedRows: 1 }]);
    // Finalize COMPLETED (attempt)
    (pool.query as jest.Mock).mockResolvedValueOnce([{ affectedRows: 1 }]);

    const result = await GradingService.processJob(1);

    expect(result.success).toBe(true);
    expect(result.message).toBe('Grading completed');
    expect(mockConnection.commit).toHaveBeenCalled();

    // Verify AI adapter was called with correct idempotency key
    expect(mockAiGrade).toHaveBeenCalledTimes(1);
    const aiCall = mockAiGrade.mock.calls[0][0];
    expect(aiCall.idempotencyKey).toBe('grading-10-v0');
    expect(aiCall.attemptId).toBe(10);
    expect(aiCall.skillType).toBe('SW');
    expect(aiCall.responses).toHaveLength(2);
  });

  // -----------------------------------------------------------------------
  // 3. PARTIAL completion
  // -----------------------------------------------------------------------

  it('should set job to PARTIAL when AI returns PARTIAL status', async () => {
    mockConnection.query.mockResolvedValueOnce([
      [{ id: 1, attempt_id: 10, status: 'QUEUED', retry_count: 0, exam_id: 100 }],
    ]);
    mockConnection.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    mockConnection.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    mockConnection.commit.mockResolvedValue(undefined);

    (pool.query as jest.Mock).mockResolvedValueOnce([
      [{ id: 10, exam_id: 100, skill_type: 'SW', status: 'IN_PROGRESS' }],
    ]);
    (pool.query as jest.Mock).mockResolvedValueOnce([
      [{ question_id: 5, text_response: 'Partial', s3_key: null }],
    ]);

    mockAiGrade.mockResolvedValueOnce({
      status: 'PARTIAL',
      questionScores: [{ questionId: 5, score: 3, isCorrect: true, aiConfidence: 0.7 }],
      aggregateScores: { speakingScore: 75, writingScore: 0, totalScore: 75 },
      workerTraceId: 'trace-partial',
    });

    (pool.query as jest.Mock).mockResolvedValueOnce([{ affectedRows: 1 }]); // scores
    (pool.query as jest.Mock).mockResolvedValueOnce([{ affectedRows: 1 }]); // result
    (pool.query as jest.Mock).mockResolvedValueOnce([{ affectedRows: 1 }]); // job PARTIAL

    const result = await GradingService.processJob(1);

    expect(result.success).toBe(true);
    expect(result.message).toContain('partially completed');

    // Verify job was set to PARTIAL (not COMPLETED)
    const partialCall = (pool.query as jest.Mock).mock.calls.find(
      (c: [unknown, unknown?]) =>
        typeof c[0] === 'string' && c[0].includes("status = 'PARTIAL'")
    );
    expect(partialCall).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // 4. Retryable failure → RETRY state
  // -----------------------------------------------------------------------

  it('should set job to RETRY on retryable AI error', async () => {
    mockConnection.query.mockResolvedValueOnce([
      [{ id: 1, attempt_id: 10, status: 'QUEUED', retry_count: 0, exam_id: 100 }],
    ]);
    mockConnection.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    mockConnection.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    mockConnection.commit.mockResolvedValue(undefined);

    (pool.query as jest.Mock).mockResolvedValueOnce([
      [{ id: 10, exam_id: 100, skill_type: 'SW', status: 'IN_PROGRESS' }],
    ]);
    (pool.query as jest.Mock).mockResolvedValueOnce([
      [{ question_id: 5, text_response: 'Test', s3_key: null }],
    ]);

    // Throw retryable error
    const { AiProviderTimeoutError } = jest.requireActual(
      '../services/adapters/ai-grading.adapter'
    );
    mockAiGrade.mockRejectedValueOnce(new AiProviderTimeoutError(60000));

    // handleRetryableFailure: read retry_count
    (pool.query as jest.Mock).mockResolvedValueOnce([[{ retry_count: 0 }]]);
    // Update job to RETRY (retry 1)
    (pool.query as jest.Mock).mockResolvedValueOnce([{ affectedRows: 1 }]);

    const result = await GradingService.processJob(1);

    expect(result.success).toBe(false);
    expect(result.message).toContain('AI_PROVIDER_ERROR');

    // Verify RETRY status was set
    const retryCall = (pool.query as jest.Mock).mock.calls.find(
      (c: unknown[]) =>
        typeof c[0] === 'string' && c[0].includes("status = 'RETRY'")
    );
    expect(retryCall).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // 5. Max retries → terminal FAILED
  // -----------------------------------------------------------------------

  it('should fail terminally after MAX_RETRIES (3)', async () => {
    mockConnection.query.mockResolvedValueOnce([
      [{ id: 1, attempt_id: 10, status: 'QUEUED', retry_count: 3, exam_id: 100 }],
    ]);
    mockConnection.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    mockConnection.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    mockConnection.commit.mockResolvedValue(undefined);

    (pool.query as jest.Mock).mockResolvedValueOnce([
      [{ id: 10, exam_id: 100, skill_type: 'SW', status: 'IN_PROGRESS' }],
    ]);
    (pool.query as jest.Mock).mockResolvedValueOnce([
      [{ question_id: 5, text_response: 'Test', s3_key: null }],
    ]);

    const { AiProviderTimeoutError } = jest.requireActual(
      '../services/adapters/ai-grading.adapter'
    );
    mockAiGrade.mockRejectedValueOnce(new AiProviderTimeoutError(60000));

    // handleRetryableFailure: read retry_count = 3
    (pool.query as jest.Mock).mockResolvedValueOnce([[{ retry_count: 3 }]]);
    // nextRetry = 4 > MAX_RETRIES=3 → FAILED
    (pool.query as jest.Mock).mockResolvedValueOnce([{ affectedRows: 1 }]);
    // Read attempt_id
    (pool.query as jest.Mock).mockResolvedValueOnce([[{ attempt_id: 10 }]]);
    // Update attempt to FAILED
    (pool.query as jest.Mock).mockResolvedValueOnce([{ affectedRows: 1 }]);

    const result = await GradingService.processJob(1);

    expect(result.success).toBe(false);

    const failedCall = (pool.query as jest.Mock).mock.calls.find(
      (c: unknown[]) =>
        typeof c[0] === 'string' && c[0].includes("status = 'FAILED'") &&
        c[0].includes('toeic_grading_jobs')
    );
    expect(failedCall).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // 6. Stale PROCESSING recovery
  // -----------------------------------------------------------------------

  it('should recover stale PROCESSING jobs (transition to RETRY)', async () => {
    // Job is PROCESSING but stale (updated more than 10 min ago)
    const staleDate = new Date(Date.now() - 11 * 60 * 1000);
    mockConnection.query.mockResolvedValueOnce([
      [
        {
          id: 1,
          attempt_id: 10,
          status: 'PROCESSING',
          retry_count: 1,
          updated_at: staleDate.toISOString(),
          exam_id: 100,
        },
      ],
    ]);
    // Transition stale job to RETRY
    mockConnection.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    // Commit after RETRY transition
    mockConnection.commit.mockResolvedValue(undefined);

    const result = await GradingService.processJob(1);

    expect(result.success).toBe(true);
    expect(result.message).toBe('Stale job recovered — will retry');

    // Verify RETRY was set
    const retryCall = mockConnection.query.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes("status = 'RETRY'")
    );
    expect(retryCall).toBeDefined();
    expect(retryCall![1][0]).toBe(1); // jobId
  });

  it('should skip actively processing jobs (updated recently)', async () => {
    const recentDate = new Date(); // just now
    mockConnection.query.mockResolvedValueOnce([
      [
        {
          id: 1,
          attempt_id: 10,
          status: 'PROCESSING',
          retry_count: 0,
          updated_at: recentDate.toISOString(),
          exam_id: 100,
        },
      ],
    ]);

    const result = await GradingService.processJob(1);

    expect(result.success).toBe(true);
    expect(result.message).toContain('still processing');
    expect(mockConnection.rollback).toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 7. Error sanitization (no tokens, no raw provider messages)
  // -----------------------------------------------------------------------

  it('should sanitize error messages — no tokens or raw data', async () => {
    mockConnection.query.mockResolvedValueOnce([
      [{ id: 1, attempt_id: 10, status: 'QUEUED', retry_count: 0, exam_id: 100 }],
    ]);
    mockConnection.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    mockConnection.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    mockConnection.commit.mockResolvedValue(undefined);

    (pool.query as jest.Mock).mockResolvedValueOnce([
      [{ id: 10, exam_id: 100, skill_type: 'SW', status: 'IN_PROGRESS' }],
    ]);
    (pool.query as jest.Mock).mockResolvedValueOnce([
      [{ question_id: 5, text_response: 'Test', s3_key: null }],
    ]);

    // Non-retryable error with a sensitive message
    const { AiProviderNonRetryableError } = jest.requireActual(
      '../services/adapters/ai-grading.adapter'
    );
    mockAiGrade.mockRejectedValueOnce(
      new AiProviderNonRetryableError('Bearer sk-abc123456789 invalid key at /api/grade.ts:42 error')
    );

    // handleRetryableFailure or finalizeFailed...
    // Non-retryable goes to finalizeFailed branch
    // But our classifyError catches AiProviderNonRetryableError
    // Let me trace the code...
    //
    // catch block:
    //   classifyError → non-retryable
    //   classification.retryable is false
    //   → reads attempt_id from pool.query
    (pool.query as jest.Mock).mockResolvedValueOnce([
      [{ attempt_id: 10 }],
    ]);
    // → finalizeFailed
    (pool.query as jest.Mock).mockResolvedValueOnce([{ affectedRows: 1 }]);
    (pool.query as jest.Mock).mockResolvedValueOnce([{ affectedRows: 1 }]);

    const result = await GradingService.processJob(1);

    expect(result.success).toBe(false);
    // Error message should NOT contain the raw token
    expect(result.message).not.toContain('sk-abc');
    expect(result.message).not.toContain('at /api/grade.ts:42');

    // Verify DB error_message is sanitized
    const failedDbCall = (pool.query as jest.Mock).mock.calls.find(
      (c: unknown[]) =>
        typeof c[0] === 'string' &&
        c[0].includes("status = 'FAILED'") &&
        c[1] &&
        Array.isArray(c[1]) && typeof c[1][0] === 'string'
    );
    if (failedDbCall) {
      expect(failedDbCall[1][0]).not.toContain('sk-abc');
    }
  });

  // -----------------------------------------------------------------------
  // 8. No responses edge case
  // -----------------------------------------------------------------------

  it('should complete immediately when no responses exist', async () => {
    mockConnection.query.mockResolvedValueOnce([
      [{ id: 1, attempt_id: 10, status: 'QUEUED', retry_count: 0, exam_id: 100 }],
    ]);
    mockConnection.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    mockConnection.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    mockConnection.commit.mockResolvedValue(undefined);

    (pool.query as jest.Mock).mockResolvedValueOnce([
      [{ id: 10, exam_id: 100, skill_type: 'SW', status: 'IN_PROGRESS' }],
    ]);
    // No responses
    (pool.query as jest.Mock).mockResolvedValueOnce([[]]);

    // persistAttemptResult (zero scores, FINAL)
    (pool.query as jest.Mock).mockResolvedValueOnce([{ affectedRows: 1 }]);
    // finalizeCompleted
    (pool.query as jest.Mock).mockResolvedValueOnce([{ affectedRows: 1 }]);
    (pool.query as jest.Mock).mockResolvedValueOnce([{ affectedRows: 1 }]);

    const result = await GradingService.processJob(1);

    expect(result.success).toBe(true);
    expect(result.message).toContain('No responses');
    // AI adapter should NOT have been called
    expect(mockAiGrade).not.toHaveBeenCalled();

    // Regression (INJ-003 BUG 2): a results row must still be inserted so
    // GET /toeic-attempts/:id/result returns 200, not 404 forever.
    const resultInsert = (pool.query as jest.Mock).mock.calls.find(
      (c: unknown[]) =>
        typeof c[0] === 'string' &&
        c[0].includes('INSERT INTO toeic_attempt_results') &&
        c[0].includes('ON DUPLICATE KEY UPDATE')
    );
    expect(resultInsert).toBeDefined();
    const [, params] = resultInsert as [string, unknown[]];
    expect(params[0]).toBe(10); // attempt_id
    expect(params[1]).toBe(0); // listening_score
    expect(params[2]).toBe(0); // reading_score
    expect(params[3]).toBe(0); // total_score
    expect(params[4]).toBe('FINAL'); // result status

    // Attempt must end COMPLETED
    const attemptFinalize = (pool.query as jest.Mock).mock.calls.find(
      (c: unknown[]) =>
        typeof c[0] === 'string' &&
        c[0].includes("toeic_attempts SET status = 'COMPLETED'")
    );
    expect(attemptFinalize).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // 9. Recover stale: no stale jobs
  // -----------------------------------------------------------------------

  it('recoverStaleProcessingJobs should return 0 when none stale', async () => {
    (pool.query as jest.Mock).mockResolvedValueOnce([{ affectedRows: 0 }]);

    const count = await recoverStaleProcessingJobs();

    expect(count).toBe(0);
  });

  // -----------------------------------------------------------------------
  // 10. DB error handling
  // -----------------------------------------------------------------------

  it('should handle connection-level failure and release connection', async () => {
    // Lock acquired
    // FOR UPDATE fails
    mockConnection.query.mockRejectedValueOnce(new Error('Database connection lost'));

    // Non-retryable (DB error) → fall through
    // Read attempt_id fails too but caught
    (pool.query as jest.Mock).mockResolvedValueOnce([[]]); // attempt from grading_jobs

    const result = await GradingService.processJob(1);

    // Service catches DB errors and returns failure (does not rethrow)
    expect(result.success).toBe(false);
    // Connection was released
    expect(mockConnection.release).toHaveBeenCalled();
    // Redis lock was released
    expect(mockRedisDel).toHaveBeenCalled();
  });
});
