// PM2 ecosystem config for production
module.exports = {
  apps: [
    {
      name: 'mini-ielts-score',
      script: '/usr/bin/tsx',
      args: 'server/index.ts',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
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

