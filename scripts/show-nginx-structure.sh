#!/bin/bash

# Script để hiển thị cấu trúc nginx config, giúp xác định vị trí chèn audio location

NGINX_CONFIG="/etc/nginx/sites-available/mini-ielts-score"

echo "📋 Nginx Config Structure Analysis"
echo "=================================="
echo ""

# Find HTTPS server block
HTTPS_START=$(sudo grep -n "listen 443" "$NGINX_CONFIG" | head -1 | cut -d: -f1)

if [ -z "$HTTPS_START" ]; then
    echo "❌ Could not find HTTPS server block"
    exit 1
fi

echo "📍 HTTPS server block starts at line $HTTPS_START"
echo ""

# Show HTTPS block with line numbers and structure
echo "📄 HTTPS Server Block Content:"
echo "----------------------------------------"
sudo awk -v start="$HTTPS_START" '
    BEGIN { 
        in_block = 0
        brace_depth = 0
        line_num = 0
    }
    NR >= start {
        if (NR == start) in_block = 1
        
        if (in_block) {
            brace_depth += gsub(/{/, "") - gsub(/}/, "")
            
            # Show line with structure
            indent = ""
            for (i = 0; i < brace_depth; i++) indent = indent "  "
            
            printf "%4d %s%s\n", NR, indent, $0
            
            if (brace_depth == 0 && NR > start) {
                exit
            }
        }
    }
' "$NGINX_CONFIG"

echo "----------------------------------------"
echo ""

# Find all location blocks in HTTPS block
echo "📍 Location blocks in HTTPS block:"
sudo awk -v start="$HTTPS_START" '
    BEGIN { 
        in_https = 0
        brace_depth = 0
        loc_num = 0
    }
    NR >= start {
        if (NR == start) in_https = 1
        
        if (in_https) {
            brace_depth += gsub(/{/, "") - gsub(/}/, "")
            
            if (/^[ \t]{4}location[ \t]+/) {
                loc_num++
                printf "  Location #%d: line %d - %s\n", loc_num, NR, $0
            }
            
            if (brace_depth == 0 && NR > start) {
                exit
            }
        }
    }
' "$NGINX_CONFIG"

echo ""
echo "💡 To add audio location manually:"
echo "   1. Find the last location block in HTTPS block"
echo "   2. Add audio location AFTER that block (same indentation level)"
echo "   3. Make sure it's BEFORE the closing '}' of server block"

