#!/bin/bash

# Script để pull code và update
# Usage: bash scripts/pull-update.sh
# Note: Cần điền username/password khi pull

set -e

APP_DIR="/var/www/mini-ielts-score"

echo "🔄 Pull and Update"
echo "=================="
echo ""

cd "$APP_DIR"

# Pull latest code (sẽ hỏi username/password)
echo "📥 Pulling latest code..."
git pull origin master

# Install dependencies if package.json changed
if git diff --name-only HEAD@{1} HEAD | grep -q "package.json\|package-lock.json"; then
    echo "📦 Package.json changed, installing dependencies..."
    npm install
fi

# Build
echo "🔨 Building application..."
npm run build

# Restart PM2
echo "🔄 Restarting PM2..."
pm2 restart all

echo ""
echo "✅✅✅ Update completed!"
echo ""
echo "📊 PM2 Status:"
pm2 status

