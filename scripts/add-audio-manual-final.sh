#!/bin/bash

# Script cuối cùng: hiển thị cấu trúc và hướng dẫn sửa thủ công
# Vì nginx config có thể phức tạp, cách tốt nhất là sửa thủ công

set -e

NGINX_CONFIG="/etc/nginx/sites-available/mini-ielts-score"

echo "🔧 Audio Location Fix - Manual Guide"
echo "===================================="
echo ""

# Step 1: Remove all existing audio locations
echo "🗑️  Step 1: Removing all existing /audio/speaking/ locations..."

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
echo "📋 Step 2: Showing nginx structure..."
echo ""

# Show structure
HTTPS_START=$(sudo grep -n "listen 443" "$NGINX_CONFIG" | head -1 | cut -d: -f1)

if [ -z "$HTTPS_START" ]; then
    echo "❌ Could not find HTTPS server block"
    exit 1
fi

echo "📍 HTTPS server block starts at line $HTTPS_START"
echo ""
echo "📄 Showing HTTPS block structure (last 30 lines):"
echo "----------------------------------------"
sudo tail -n +$HTTPS_START "$NGINX_CONFIG" | head -30 | cat -n
echo "----------------------------------------"
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
    echo "⚠️  Could not find location blocks. Please check manually."
    echo ""
    echo "📝 Manual steps:"
    echo "   1. sudo nano $NGINX_CONFIG"
    echo "   2. Find HTTPS server block (listen 443)"
    echo "   3. Find the last location block (e.g., location /api/)"
    echo "   4. Add audio location AFTER that block, BEFORE closing '}'"
else
    echo "📍 Last location block found at line $LAST_LOC_LINE"
    echo ""
    echo "📝 Showing context around last location:"
    sudo sed -n "$((LAST_LOC_LINE - 2)),$((LAST_LOC_LINE + 10))p" "$NGINX_CONFIG" | cat -n
    echo ""
    echo "💡 Add audio location AFTER line $LAST_LOC_LINE"
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
echo "✅ Step 1 completed: All old audio locations removed"
echo "📋 Step 2: Please add audio location manually using the info above"
echo ""
echo "After adding, test with:"
echo "  sudo nginx -t"
echo "  sudo systemctl restart nginx"
echo "  curl -k -I https://165.22.246.35/audio/speaking/system/beep.mp3"

