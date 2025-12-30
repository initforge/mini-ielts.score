#!/bin/bash

# Script tự động pull code và update trên VPS
# Usage: bash scripts/pull-and-update.sh

set -e

APP_DIR="${APP_DIR:-/var/www/mini-ielts-score}"

echo "🔄 Auto Pull and Update"
echo "======================"
echo ""

# Check if we're in the right directory
if [ ! -d "$APP_DIR" ]; then
    echo "❌ App directory not found: $APP_DIR"
    echo "   Set APP_DIR environment variable or run from app directory"
    exit 1
fi

cd "$APP_DIR"

# Step 1: Pull code
echo "📥 Step 1: Pulling latest code..."
git pull origin master

# Step 2: Install dependencies (if package.json changed)
echo ""
echo "📦 Step 2: Installing dependencies..."
npm install

# Step 3: Build
echo ""
echo "🔨 Step 3: Building application..."
npm run build

# Step 4: Restart PM2
echo ""
echo "🔄 Step 4: Restarting PM2..."
pm2 restart all

# Step 5: Show status
echo ""
echo "✅ Update completed!"
echo ""
echo "📊 PM2 Status:"
pm2 list

