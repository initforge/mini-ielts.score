#!/bin/bash

# Script kiểm tra nginx và HTTPS
# Usage: bash scripts/check-nginx-https.sh

echo "🔍 Checking Nginx and HTTPS Status"
echo "==================================="
echo ""

# 1. Check nginx status
echo "1️⃣  Nginx service status:"
systemctl status nginx --no-pager -l | head -10
echo ""

# 2. Check nginx process
echo "2️⃣  Nginx processes:"
ps aux | grep nginx | grep -v grep
echo ""

# 3. Check port 443
echo "3️⃣  Port 443 listening:"
netstat -tlnp | grep :443 || ss -tlnp | grep :443 || echo "❌ Port 443 not listening"
echo ""

# 4. Check nginx config
echo "4️⃣  Nginx config test:"
nginx -t
echo ""

# 5. Check HTTPS server block
echo "5️⃣  HTTPS server block (listen 443):"
grep -A 5 "listen 443" /etc/nginx/sites-available/mini-ielts-score 2>/dev/null || echo "❌ No HTTPS block found"
echo ""

# 6. Check firewall
echo "6️⃣  Firewall status (ufw):"
ufw status | grep 443 || echo "⚠️  Check firewall manually"
echo ""

# 7. Test HTTP (port 80)
echo "7️⃣  Test HTTP (port 80):"
curl -I http://165.22.246.35/ 2>&1 | head -5
echo ""

echo "💡 If port 443 not listening, HTTPS server block may be missing or nginx not restarted"

