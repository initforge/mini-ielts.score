import { z } from 'zod';

/**
 * R3-SECURITY: PM2 worker env split.
 *
 * The web server and the grading worker need different env surfaces. The
 * server schema is strict about CORS/trust-proxy/port; the worker schema is
 * the minimal set the worker touches (DB, Redis, AI adapter, JWT_SECRET to
 * fail closed against placeholder secrets).
 *
 * JWT_SECRET fails closed on the documented placeholder string — PM2 ships
 * 'REPLACE_WITH_STRONG_SECRET_32+chars' and the worker/server refuse to boot
 * until an operator sets a real secret on the VPS.
 */

const JWT_SECRET_MIN = 32;
const PLACEHOLDER_RE = /REPLACE_WITH/i;

const jwtSecretSchema = z
  .string()
  .min(JWT_SECRET_MIN, 'JWT_SECRET is required and must be at least 32 characters')
  .refine((s) => !PLACEHOLDER_RE.test(s), {
    message:
      "JWT_SECRET must not be a placeholder (contains 'REPLACE_WITH') — PM2/VPS must supply a real secret",
  })
  .refine((s) => s !== 'change-me-please-change-me-please-1234', {
    message: 'JWT_SECRET must not be the documented placeholder',
  });

const dbFields = {
  DB_HOST: z.string().min(1, 'DB_HOST is required'),
  DB_PORT: z.string().regex(/^\d+$/, 'DB_PORT must be numeric').default('3306'),
  DB_USER: z.string().min(1, 'DB_USER is required'),
  DB_PASSWORD: z.string().optional().default(''),
  DB_NAME: z.string().min(1, 'DB_NAME is required'),
};

const aiFields = {
  CLOUDFLARE_AI_WORKER_URL: z.string().optional(),
  CLOUDFLARE_AI_WORKER_TOKEN: z.string().optional(),
  // R2-SEC-FIX: mirrors ai-grading.adapter.ts default (60000ms, clamped 5000-300000).
  CLOUDFLARE_AI_TIMEOUT_MS: z
    .string()
    .regex(/^\d+$/, 'CLOUDFLARE_AI_TIMEOUT_MS must be numeric')
    .default('60000'),
  AI_GRADING_TEST_MODE: z.enum(['true', 'false']).default('false'),
};

export const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().default('7000'),
  ...dbFields,
  JWT_SECRET: jwtSecretSchema,
  JWT_EXPIRES_IN: z.string().default('7d'),
  CORS_ORIGIN: z
    .string()
    .default('http://localhost:5173')
    // R3-SECURITY: server.ts always sends credentials:true. CORS spec forbids
    // '*' together with credentials — browsers reject such responses. Fail
    // closed at boot instead of shipping an unusable CORS policy.
    .refine((v) => v !== '*', {
      message:
        "CORS_ORIGIN='*' is forbidden: server.ts always sets credentials:true, and browsers reject '*' with credentials — use an explicit origin list",
    }),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  ...aiFields,
  TRUST_PROXY: z.enum(['true', 'false']).default('false'),
  // S3 — OPTIONAL. MinIO local uses S3_ENDPOINT/S3_REGION/S3_ACCESS_KEY/
  // S3_SECRET_KEY; production AWS uses the same names (media.adapter.ts falls
  // back to the legacy AWS_* names when the S3_* are absent).
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  // Legacy AWS names still accepted (media.adapter fallback path).
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().optional(),
});

export const workerEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  ...dbFields,
  REDIS_URL: z.string().default('redis://localhost:6379'),
  // The worker never verifies JWTs (no auth), but keeping JWT_SECRET here
  // makes the schema reject placeholder secrets at worker boot too — the
  // ecosystem file must carry a real secret for BOTH apps.
  JWT_SECRET: jwtSecretSchema,
  ...aiFields,
});

export type ServerEnvConfig = z.infer<typeof serverEnvSchema>;
export type WorkerEnvConfig = z.infer<typeof workerEnvSchema>;
// Backward-compat alias for any import that still uses the old name.
export type EnvConfig = ServerEnvConfig;

function parseOrThrow(
  schema: z.ZodTypeAny,
  toParse: Record<string, unknown>,
  scope: 'server' | 'worker'
) {
  const parsed = schema.safeParse(toParse);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
    const errorMsg = `Environment validation failed (${scope}): ${issues}`;
    console.error('❌ ' + errorMsg);
    throw new Error(errorMsg);
  }
  return parsed.data;
}

function guardAiTestMode(env: { NODE_ENV: string; AI_GRADING_TEST_MODE: string }): void {
  // INJ-003: never allow deterministic fake grading in production.
  if (env.NODE_ENV === 'production' && env.AI_GRADING_TEST_MODE === 'true') {
    const errorMsg = 'Environment validation failed: AI_GRADING_TEST_MODE=true is forbidden in production';
    console.error('❌ ' + errorMsg);
    throw new Error(errorMsg);
  }
}

function baseDefaults(source: Record<string, string | undefined>) {
  const isProd = source.NODE_ENV === 'production';
  return {
    NODE_ENV: source.NODE_ENV || 'development',
    DB_HOST: source.DB_HOST ?? (isProd ? '' : 'localhost'),
    DB_PORT: source.DB_PORT ?? '3306',
    DB_USER: source.DB_USER ?? (isProd ? '' : 'root'),
    DB_PASSWORD: source.DB_PASSWORD ?? '',
    DB_NAME: source.DB_NAME ?? (isProd ? '' : 'anish_toeic'),
    JWT_SECRET: source.JWT_SECRET ?? '',
    REDIS_URL: source.REDIS_URL ?? 'redis://localhost:6379',
    CLOUDFLARE_AI_WORKER_URL: source.CLOUDFLARE_AI_WORKER_URL ?? '',
    CLOUDFLARE_AI_WORKER_TOKEN: source.CLOUDFLARE_AI_WORKER_TOKEN ?? '',
    CLOUDFLARE_AI_TIMEOUT_MS: source.CLOUDFLARE_AI_TIMEOUT_MS ?? '60000',
    AI_GRADING_TEST_MODE: source.AI_GRADING_TEST_MODE ?? 'false',
  };
}

export function validateServerEnv(customEnv?: Record<string, string | undefined>): ServerEnvConfig {
  const source = customEnv || process.env;
  const defaults = {
    ...baseDefaults(source),
    PORT: source.PORT ?? '7000',
    JWT_EXPIRES_IN: source.JWT_EXPIRES_IN ?? '7d',
    CORS_ORIGIN: source.CORS_ORIGIN ?? 'http://localhost:5173',
    TRUST_PROXY: source.TRUST_PROXY ?? 'false',
    S3_ENDPOINT: source.S3_ENDPOINT ?? '',
    S3_REGION: source.S3_REGION ?? '',
    S3_BUCKET: source.S3_BUCKET ?? '',
    S3_ACCESS_KEY: source.S3_ACCESS_KEY ?? '',
    S3_SECRET_KEY: source.S3_SECRET_KEY ?? '',
    AWS_ACCESS_KEY_ID: source.AWS_ACCESS_KEY_ID ?? '',
    AWS_SECRET_ACCESS_KEY: source.AWS_SECRET_ACCESS_KEY ?? '',
    AWS_REGION: source.AWS_REGION ?? '',
  };

  const parsed = parseOrThrow(serverEnvSchema, { ...defaults, ...source }, 'server');
  guardAiTestMode(parsed);
  return parsed;
}

export function validateWorkerEnv(customEnv?: Record<string, string | undefined>): WorkerEnvConfig {
  const source = customEnv || process.env;
  const parsed = parseOrThrow(workerEnvSchema, { ...baseDefaults(source), ...source }, 'worker');
  guardAiTestMode(parsed);
  return parsed;
}

// Backward-compat alias (old single-schema entry point).
export const validateEnv = validateServerEnv;
