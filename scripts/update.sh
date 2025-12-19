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

# Update Nginx config nếu có thay đổi
if [ -f "nginx/nginx.conf" ]; then
    echo "📝 Updating Nginx config..."
    cp nginx/nginx.conf /etc/nginx/sites-available/mini-ielts-score
    # Disable default site nếu tồn tại
    if [ -f "/etc/nginx/sites-enabled/default" ]; then
        rm -f /etc/nginx/sites-enabled/default
    fi
    # Ensure symlink exists
    ln -sf /etc/nginx/sites-available/mini-ielts-score /etc/nginx/sites-enabled/mini-ielts-score
    nginx -t && systemctl reload nginx
fi

# Restart PM2
echo "🔄 Restarting PM2..."
pm2 restart ecosystem.config.cjs

echo "✅ Update completed!"

