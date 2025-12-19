#!/bin/bash
# Update script - chạy mỗi khi deploy code mới
# Usage: bash scripts/update.sh

set -e

APP_DIR="/var/www/mini-ielts-score"
cd $APP_DIR

echo "🔄 Updating application..."

# Pull latest code
echo "📥 Pulling latest code..."
git pull origin master

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build application
echo "🔨 Building application..."
npm run build

# Restart PM2
echo "🔄 Restarting PM2..."
pm2 restart ecosystem.config.cjs

# Reload Nginx (nếu có thay đổi config)
echo "🔄 Reloading Nginx..."
nginx -t && systemctl reload nginx

echo "✅ Update completed!"

