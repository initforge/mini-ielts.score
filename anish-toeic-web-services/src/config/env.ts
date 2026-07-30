import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().default('7000'),
  DB_HOST: z.string().min(1, 'DB_HOST is required'),
  DB_USER: z.string().min(1, 'DB_USER is required'),
  DB_PASSWORD: z.string().optional().default(''),
  DB_NAME: z.string().min(1, 'DB_NAME is required'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(customEnv?: Record<string, string | undefined>): EnvConfig {
  const source = customEnv || process.env;

  const isProd = source.NODE_ENV === 'production';
  const defaults = {
    NODE_ENV: source.NODE_ENV || 'development',
    PORT: source.PORT || '7000',
    DB_HOST: source.DB_HOST ?? (isProd ? '' : 'localhost'),
    DB_USER: source.DB_USER ?? (isProd ? '' : 'root'),
    DB_PASSWORD: source.DB_PASSWORD ?? '',
    DB_NAME: source.DB_NAME ?? (isProd ? '' : 'anish_toeic'),
    CORS_ORIGIN: source.CORS_ORIGIN ?? 'http://localhost:5173',
  };

  const toParse = { ...defaults, ...source };

  const parsed = envSchema.safeParse(toParse);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
    const errorMsg = `Environment validation failed: ${issues}`;
    console.error('❌ ' + errorMsg);
    throw new Error(errorMsg);
  }

  return parsed.data;
}
