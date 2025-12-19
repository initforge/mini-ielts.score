#!/bin/bash
# Deployment script cho Droplet
# Chạy: bash scripts/deploy.sh

set -e  # Exit on error

echo "🚀 Starting deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Please run as root or with sudo${NC}"
    exit 1
fi

# Variables
APP_DIR="/var/www/mini-ielts-score"
SERVICE_USER="www-data"
NODE_VERSION="20"

echo -e "${YELLOW}Step 1: Update system packages...${NC}"
apt-get update
apt-get upgrade -y

echo -e "${YELLOW}Step 2: Install Node.js ${NODE_VERSION}...${NC}"
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt-get install -y nodejs
fi

echo -e "${GREEN}Node version: $(node --version)${NC}"
echo -e "${GREEN}NPM version: $(npm --version)${NC}"

echo -e "${YELLOW}Step 3: Install PM2 globally...${NC}"
npm install -g pm2 tsx

echo -e "${YELLOW}Step 4: Install Nginx...${NC}"
if ! command -v nginx &> /dev/null; then
    apt-get install -y nginx
fi

echo -e "${YELLOW}Step 5: Create app directory...${NC}"
mkdir -p $APP_DIR
mkdir -p $APP_DIR/logs
chown -R $SERVICE_USER:$SERVICE_USER $APP_DIR

echo -e "${YELLOW}Step 6: Setup firewall...${NC}"
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo -e "${GREEN}✅ Basic setup completed!${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Clone your repo: cd $APP_DIR && git clone https://github.com/initforge/mini-ielts.score.git ."
echo "2. Install dependencies: npm install"
echo "3. Build app: npm run build"
echo "4. Copy nginx config: cp nginx/nginx.conf /etc/nginx/sites-available/mini-ielts-score"
echo "5. Enable site: ln -s /etc/nginx/sites-available/mini-ielts-score /etc/nginx/sites-enabled/"
echo "6. Start PM2: pm2 start ecosystem.config.cjs"
echo "7. Save PM2: pm2 save && pm2 startup"
echo "8. Reload Nginx: nginx -t && systemctl reload nginx"

