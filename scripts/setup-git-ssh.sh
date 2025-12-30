#!/bin/bash

# Script để setup Git với SSH key (an toàn hơn token)
# Usage: bash scripts/setup-git-ssh.sh

set -e

echo "🔐 Setting up Git with SSH key..."
echo ""

# Check if SSH key exists
SSH_KEY="$HOME/.ssh/id_rsa"
SSH_PUB="$HOME/.ssh/id_rsa.pub"

if [ ! -f "$SSH_KEY" ]; then
    echo "📝 Generating SSH key..."
    ssh-keygen -t rsa -b 4096 -C "initforge@github.com" -f "$SSH_KEY" -N ""
    echo "✅ SSH key generated"
else
    echo "✅ SSH key already exists"
fi

# Display public key
echo ""
echo "📋 Your public SSH key:"
echo "----------------------------------------"
cat "$SSH_PUB"
echo "----------------------------------------"
echo ""
echo "📝 Next steps:"
echo "1. Copy the public key above"
echo "2. Go to: https://github.com/settings/ssh/new"
echo "3. Paste the key and save"
echo "4. Press Enter when done..."
read

# Update remote to use SSH
cd /var/www/mini-ielts-score
git remote set-url origin git@github.com:initforge/mini-ielts.score.git

# Test connection
echo ""
echo "🧪 Testing SSH connection..."
ssh -T git@github.com 2>&1 | head -1 || true

echo ""
echo "✅ Setup completed!"
echo ""
echo "Now you can use: bash scripts/pull-update.sh"
echo "No credentials needed!"

