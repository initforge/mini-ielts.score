#!/bin/bash

# Script tự động pull code và update (không cần username/password)
# Chạy setup-git-credentials.sh trước (chỉ 1 lần)
# Usage: bash scripts/pull-update.sh

set -e

APP_DIR="/var/www/mini-ielts-score"

echo "🔄 Auto Pull and Update"
echo "======================"
echo ""

# Check if git is configured
if [ ! -d "$APP_DIR/.git" ]; then
    echo "❌ Not a git repository. Run setup first:"
    echo "   bash scripts/setup-git-credentials.sh"
    exit 1
fi

cd "$APP_DIR"

# Pull latest code
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

