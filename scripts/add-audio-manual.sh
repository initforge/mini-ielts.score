#!/bin/bash

# Script để thêm audio location vào HTTPS block bằng cách tìm dòng cuối cùng của server block
# và thêm trước dòng đó

set -e

NGINX_CONFIG="/etc/nginx/sites-available/mini-ielts-score"
BACKUP_FILE="${NGINX_CONFIG}.backup.$(date +%Y%m%d_%H%M%S)"

echo "🔧 Adding audio location to HTTPS block (method 2)..."

# Backup
sudo cp "$NGINX_CONFIG" "$BACKUP_FILE"
echo "📋 Backup created: $BACKUP_FILE"

# Check if already exists
if sudo awk '/listen 443/,/^[[:space:]]*}/ {if (/location \/audio\/speaking/) print "yes"}' "$NGINX_CONFIG" | grep -q "yes"; then
    echo "✅ Audio location already exists in HTTPS block"
    exit 0
fi

# Find line number of "listen 443"
HTTPS_START=$(sudo grep -n "listen 443" "$NGINX_CONFIG" | head -1 | cut -d: -f1)

if [ -z "$HTTPS_START" ]; then
    echo "❌ Could not find HTTPS server block"
    exit 1
fi

echo "📍 Found HTTPS block starting at line $HTTPS_START"

# Find the last location block in HTTPS server block to insert after it
# We'll insert after the last location block, or after root location if exists
LAST_LOCATION_LINE=$(sudo awk -v start="$HTTPS_START" '
    NR >= start {
        if (/^[[:space:]]*location /) last_location = NR
        if (/^[[:space:]]*}/ && last_location && !inserted) {
            print last_location
            inserted = 1
        }
    }
' "$NGINX_CONFIG" | tail -1)

if [ -z "$LAST_LOCATION_LINE" ]; then
    # If no location found, find the root location or just before closing brace
    LAST_LOCATION_LINE=$(sudo awk -v start="$HTTPS_START" '
        NR >= start {
            if (/^[[:space:]]*location \//) print NR
        }
    ' "$NGINX_CONFIG" | tail -1)
fi

if [ -z "$LAST_LOCATION_LINE" ]; then
    # Find the line with "root" directive
    LAST_LOCATION_LINE=$(sudo awk -v start="$HTTPS_START" '
        NR >= start {
            if (/^[[:space:]]*root /) print NR
        }
    ' "$NGINX_CONFIG" | tail -1)
fi

if [ -z "$LAST_LOCATION_LINE" ]; then
    echo "⚠️  Could not find insertion point. Using line after HTTPS start + 20"
    LAST_LOCATION_LINE=$((HTTPS_START + 20))
fi

echo "📝 Inserting audio location after line $LAST_LOCATION_LINE"

# Insert audio config after the last location line
sudo sed -i "${LAST_LOCATION_LINE}a\\
    # Audio files location\\
    location /audio/speaking/ {\\
        alias /var/www/mini-ielts-score/public/audio/speaking/;\\
        add_header Cache-Control \"public, max-age=31536000\";\\
        add_header Access-Control-Allow-Origin \"*\";\\
        add_header Access-Control-Allow-Methods \"GET, OPTIONS\";\\
        types {\\
            audio/mpeg mp3;\\
        }\\
        default_type audio/mpeg;\\
        try_files \$uri =404;\\
    }\\
" "$NGINX_CONFIG"

# Test nginx config
echo "🧪 Testing nginx configuration..."
if sudo nginx -t; then
    echo "✅ Nginx config is valid"
    echo "🔄 Restarting nginx..."
    sudo systemctl restart nginx
    echo "✅ Done! Audio location added to HTTPS block"
    echo ""
    echo "🧪 Test with: curl -k -I https://165.22.246.35/audio/speaking/system/beep.mp3"
else
    echo "❌ Nginx config test failed! Restoring backup..."
    sudo cp "$BACKUP_FILE" "$NGINX_CONFIG"
    exit 1
fi

