#!/bin/bash

# Script để setup Git với Personal Access Token
# Usage: bash scripts/setup-git-token.sh [YOUR_TOKEN]

set -e

if [ -z "$1" ]; then
    echo "❌ Please provide your GitHub Personal Access Token"
    echo ""
    echo "Usage: bash scripts/setup-git-token.sh YOUR_TOKEN"
    echo ""
    echo "To create a token:"
    echo "1. Go to: https://github.com/settings/tokens"
    echo "2. Click 'Generate new token (classic)'"
    echo "3. Select scopes: repo (all)"
    echo "4. Copy the token and run this script"
    exit 1
fi

GIT_TOKEN="$1"
GIT_USERNAME="initforge"

echo "🔐 Setting up Git with Personal Access Token..."
echo ""

cd /var/www/mini-ielts-score

# Update remote URL with token
git remote set-url origin "https://${GIT_USERNAME}:${GIT_TOKEN}@github.com/initforge/mini-ielts.score.git"

# Setup credential helper
git config --global credential.helper store
CREDENTIALS_FILE="$HOME/.git-credentials"
echo "https://${GIT_USERNAME}:${GIT_TOKEN}@github.com" > "$CREDENTIALS_FILE"
chmod 600 "$CREDENTIALS_FILE"

# Test
echo "🧪 Testing connection..."
if git fetch origin master 2>&1 | grep -q "fatal"; then
    echo "❌ Authentication failed. Please check your token."
    echo "   Token should have 'repo' scope enabled."
    exit 1
fi

echo ""
echo "✅✅✅ Setup completed!"
echo ""
echo "Now you can use: bash scripts/pull-update.sh"
echo "No credentials needed!"

