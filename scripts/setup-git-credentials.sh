#!/bin/bash

# Script để setup git credentials tự động (chạy 1 lần trên VPS)
# Usage: bash scripts/setup-git-credentials.sh

set -e

echo "🔐 Setting up Git credentials for automatic pull..."

GIT_USERNAME="initforge"
GIT_TOKEN="ghp_zazskTq0k0QOwRCaHb5DY6jJ1Lmeio17xcR1"
REPO_URL="https://github.com/initforge/mini-ielts.score.git"

# Method 1: Update remote URL với token embedded
echo "📝 Method 1: Updating remote URL with token..."
cd /var/www/mini-ielts-score

# Get current remote URL
CURRENT_REMOTE=$(git remote get-url origin 2>/dev/null || echo "")

if [ -n "$CURRENT_REMOTE" ]; then
    # Extract repo path (initforge/mini-ielts.score.git)
    REPO_PATH=$(echo "$CURRENT_REMOTE" | sed -E 's|https?://[^/]+/(.+)|\\1|' | sed -E 's|git@[^:]+:(.+)|\\1|')
    
    # Update remote với token
    NEW_URL="https://${GIT_USERNAME}:${GIT_TOKEN}@github.com/${REPO_PATH}"
    git remote set-url origin "$NEW_URL"
    echo "✅ Updated remote URL with credentials"
else
    echo "⚠️  No remote found, adding new remote..."
    git remote add origin "$REPO_URL" 2>/dev/null || true
    git remote set-url origin "https://${GIT_USERNAME}:${GIT_TOKEN}@github.com/initforge/mini-ielts.score.git"
    echo "✅ Added remote with credentials"
fi

# Method 2: Setup credential helper (backup method)
echo ""
echo "📝 Method 2: Setting up credential helper..."
git config --global credential.helper store

# Create credentials file
CREDENTIALS_FILE="$HOME/.git-credentials"
echo "https://${GIT_USERNAME}:${GIT_TOKEN}@github.com" > "$CREDENTIALS_FILE"
chmod 600 "$CREDENTIALS_FILE"
echo "✅ Created credentials file: $CREDENTIALS_FILE"

# Test
echo ""
echo "🧪 Testing git pull..."
cd /var/www/mini-ielts-score
git fetch origin master

echo ""
echo "✅✅✅ Setup completed!"
echo ""
echo "Now you can use: bash scripts/pull-update.sh"
echo "No need to enter username/password anymore!"

