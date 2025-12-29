#!/bin/bash

# Script để setup audio files trên VPS
# Usage: 
#   export VPS_USER=root
#   export VPS_HOST=your-vps-ip
#   ./scripts/setup-audio-vps.sh
#
# Hoặc chạy từng lệnh thủ công:
#   1. SSH vào VPS: ssh root@165.22.246.35
#   2. Tạo thư mục: mkdir -p /var/www/mini-ielts-score/public/audio/speaking/{system,directions}
#   3. Upload files: scp audio-temp/beep-329314.mp3 root@165.22.246.35:/var/www/mini-ielts-score/public/audio/speaking/system/beep.mp3
#   4. Set permissions: chmod -R 644 /var/www/mini-ielts-score/public/audio/speaking/* && chown -R www-data:www-data /var/www/mini-ielts-score/public/audio/speaking
#   5. Config Nginx: Thêm location /audio/speaking/ vào nginx config (xem nginx/audio-config.conf)
#   6. Restart Nginx: sudo nginx -t && sudo systemctl restart nginx

set -e

echo "🎵 Setting up audio files on VPS..."

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
VPS_USER="${VPS_USER:-root}"
VPS_HOST="${VPS_HOST:-165.22.246.35}"
VPS_PATH="${VPS_PATH:-/var/www/mini-ielts-score}"
LOCAL_AUDIO_DIR="./audio-temp"
REMOTE_AUDIO_DIR="${VPS_PATH}/public/audio/speaking"

# Check if local audio directory exists
if [ ! -d "$LOCAL_AUDIO_DIR" ]; then
    echo -e "${RED}❌ Error: Local audio directory '$LOCAL_AUDIO_DIR' not found!${NC}"
    echo "Please ensure audio files are in the audio-temp directory."
    exit 1
fi

echo -e "${YELLOW}📋 Configuration:${NC}"
echo "  VPS User: $VPS_USER"
echo "  VPS Host: $VPS_HOST"
echo "  VPS Path: $VPS_PATH"
echo "  Local Audio Dir: $LOCAL_AUDIO_DIR"
echo "  Remote Audio Dir: $REMOTE_AUDIO_DIR"
echo ""

# Create remote directory structure
echo -e "${YELLOW}📁 Creating remote directory structure...${NC}"
ssh ${VPS_USER}@${VPS_HOST} "mkdir -p ${REMOTE_AUDIO_DIR}/system ${REMOTE_AUDIO_DIR}/directions"

# Upload system audio files
echo -e "${YELLOW}📤 Uploading system audio files...${NC}"
scp "${LOCAL_AUDIO_DIR}/beep-329314.mp3" ${VPS_USER}@${VPS_HOST}:${REMOTE_AUDIO_DIR}/system/beep.mp3
scp "${LOCAL_AUDIO_DIR}/Begin Preparing Now.mp3" ${VPS_USER}@${VPS_HOST}:${REMOTE_AUDIO_DIR}/system/begin-preparing.mp3
scp "${LOCAL_AUDIO_DIR}/Begin Speaking Now.mp3" ${VPS_USER}@${VPS_HOST}:${REMOTE_AUDIO_DIR}/system/begin-speaking.mp3

# Upload direction audio files
echo -e "${YELLOW}📤 Uploading direction audio files...${NC}"
scp "${LOCAL_AUDIO_DIR}/Direction Question 1-2.mp3" ${VPS_USER}@${VPS_HOST}:${REMOTE_AUDIO_DIR}/directions/part1.mp3
scp "${LOCAL_AUDIO_DIR}/Direction Question 3-4.mp3" ${VPS_USER}@${VPS_HOST}:${REMOTE_AUDIO_DIR}/directions/part2.mp3
scp "${LOCAL_AUDIO_DIR}/Direction Question 5-7.mp3" ${VPS_USER}@${VPS_HOST}:${REMOTE_AUDIO_DIR}/directions/part3.mp3
scp "${LOCAL_AUDIO_DIR}/Direction Question 8-10.mp3" ${VPS_USER}@${VPS_HOST}:${REMOTE_AUDIO_DIR}/directions/part4.mp3
scp "${LOCAL_AUDIO_DIR}/Direction Question 11.mp3" ${VPS_USER}@${VPS_HOST}:${REMOTE_AUDIO_DIR}/directions/part5.mp3

# Set permissions
echo -e "${YELLOW}🔐 Setting permissions...${NC}"
ssh ${VPS_USER}@${VPS_HOST} "chmod -R 644 ${REMOTE_AUDIO_DIR}/* && chown -R www-data:www-data ${REMOTE_AUDIO_DIR}"

echo -e "${GREEN}✅ Audio files uploaded successfully!${NC}"
echo ""
echo -e "${YELLOW}📝 Next steps:${NC}"
echo ""
echo "1. SSH vào VPS và thêm config Nginx:"
echo "   ssh root@165.22.246.35"
echo "   sudo nano /etc/nginx/sites-available/default"
echo ""
echo "2. Thêm vào trong server block:"
echo "   location /audio/speaking/ {"
echo "       alias /var/www/mini-ielts-score/public/audio/speaking/;"
echo "       add_header Cache-Control \"public, max-age=31536000\";"
echo "       add_header Access-Control-Allow-Origin \"*\";"
echo "       types { audio/mpeg mp3; }"
echo "       default_type audio/mpeg;"
echo "       try_files \$uri =404;"
echo "   }"
echo ""
echo "3. Test và restart Nginx:"
echo "   sudo nginx -t"
echo "   sudo systemctl restart nginx"
echo ""
echo "4. Test URLs trong browser (thay your-domain bằng domain của bạn):"
echo "   http://165.22.246.35/audio/speaking/system/beep.mp3"
echo "   http://165.22.246.35/audio/speaking/directions/part1.mp3"

