#!/bin/bash
# Script tự động fix PM2 config
# Usage: bash scripts/fix-pm2.sh

set -e

APP_DIR="/var/www/mini-ielts-score"
cd $APP_DIR

echo "🔧 Fixing PM2 configuration..."

# Pull latest code
echo "📥 Pulling latest code..."
git pull origin master

# Tìm path của tsx
TSX_PATH=$(which tsx)
if [ -z "$TSX_PATH" ]; then
    echo "❌ tsx not found! Installing tsx globally..."
    npm install -g tsx
    TSX_PATH=$(which tsx)
fi

echo "✅ Found tsx at: $TSX_PATH"

# Sửa ecosystem.config.cjs với path đúng
echo "📝 Updating ecosystem.config.cjs..."
sed -i "s|interpreter:.*|interpreter: '$TSX_PATH',|g" ecosystem.config.cjs
sed -i "/interpreter_args:/d" ecosystem.config.cjs

# Restart PM2
echo "🔄 Restarting PM2..."
pm2 delete mini-ielts-score 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

# Kiểm tra status
echo ""
echo "📊 PM2 Status:"
pm2 status

# Test app
echo ""
echo "🧪 Testing app..."
sleep 2
if curl -s http://localhost:3000/health > /dev/null; then
    echo "✅ App is running successfully!"
    curl http://localhost:3000/health
else
    echo "❌ App is not responding. Check logs:"
    echo "   pm2 logs mini-ielts-score --lines 50"
fi

echo ""
echo "✅ Fix completed!"

