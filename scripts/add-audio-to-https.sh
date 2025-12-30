#!/bin/bash

# Script để thêm audio location vào HTTPS server block trong nginx
# Chạy trên VPS: bash scripts/add-audio-to-https.sh

set -e

NGINX_CONFIG="/etc/nginx/sites-available/mini-ielts-score"
BACKUP_FILE="${NGINX_CONFIG}.backup.$(date +%Y%m%d_%H%M%S)"

echo "🔧 Checking and adding audio location to HTTPS server block..."

# Backup config
if [ -f "$NGINX_CONFIG" ]; then
    echo "📋 Creating backup: $BACKUP_FILE"
    sudo cp "$NGINX_CONFIG" "$BACKUP_FILE"
else
    echo "❌ Error: Nginx config file not found at $NGINX_CONFIG"
    exit 1
fi

# Check if audio location exists in HTTPS block (listen 443)
HTTPS_HAS_AUDIO=$(sudo awk '/listen 443/,/^[[:space:]]*}/ {if (/location \/audio/) print "yes"}' "$NGINX_CONFIG" | head -1)

if [ "$HTTPS_HAS_AUDIO" = "yes" ]; then
    echo "✅ Audio location already exists in HTTPS block"
    echo "🧪 Testing nginx configuration..."
    if sudo nginx -t 2>&1 | grep -q "duplicate location"; then
        echo "⚠️  Found duplicate location. Checking configuration..."
        # Check if there are multiple locations
        LOCATION_COUNT=$(sudo grep -c "location /audio/speaking/" "$NGINX_CONFIG" || echo "0")
        if [ "$LOCATION_COUNT" -gt 1 ]; then
            echo "❌ Found $LOCATION_COUNT duplicate locations. Please check manually."
            echo "   Run: sudo nano $NGINX_CONFIG"
            exit 1
        fi
    else
        echo "✅ Nginx config is valid"
        exit 0
    fi
fi

echo "📝 Audio location not found in HTTPS block. Adding it..."

# Find the HTTPS server block and add audio location before the closing brace
# We'll use a Python script for more reliable parsing
sudo python3 << 'PYTHON_SCRIPT'
import re
import sys

config_file = "/etc/nginx/sites-available/mini-ielts-score"

with open(config_file, 'r') as f:
    content = f.read()

# Check if location already exists
if re.search(r'location\s+/audio/speaking/', content):
    # Find all location /audio/speaking/ blocks
    locations = list(re.finditer(r'location\s+/audio/speaking/\s*\{[^}]*\}', content, re.DOTALL))
    if len(locations) > 1:
        print("❌ Found multiple audio locations. Please remove duplicates manually.")
        sys.exit(1)
    elif len(locations) == 1:
        # Check if it's in HTTPS block
        loc_start = locations[0].start()
        # Find the server block containing this location
        # Look backwards for "listen 443"
        before_loc = content[:loc_start]
        if re.search(r'listen\s+443', before_loc):
            # Check if there's a "listen 443" after the last "server {" before this location
            server_blocks = list(re.finditer(r'server\s*\{', content[:loc_start]))
            if server_blocks:
                last_server_start = server_blocks[-1].start()
                server_content = content[last_server_start:loc_start]
                if re.search(r'listen\s+443', server_content):
                    print("✅ Audio location already exists in HTTPS block")
                    sys.exit(0)

# Find HTTPS server block (listen 443)
https_pattern = r'(server\s*\{[^}]*listen\s+443[^}]*?)(\n\s*\})'
match = re.search(https_pattern, content, re.DOTALL | re.IGNORECASE)

if not match:
    print("❌ Could not find HTTPS server block (listen 443)")
    sys.exit(1)

# Audio location config
audio_config = '''
    # Audio files location
    location /audio/speaking/ {
        alias /var/www/mini-ielts-score/public/audio/speaking/;
        
        # Cache audio files for 1 year
        add_header Cache-Control "public, max-age=31536000";
        
        # CORS headers
        add_header Access-Control-Allow-Origin "*";
        add_header Access-Control-Allow-Methods "GET, OPTIONS";
        
        # MIME types for audio (only audio/mpeg, not duplicate)
        types {
            audio/mpeg mp3;
        }
        default_type audio/mpeg;
        
        # Fallback if file doesn't exist
        try_files $uri =404;
    }
'''

# Insert audio config before the closing brace
new_content = content[:match.end(1)] + audio_config + content[match.end(1):]

with open(config_file, 'w') as f:
    f.write(new_content)

print("✅ Audio location added to HTTPS block")
PYTHON_SCRIPT

if [ $? -ne 0 ]; then
    echo "❌ Failed to add audio location. Restoring backup..."
    sudo cp "$BACKUP_FILE" "$NGINX_CONFIG"
    exit 1
fi

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
