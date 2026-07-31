/**
 * Provider-neutral AI grading adapter.
 *
 * Grading calls for SW (speaking/writing) exams are delegated to a Cloudflare
 * AI Worker over HTTP. This adapter defines the contract and provides:
 *  - a deterministic test double (CI / unit tests)
 *  - a production Cloudflare AI Worker adapter
 *
 * The adapter NEVER accepts or returns audio/content directly; it only
 * forwards metadata required for the Worker to fetch media from S3.
 *
 * Missing configuration = AI_PROVIDER_NOT_CONFIGURED (not random scores).
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Request / response schemas
// ---------------------------------------------------------------------------

export const aiGradingRequestSchema = z.object({
  idempotencyKey: z.string().min(1).max(128),
  attemptId: z.number().int().positive(),
  examId: z.number().int().positive(),
  skillType: z.enum(['LR', 'SW']),
  responses: z.array(
    z.object({
      questionId: z.number().int().positive(),
      textResponse: z.string().max(50000).nullable(),
      s3Key: z.string().max(1024).nullable(),
    })
  ).max(200),
});

export const aiGradingResponseSchema = z.object({
  status: z.enum(['COMPLETED', 'PARTIAL']),
  questionScores: z.array(
    z.object({
      questionId: z.number().int().positive(),
      score: z.number().int().min(0).max(200),
      isCorrect: z.boolean().optional(),
      aiConfidence: z.number().min(0).max(1).optional(),
    })
  ).max(200),
  aggregateScores: z.object({
    speakingScore: z.number().int().min(0).max(200).optional(),
    writingScore: z.number().int().min(0).max(200).optional(),
    totalScore: z.number().int().min(0).max(400).optional(),
  }),
  workerTraceId: z.string().max(256).optional(),
});

export type AiGradingRequest = z.infer<typeof aiGradingRequestSchema>;
export type AiGradingResponse = z.infer<typeof aiGradingResponseSchema>;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class AiProviderNotConfiguredError extends Error {
  public readonly code = 'AI_PROVIDER_NOT_CONFIGURED';
  constructor() {
    super('AI grading provider is not configured. Set CLOUDFLARE_AI_WORKER_URL and CLOUDFLARE_AI_WORKER_TOKEN.');
    this.name = 'AiProviderNotConfiguredError';
  }
}

export class AiProviderTimeoutError extends Error {
  public readonly code = 'AI_PROVIDER_TIMEOUT';
  public readonly retryable = true;
  constructor(timeoutMs: number) {
    super(`AI grading provider timed out after ${timeoutMs}ms`);
    this.name = 'AiProviderTimeoutError';
  }
}

export class AiProviderRetryableError extends Error {
  public readonly code = 'AI_PROVIDER_RETRYABLE';
  public readonly retryable = true;
  constructor(message: string) {
    super(message);
    this.name = 'AiProviderRetryableError';
  }
}

export class AiProviderNonRetryableError extends Error {
  public readonly code = 'AI_PROVIDER_NON_RETRYABLE';
  public readonly retryable = false;
  constructor(message: string) {
    super(message);
    this.name = 'AiProviderNonRetryableError';
  }
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface AiGradingAdapter {
  grade(request: AiGradingRequest, signal?: AbortSignal): Promise<AiGradingResponse>;
}

// ---------------------------------------------------------------------------
// Deterministic test double
// ---------------------------------------------------------------------------

/**
 * Deterministic test double: produces predictable scores from questionId.
 * questionId 1-4 → score 0 (fail), 5-8 → score 2, 9+ → score 4.
 * Speaking/Writing aggregate scores are derived from sum of per-question
 * scores scaled to 0-200 range.
 */
export function createTestAiGradingAdapter(): AiGradingAdapter {
  return {
    // ponytail: signal unused in test double; add cancellation when wiring real abort propagation.
    async grade(request: AiGradingRequest, _signal?: AbortSignal): Promise<AiGradingResponse> { // eslint-disable-line @typescript-eslint/no-unused-vars
      const questionScores = request.responses.map((r) => {
        let score: number;
        if (r.questionId <= 4) score = 0;
        else if (r.questionId <= 8) score = 2;
        else score = 4;
        return { questionId: r.questionId, score, isCorrect: score > 0, aiConfidence: 0.9 };
      });

      const totalRaw = questionScores.reduce((sum, qs) => sum + qs.score, 0);
      const maxRaw = request.responses.length * 4;
      const scaled = maxRaw > 0 ? Math.round((totalRaw / maxRaw) * 200) : 0;

      return {
        status: 'COMPLETED',
        questionScores,
        aggregateScores: {
          speakingScore: scaled,
          writingScore: scaled,
          totalScore: scaled * 2,
        },
        workerTraceId: `test-trace-${request.attemptId}`,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Production Cloudflare AI Worker adapter
// ---------------------------------------------------------------------------

interface CloudflareAiConfig {
  workerUrl: string;
  workerToken: string;
  timeoutMs: number;
}

function buildCloudflareConfig(): CloudflareAiConfig | null {
  const workerUrl = process.env.CLOUDFLARE_AI_WORKER_URL;
  const workerToken = process.env.CLOUDFLARE_AI_WORKER_TOKEN;
  const timeoutMsRaw = process.env.CLOUDFLARE_AI_TIMEOUT_MS;

  if (!workerUrl || !workerToken) return null;

  const timeoutMs = timeoutMsRaw ? parseInt(timeoutMsRaw, 10) : 60000;
  return {
    workerUrl: workerUrl.replace(/\/+$/, ''),
    workerToken,
    timeoutMs: Math.max(5000, Math.min(300000, timeoutMs)),
  };
}

const RETRYABLE_STATUS_CODES = new Set([408, 429, 502, 503, 504]);

function sanitizeErrorForLogging(message: string): string {
  return message
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/token[=:]\s*\S+/gi, 'token=[REDACTED]')
    .replace(/key[=:]\s*\S+/gi, 'key=[REDACTED]')
    .substring(0, 500);
}

class CloudflareAiGradingAdapter implements AiGradingAdapter {
  private readonly config: CloudflareAiConfig;

  constructor(config: CloudflareAiConfig) {
    this.config = config;
  }

  async grade(request: AiGradingRequest, signal?: AbortSignal): Promise<AiGradingResponse> {
    // Validate the request that will be sent
    const parsed = aiGradingRequestSchema.safeParse(request);
    if (!parsed.success) {
      throw new AiProviderNonRetryableError(
        `Invalid grading request: ${parsed.error.issues.map((i) => i.message).join(', ')}`
      );
    }

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), this.config.timeoutMs);

    if (signal) {
      signal.addEventListener('abort', () => abortController.abort());
    }

    try {
      const response = await fetch(`${this.config.workerUrl}/api/grade`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.workerToken}`,
          'X-Idempotency-Key': parsed.data.idempotencyKey,
        },
        body: JSON.stringify(parsed.data),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const status = response.status;
        let bodyText = '';
        try {
          bodyText = await response.text();
        } catch { /* ignore */ }

        const safeMsg = sanitizeErrorForLogging(
          `Cloudflare AI Worker returned ${status}: ${bodyText.substring(0, 200)}`
        );

        if (RETRYABLE_STATUS_CODES.has(status)) {
          throw new AiProviderRetryableError(safeMsg);
        }
        throw new AiProviderNonRetryableError(safeMsg);
      }

      const rawBody: unknown = await response.json();

      const validated = aiGradingResponseSchema.safeParse(rawBody);
      if (!validated.success) {
        // Log only validation issues, never raw body
        const issues = validated.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
        throw new AiProviderNonRetryableError(`Invalid AI Worker response: ${issues}`);
      }

      return validated.data;
    } catch (error: unknown) {
      if (
        error instanceof AiProviderRetryableError ||
        error instanceof AiProviderNonRetryableError
      ) {
        throw error;
      }
      if (error instanceof DOMException && error.name === 'AbortError') {
        // Distinguish timeout from client signal abort
        if (signal?.aborted) {
          throw new AiProviderRetryableError('Grading cancelled by upstream signal');
        }
        throw new AiProviderTimeoutError(this.config.timeoutMs);
      }
      // Network errors are retryable
      const msg = error instanceof Error ? error.message : String(error);
      throw new AiProviderRetryableError(`Network error: ${sanitizeErrorForLogging(msg)}`);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton accessor
// ---------------------------------------------------------------------------

let _adapter: AiGradingAdapter | null = null;
let _adapterError: Error | null = null;

export function getAiGradingAdapter(): AiGradingAdapter {
  if (_adapter) return _adapter;

  // Production mode: require Cloudflare config
  const cfg = buildCloudflareConfig();
  if (cfg) {
    _adapter = new CloudflareAiGradingAdapter(cfg);
    return _adapter;
  }

  // Test mode or explicitly configured test
  if (process.env.NODE_ENV === 'test' || process.env.AI_GRADING_TEST_MODE === 'true') {
    _adapter = createTestAiGradingAdapter();
    return _adapter;
  }

  // Not configured: throw, don't silently fall back
  _adapterError = new AiProviderNotConfiguredError();
  throw _adapterError;
}

/** For tests: inject a custom adapter */
export function setAiGradingAdapter(adapter: AiGradingAdapter | null): void {
  _adapter = adapter;
  _adapterError = null;
}

/** For tests: reset singleton */
export function resetAiGradingAdapter(): void {
  _adapter = null;
  _adapterError = null;
}
