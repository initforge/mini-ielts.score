// PM2 ecosystem config for production
module.exports = {
  apps: [
    {
      name: 'mini-ielts-score',
      script: 'server/index.ts',
      interpreter: 'node',
      interpreter_args: '-r tsx',
      instances: 'max', // Tự động dùng tất cả CPU cores (hoặc số cụ thể như 2, 4)
      exec_mode: 'cluster', // Cluster mode để dùng nhiều CPU cores
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      // Auto restart khi crash
      autorestart: true,
      // Max memory trước khi restart (512MB)
      max_memory_restart: '512M',
      // Logs
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      // Merge logs từ tất cả instances
      merge_logs: true,
      // Watch mode (tắt trong production)
      watch: false,
      // Ignore các file không cần watch
      ignore_watch: ['node_modules', 'logs', 'dist'],
    },
  ],
};

