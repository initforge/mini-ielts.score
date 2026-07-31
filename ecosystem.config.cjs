// PM2 ecosystem config for production — S7: targets anish-toeic-web-services on :7000
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
        // JWT
        JWT_SECRET: '',
        JWT_EXPIRES_IN: '7d',
        // S3 / Media
        AWS_REGION: '',
        AWS_ACCESS_KEY_ID: '',
        AWS_SECRET_ACCESS_KEY: '',
        S3_BUCKET: '',
        // CORS
        CORS_ORIGIN: 'https://webinprogress.click',
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
  ],
};

