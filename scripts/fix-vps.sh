#!/bin/bash
# Script để fix PM2 và update code trên VPS
# Usage: bash scripts/fix-vps.sh

set -e

APP_DIR="/var/www/mini-ielts-score"
cd $APP_DIR

echo "🔧 Fixing PM2 and updating code..."

# 1. Kiểm tra và cài đặt tsx nếu chưa có
echo "📦 Checking tsx installation..."
if ! command -v tsx &> /dev/null; then
    echo "Installing tsx globally..."
    npm install -g tsx
fi

# Kiểm tra path của tsx
TSX_PATH=$(which tsx)
echo "✅ tsx found at: $TSX_PATH"

# 2. Update ecosystem.config.cjs với cách chạy tsx trực tiếp
echo "📝 Updating PM2 config..."
cat > ecosystem.config.cjs << EOF
// PM2 ecosystem config for production
module.exports = {
  apps: [
    {
      name: 'mini-ielts-score',
      script: '$TSX_PATH',
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
EOF

# 3. Pull latest code
echo "📥 Pulling latest code..."
git pull origin master

# 4. Install dependencies
echo "📦 Installing dependencies..."
npm install

# 5. Build application
echo "🔨 Building application..."
npm run build

# 6. Stop PM2 nếu đang chạy
echo "🛑 Stopping PM2..."
pm2 stop mini-ielts-score 2>/dev/null || true
pm2 delete mini-ielts-score 2>/dev/null || true

# 7. Start PM2 với config mới
echo "🚀 Starting PM2..."
pm2 start ecosystem.config.cjs

# 8. Save PM2 process list
pm2 save

# 9. Check PM2 status
echo "📊 PM2 Status:"
pm2 status

# 10. Show recent logs
echo "📋 Recent logs:"
pm2 logs mini-ielts-score --lines 20 --nostream

echo "✅ Fix completed!"

