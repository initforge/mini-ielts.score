#!/bin/bash

# Script đơn giản để thêm audio location vào HTTPS block
# Tự động tìm vị trí và thêm vào đúng chỗ

set -e

NGINX_CONFIG="/etc/nginx/sites-available/mini-ielts-score"
BACKUP_FILE="${NGINX_CONFIG}.backup.$(date +%Y%m%d_%H%M%S)"

echo "🔧 Adding audio location to HTTPS block..."

# Backup
sudo cp "$NGINX_CONFIG" "$BACKUP_FILE"
echo "📋 Backup created: $BACKUP_FILE"

# Check if already exists in HTTPS block
if sudo awk '/listen 443/,/^[[:space:]]*}/ {if (/location \/audio\/speaking/) print "yes"}' "$NGINX_CONFIG" | grep -q "yes"; then
    echo "✅ Audio location already exists in HTTPS block"
    exit 0
fi

# Find the HTTPS server block and add location before the closing brace
# We'll use sed to insert before the last } of the HTTPS server block

echo "📝 Adding audio location..."

# Create a temporary file with the audio config
TEMP_FILE=$(mktemp)
cat > "$TEMP_FILE" << 'AUDIO_CONFIG'
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
AUDIO_CONFIG

# Use awk to find HTTPS block and insert before closing brace
sudo awk -v audio_config="$(cat "$TEMP_FILE")" '
    BEGIN { in_https = 0; brace_count = 0; inserted = 0 }
    /listen 443/ { in_https = 1 }
    in_https {
        if (match($0, /\{/)) brace_count++
        if (match($0, /\}/)) brace_count--
        if (brace_count == 0 && in_https && !inserted) {
            # Insert audio config before this closing brace
            print audio_config
            inserted = 1
        }
    }
    { print }
' "$NGINX_CONFIG" > "${NGINX_CONFIG}.tmp" && sudo mv "${NGINX_CONFIG}.tmp" "$NGINX_CONFIG"

rm -f "$TEMP_FILE"

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

