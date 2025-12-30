#!/bin/bash

# Script để thêm audio location vào HTTPS server block trong nginx
# Chạy trên VPS: bash scripts/add-audio-to-https.sh

set -e

NGINX_CONFIG="/etc/nginx/sites-available/mini-ielts-score"
BACKUP_FILE="${NGINX_CONFIG}.backup.$(date +%Y%m%d_%H%M%S)"

echo "🔧 Adding audio location to HTTPS server block..."

# Backup config
if [ -f "$NGINX_CONFIG" ]; then
    echo "📋 Creating backup: $BACKUP_FILE"
    sudo cp "$NGINX_CONFIG" "$BACKUP_FILE"
else
    echo "❌ Error: Nginx config file not found at $NGINX_CONFIG"
    exit 1
fi

# Check if audio location already exists in HTTPS block
if sudo grep -A 20 "listen 443" "$NGINX_CONFIG" | grep -q "location /audio"; then
    echo "✅ Audio location already exists in HTTPS block"
    exit 0
fi

# Create temp file with audio config
AUDIO_CONFIG=$(cat <<'EOF'
    # Audio files location
    location /audio/speaking/ {
        alias /var/www/mini-ielts-score/public/audio/speaking/;
        
        # Cache audio files for 1 year
        add_header Cache-Control "public, max-age=31536000";
        
        # CORS headers
        add_header Access-Control-Allow-Origin "*";
        add_header Access-Control-Allow-Methods "GET, OPTIONS";
        
        # MIME types for audio
        types {
            audio/mpeg mp3;
            audio/mp3 mp3;
        }
        default_type audio/mpeg;
        
        # Fallback if file doesn't exist
        try_files $uri =404;
    }
EOF
)

# Find the line number of "listen 443" and insert audio config after it
# We'll insert after the first closing brace of the server block (before the closing brace)
# This is a simplified approach - you may need to adjust based on your config structure

echo "📝 Adding audio location to HTTPS block..."

# Use sed to add audio config after "listen 443 ssl http2;" line
# We'll add it before the closing brace of the server block
sudo sed -i '/listen 443 ssl http2;/a\
\
    # Audio files location\
    location /audio/speaking/ {\
        alias /var/www/mini-ielts-score/public/audio/speaking/;\
        add_header Cache-Control "public, max-age=31536000";\
        add_header Access-Control-Allow-Origin "*";\
        add_header Access-Control-Allow-Methods "GET, OPTIONS";\
        types { audio/mpeg mp3; audio/mp3 mp3; }\
        default_type audio/mpeg;\
        try_files $uri =404;\
    }' "$NGINX_CONFIG"

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

