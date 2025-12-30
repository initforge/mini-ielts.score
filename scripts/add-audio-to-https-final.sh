#!/bin/bash

# Script để thêm audio location vào HTTPS block
# Tìm đúng vị trí ở cấp server block, không phải nested

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

# Find HTTPS server block start
HTTPS_START=$(sudo grep -n "listen 443" "$NGINX_CONFIG" | head -1 | cut -d: -f1)

if [ -z "$HTTPS_START" ]; then
    echo "❌ Could not find HTTPS server block"
    exit 1
fi

echo "📍 Found HTTPS block starting at line $HTTPS_START"

# Find the closing brace of the HTTPS server block
# We need to track brace depth to find the server block's closing brace
CLOSING_BRACE_LINE=$(sudo awk -v start="$HTTPS_START" '
    BEGIN { depth = 0; in_server = 0 }
    NR >= start {
        # Count opening braces
        gsub(/{/, "&", $0)
        brace_open = gsub(/{/, "")
        # Count closing braces  
        gsub(/}/, "&", $0)
        brace_close = gsub(/}/, "")
        
        depth += brace_open - brace_close
        
        # When we reach depth 0, we found the closing brace of the server block
        if (depth == 0 && in_server) {
            print NR
            exit
        }
        
        if (NR == start) in_server = 1
    }
' "$NGINX_CONFIG")

if [ -z "$CLOSING_BRACE_LINE" ]; then
    echo "❌ Could not find closing brace of HTTPS server block"
    exit 1
fi

echo "📍 Found closing brace at line $CLOSING_BRACE_LINE"

# Find the last location block at server level (not nested)
# Look for location blocks that are at the same indentation level (4 spaces or tab)
LAST_LOCATION_LINE=$(sudo awk -v start="$HTTPS_START" -v end="$CLOSING_BRACE_LINE" '
    BEGIN { last_line = 0 }
    NR >= start && NR < end {
        # Match location blocks at server level (starting with spaces/tab, not nested)
        if (/^[[:space:]]+location[[:space:]]+\// && !/^[[:space:]]{8,}/) {
            last_line = NR
        }
    }
    END { if (last_line > 0) print last_line }
' "$NGINX_CONFIG")

if [ -z "$LAST_LOCATION_LINE" ]; then
    # If no location found, insert before closing brace
    INSERT_LINE=$((CLOSING_BRACE_LINE - 1))
    echo "⚠️  No location block found, inserting before closing brace (line $INSERT_LINE)"
else
    # Find the end of the last location block (its closing brace)
    INSERT_LINE=$(sudo awk -v start="$LAST_LOCATION_LINE" -v end="$CLOSING_BRACE_LINE" '
        BEGIN { depth = 0; found_start = 0 }
        NR >= start && NR <= end {
            if (NR == start) found_start = 1
            
            if (found_start) {
                # Count braces
                brace_open = gsub(/{/, "")
                brace_close = gsub(/}/, "")
                depth += brace_open - brace_close
                
                # When location block closes (depth becomes 0 after we started)
                if (depth == 0 && found_start) {
                    print NR
                    exit
                }
            }
        }
    ' "$NGINX_CONFIG")
    
    if [ -z "$INSERT_LINE" ]; then
        INSERT_LINE=$((CLOSING_BRACE_LINE - 1))
    else
        INSERT_LINE=$((INSERT_LINE + 1))
    fi
    
    echo "📝 Inserting audio location after location block (line $INSERT_LINE)"
fi

# Insert audio config
sudo sed -i "${INSERT_LINE}a\\
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

