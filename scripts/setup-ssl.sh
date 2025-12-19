#!/bin/bash
# Setup SSL với Let's Encrypt
# Usage: bash scripts/setup-ssl.sh your-domain.com

set -e

if [ -z "$1" ]; then
    echo "Usage: bash scripts/setup-ssl.sh your-domain.com"
    exit 1
fi

DOMAIN=$1

echo "🔒 Setting up SSL for $DOMAIN..."

# Install Certbot
apt-get update
apt-get install -y certbot python3-certbot-nginx

# Get certificate
certbot --nginx -d $DOMAIN -d www.$DOMAIN

# Auto-renewal
systemctl enable certbot.timer
systemctl start certbot.timer

echo "✅ SSL setup completed!"
echo "Certificate will auto-renew every 90 days"

