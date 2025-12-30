#!/bin/bash

# Script triệt để để fix audio location: xóa tất cả cũ và thêm lại vào đúng chỗ
# Không nửa vời - làm đến khi thành công

set -e

NGINX_CONFIG="/etc/nginx/sites-available/mini-ielts-score"
BACKUP_FILE="${NGINX_CONFIG}.backup.$(date +%Y%m%d_%H%M%S)"

echo "🔧 Fixing audio location COMPLETELY..."

# Backup
sudo cp "$NGINX_CONFIG" "$BACKUP_FILE"
echo "📋 Backup created: $BACKUP_FILE"

# Step 1: Remove ALL existing /audio/speaking/ locations
echo "🗑️  Step 1: Removing all existing /audio/speaking/ locations..."

# Count how many exist
AUDIO_LOC_COUNT=$(sudo grep -c "location /audio/speaking/" "$NGINX_CONFIG" || echo "0")
echo "   Found $AUDIO_LOC_COUNT existing location(s)"

if [ "$AUDIO_LOC_COUNT" -gt 0 ]; then
    # Use Python to properly remove location blocks
    sudo python3 << 'PYTHON_REMOVE'
import re
import sys

config_file = "/etc/nginx/sites-available/mini-ielts-score"

with open(config_file, 'r') as f:
    lines = f.readlines()

# Remove all location /audio/speaking/ blocks
result = []
i = 0
skip_block = False
brace_depth = 0

while i < len(lines):
    line = lines[i]
    
    # Check if this line starts a location /audio/speaking/ block
    if re.match(r'[ \t]*#?[ \t]*location[ \t]+/audio/speaking/', line):
        skip_block = True
        brace_depth = 0
        i += 1
        continue
    
    if skip_block:
        # Count braces to find end of block
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

# Step 2: Find HTTPS server block and add location at correct position
echo "📍 Step 2: Finding HTTPS server block and adding location..."

sudo python3 << 'PYTHON_ADD'
import re
import sys

config_file = "/etc/nginx/sites-available/mini-ielts-score"

with open(config_file, 'r') as f:
    lines = f.readlines()

# Find HTTPS server block
https_start = None
https_end = None
in_https = False
brace_depth = 0

for i, line in enumerate(lines):
    if re.search(r'listen\s+443', line, re.IGNORECASE):
        https_start = i
        in_https = True
        brace_depth = 0
    
    if in_https:
        brace_depth += line.count('{') - line.count('}')
        if brace_depth == 0 and https_start is not None and '}' in line:
            https_end = i
            break

if https_start is None:
    print("❌ Could not find HTTPS server block")
    sys.exit(1)

print(f"✅ Found HTTPS block: lines {https_start + 1} to {https_end + 1}")

# Find ALL location blocks in HTTPS server block and their end positions
location_blocks = []
i = https_start
current_brace_depth = 0
in_location = False
location_start = None
location_indent = None

while i <= https_end:
    line = lines[i]
    line_stripped = line.lstrip()
    indent = len(line) - len(line_stripped)
    
    # Track brace depth from server block start
    if i == https_start:
        current_brace_depth = 0
    
    current_brace_depth += line.count('{') - line.count('}')
    
    # Check if this is a location block at server level (4 spaces indent, not 8+)
    if re.match(r'location\s+', line_stripped) and indent == 4:
        if in_location:
            # Previous location ended, record it
            location_blocks.append({
                'start': location_start,
                'end': i - 1,
                'indent': location_indent
            })
        location_start = i
        location_indent = indent
        in_location = True
        loc_brace_depth = 0
    
    if in_location:
        loc_brace_depth += line.count('{') - line.count('}')
        if loc_brace_depth == 0 and i > location_start:
            # Location block ended
            location_blocks.append({
                'start': location_start,
                'end': i,
                'indent': location_indent
            })
            in_location = False
    
    i += 1

# Find the last location block
if location_blocks:
    last_location = location_blocks[-1]
    insert_line = last_location['end'] + 1
    print(f"📍 Found {len(location_blocks)} location block(s), last ends at line {last_location['end'] + 1}")
    print(f"📍 Will insert at line {insert_line + 1}")
else:
    # No location found, find a safe place before closing brace
    # Look for root directive or other server-level directives
    insert_line = https_end - 1
    for i in range(https_end - 1, https_start, -1):
        line = lines[i]
        if re.match(r'^[ \t]{4}[^ \t]', line) and not re.match(r'^[ \t]{8,}', line):
            # Server-level directive found
            insert_line = i + 1
            break
    print(f"📍 No location blocks found, inserting at line {insert_line + 1}")

# Audio location config
audio_config = '''    # Audio files location
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
'''

# Insert audio config
lines.insert(insert_line, audio_config)

with open(config_file, 'w') as f:
    f.writelines(lines)

print(f"✅ Added audio location at line {insert_line + 1}")
PYTHON_ADD

# Step 3: Test and restart
echo "🧪 Step 3: Testing nginx configuration..."
if sudo nginx -t 2>&1 | tee /tmp/nginx-test.log; then
    echo "✅ Nginx config is valid"
    echo "🔄 Restarting nginx..."
    sudo systemctl restart nginx
    echo ""
    echo "✅✅✅ SUCCESS! Audio location fixed completely"
    echo ""
    echo "🧪 Test with:"
    echo "   curl -k -I https://165.22.246.35/audio/speaking/system/beep.mp3"
    echo ""
    echo "Expected: HTTP/2 200"
else
    echo "❌ Nginx config test failed!"
    echo "📋 Error details:"
    cat /tmp/nginx-test.log
    echo ""
    echo "🔄 Restoring backup..."
    sudo cp "$BACKUP_FILE" "$NGINX_CONFIG"
    echo ""
    echo "⚠️  Please fix manually. Check the error above."
    exit 1
fi
