#!/bin/bash

# Script tự động: pull code, xóa audio locations cũ, hiển thị hướng dẫn sửa

set -e

cd /var/www/mini-ielts-score

echo "🔄 Auto-pulling latest code from GitHub..."
git pull origin master

echo ""
echo "🔧 Fixing audio location..."

NGINX_CONFIG="/etc/nginx/sites-available/mini-ielts-score"
BACKUP_FILE="${NGINX_CONFIG}.backup.$(date +%Y%m%d_%H%M%S)"

# Backup
sudo cp "$NGINX_CONFIG" "$BACKUP_FILE"
echo "📋 Backup created: $BACKUP_FILE"

# Step 1: Remove all existing audio locations
echo "🗑️  Removing all existing /audio/speaking/ locations..."

AUDIO_LOC_COUNT=$(sudo grep -c "location /audio/speaking/" "$NGINX_CONFIG" || echo "0")
echo "   Found $AUDIO_LOC_COUNT existing location(s)"

if [ "$AUDIO_LOC_COUNT" -gt 0 ]; then
    sudo python3 << 'PYTHON_REMOVE'
import re
import sys

config_file = "/etc/nginx/sites-available/mini-ielts-score"

with open(config_file, 'r') as f:
    lines = f.readlines()

result = []
i = 0
skip_block = False
brace_depth = 0

while i < len(lines):
    line = lines[i]
    
    if re.match(r'[ \t]*#?[ \t]*location[ \t]+/audio/speaking/', line):
        skip_block = True
        brace_depth = 0
        i += 1
        continue
    
    if skip_block:
        brace_depth += line.count('{') - line.count('}')
        if brace_depth <= 0 and '}' in line:
            skip_block = False
            i += 1
            continue
        i += 1
        continue
    
    result.append(line)
    i += 1

with open(config_file, 'w') as f:
    f.writelines(result)

print(f"✅ Removed all audio locations")
PYTHON_REMOVE
fi

echo ""
echo "📋 Showing HTTPS block structure..."
echo ""

# Find HTTPS block
HTTPS_START=$(sudo grep -n "listen 443" "$NGINX_CONFIG" | head -1 | cut -d: -f1)

if [ -z "$HTTPS_START" ]; then
    echo "❌ Could not find HTTPS server block"
    exit 1
fi

echo "📍 HTTPS server block starts at line $HTTPS_START"
echo ""

# Find last location block
LAST_LOC_LINE=$(sudo awk -v start="$HTTPS_START" '
    BEGIN { 
        in_https = 0
        brace_depth = 0
        last_loc = 0
    }
    NR >= start {
        if (NR == start) in_https = 1
        
        if (in_https) {
            brace_depth += gsub(/{/, "") - gsub(/}/, "")
            
            if (/^[ \t]{4}location[ \t]+/) {
                last_loc = NR
            }
            
            if (brace_depth == 0 && NR > start) {
                if (last_loc > 0) print last_loc
                exit
            }
        }
    }
' "$NGINX_CONFIG")

if [ -z "$LAST_LOC_LINE" ]; then
    echo "⚠️  Could not find location blocks automatically."
    echo "📝 Please check manually:"
    echo "   sudo nano $NGINX_CONFIG"
    echo "   Find HTTPS block (listen 443) and add audio location before closing '}'"
else
    echo "📍 Last location block found at line $LAST_LOC_LINE"
    echo ""
    echo "📄 Context around last location (showing where to add):"
    echo "----------------------------------------"
    sudo sed -n "$((LAST_LOC_LINE - 2)),$((LAST_LOC_LINE + 15))p" "$NGINX_CONFIG" | cat -n | head -20
    echo "----------------------------------------"
    echo ""
    echo "💡 Add audio location AFTER line $LAST_LOC_LINE (after the closing '}' of location block)"
fi

echo ""
echo "📝 Audio location config to add:"
echo "----------------------------------------"
cat << 'AUDIO_CONFIG'
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
echo "----------------------------------------"
echo ""
echo "✅ Old audio locations removed!"
echo ""
echo "📝 Next steps:"
echo "   1. sudo nano $NGINX_CONFIG"
echo "   2. Go to line $LAST_LOC_LINE (or find last location block)"
echo "   3. Add the audio location config above AFTER the location block"
echo "   4. Save and exit (Ctrl+X, Y, Enter)"
echo "   5. Test: sudo nginx -t"
echo "   6. Restart: sudo systemctl restart nginx"
echo "   7. Test URL: curl -k -I https://165.22.246.35/audio/speaking/system/beep.mp3"

