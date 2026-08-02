// PM2 ecosystem config for production — S7: targets anish-toeic-web-services on :7000
// R3-SECURITY: env surfaces are split per app.
//   - Server app: serverEnvSchema (config/env.ts) — CORS, TRUST_PROXY, S3, ...
//   - Worker app: workerEnvSchema (config/env.ts) — only what the worker needs.
//
// FAIL-CLOSED secrets: JWT_SECRET below is the documented placeholder. The zod
// schema REJECTS any value containing 'REPLACE_WITH', so BOTH apps refuse to
// boot until an operator replaces it with a real >=32-char secret on the VPS
// (e.g. `openssl rand -base64 48`). This file is committed; the real secret is
// not. Both apps must carry the SAME JWT_SECRET so the server-issued tokens
// verify in the worker-backed flows.
module.exports = {
  apps: [
    {
      name: 'anish-toeic-web-services',
      script: 'node',
      args: 'anish-toeic-web-services/dist/server.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 7000,
        // Cloudflare AI Worker (grading adapter)
        CLOUDFLARE_AI_WORKER_URL: '',
        CLOUDFLARE_AI_WORKER_TOKEN: '',
        CLOUDFLARE_AI_TIMEOUT_MS: '60000',
        // Database (MySQL)
        DB_HOST: '',
        DB_PORT: '3306',
        DB_USER: '',
        DB_PASSWORD: '',
        DB_NAME: '',
        // JWT — R3-SECURITY: server-side session revocation via Redis jti keys
        // (login stores jti:<jti> -> userId; logout deletes it; requireAuth 401s
        // when the key is missing). Must be a real secret on the VPS.
        JWT_SECRET: 'REPLACE_WITH_STRONG_SECRET_32+chars',
        JWT_EXPIRES_IN: '7d',
        // R2-SEC-FIX: mirror env.production.example so PM2 env matches the zod schema.
        AI_GRADING_TEST_MODE: 'false',
        // must match env.production.example; false collapses rate-limit identity to proxy IP
        TRUST_PROXY: 'true',
        // Redis (session revocation store — server now REQUIRES it)
        REDIS_URL: 'redis://127.0.0.1:6379',
        // CORS — '*' is rejected by the schema (server always sends credentials:true)
        CORS_ORIGIN: 'https://webinprogress.click',
        // S3 / Media — OPTIONAL (MinIO local uses S3_* names; AWS uses the same)
        S3_ENDPOINT: '',
        S3_REGION: '',
        S3_BUCKET: '',
        S3_ACCESS_KEY: '',
        S3_SECRET_KEY: '',
        AWS_REGION: '',
        AWS_ACCESS_KEY_ID: '',
        AWS_SECRET_ACCESS_KEY: '',
      },
      autorestart: true,
      max_memory_restart: '512M',
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      watch: false,
      ignore_watch: ['node_modules', 'logs', 'dist'],
    },
    {
      name: 'toeic-grading-worker',
      script: 'node',
      args: 'anish-toeic-web-services/dist/workers/grading.worker.js',
      instances: 1,
      exec_mode: 'fork',
      // Worker env = workerEnvSchema surface ONLY (no PORT/CORS/TRUST_PROXY/S3).
      // JWT_SECRET placeholder fails closed at worker boot until replaced.
      env: {
        NODE_ENV: 'production',
        // Cloudflare AI Worker (grading adapter)
        CLOUDFLARE_AI_WORKER_URL: '',
        CLOUDFLARE_AI_WORKER_TOKEN: '',
        CLOUDFLARE_AI_TIMEOUT_MS: '60000',
        AI_GRADING_TEST_MODE: 'false',
        // Database (MySQL) — all required by workerEnvSchema
        DB_HOST: '',
        DB_PORT: '3306',
        DB_USER: '',
        DB_PASSWORD: '',
        DB_NAME: '',
        // Redis (job queue / locks) — required
        REDIS_URL: 'redis://127.0.0.1:6379',
        // Fail-closed placeholder — replace with a real >=32-char secret.
        JWT_SECRET: 'REPLACE_WITH_STRONG_SECRET_32+chars',
      },
      autorestart: true,
      max_memory_restart: '512M',
      error_file: './logs/worker-err.log',
      out_file: './logs/worker-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      watch: false,
      ignore_watch: ['node_modules', 'logs', 'dist'],
    },
  ],
};
