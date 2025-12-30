#!/bin/bash

# Script đơn giản hơn để fix audio location trong HTTPS block
# Sử dụng khi script tự động không work

set -e

NGINX_CONFIG="/etc/nginx/sites-available/mini-ielts-score"
BACKUP_FILE="${NGINX_CONFIG}.backup.$(date +%Y%m%d_%H%M%S)"

echo "🔧 Fixing audio location in HTTPS block..."

# Backup
sudo cp "$NGINX_CONFIG" "$BACKUP_FILE"
echo "📋 Backup created: $BACKUP_FILE"

# Show current config
echo ""
echo "📋 Current HTTPS block (listen 443):"
echo "----------------------------------------"
sudo awk '/listen 443/,/^[[:space:]]*}/ {print}' "$NGINX_CONFIG" | head -30
echo "----------------------------------------"
echo ""

# Check if audio location exists in HTTPS block
if sudo awk '/listen 443/,/^[[:space:]]*}/ {if (/location \/audio/) print "yes"}' "$NGINX_CONFIG" | grep -q "yes"; then
    echo "✅ Audio location found in HTTPS block"
    
    # Check for duplicate mp3 extension
    if sudo grep -A 10 "location /audio/speaking/" "$NGINX_CONFIG" | grep -q "audio/mp3 mp3"; then
        echo "⚠️  Found duplicate mp3 extension. Fixing..."
        # Remove duplicate audio/mp3 mp3 line
        sudo sed -i '/location \/audio\/speaking\//,/}/ {/audio\/mp3 mp3/d}' "$NGINX_CONFIG"
        echo "✅ Removed duplicate mp3 extension"
    fi
    
    # Test config
    if sudo nginx -t; then
        echo "✅ Nginx config is valid"
        echo "🔄 Restarting nginx..."
        sudo systemctl restart nginx
        echo "✅ Done!"
    else
        echo "❌ Config test failed. Please check manually."
        exit 1
    fi
else
    echo "❌ Audio location NOT found in HTTPS block"
    echo ""
    echo "Please add manually:"
    echo "1. sudo nano $NGINX_CONFIG"
    echo "2. Find the HTTPS server block (listen 443)"
    echo "3. Add before the closing '}':"
    echo ""
    cat << 'EOF'
    # Audio files location
    location /audio/speaking/ {
        alias /var/www/mini-ielts-score/public/audio/speaking/;
        add_header Cache-Control "public, max-age=31536000";
        add_header Access-Control-Allow-Origin "*";
        add_header Access-Control-Allow-Methods "GET, OPTIONS";
        types {
            audio/mpeg mp3;
        }
        default_type audio/mpeg;
        try_files $uri =404;
    }
EOF
    echo ""
    exit 1
fi

