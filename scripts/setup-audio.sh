#!/bin/bash
# Script setup audio files trên VPS
# Chạy sau khi pull code về: bash scripts/setup-audio.sh
# 
# Logic: Chỉ copy nếu file nguồn tồn tại VÀ (file đích chưa có HOẶC file nguồn mới hơn)
# Điều này đảm bảo: sau khi copy lần đầu, dù xóa audio-temp/ trong source,
# files vẫn còn trong public/audio/speaking/ và vẫn chạy được

set -e

APP_DIR="/var/www/mini-ielts-score"
AUDIO_SOURCE_DIR="$APP_DIR/audio-temp"
AUDIO_TARGET_DIR="$APP_DIR/public/audio/speaking"

echo "🎵 Setting up audio files..."

# Tạo thư mục đích (không xóa files cũ nếu đã có)
echo "📁 Creating directories..."
mkdir -p "$AUDIO_TARGET_DIR/system"
mkdir -p "$AUDIO_TARGET_DIR/directions"

# Helper function: Copy nếu file nguồn tồn tại và (file đích chưa có hoặc file nguồn mới hơn)
copy_if_needed() {
    local source_file="$1"
    local target_file="$2"
    local file_name="$3"
    
    if [ ! -f "$source_file" ]; then
        if [ -f "$target_file" ]; then
            echo "⚠️  Source not found, keeping existing: $file_name"
        else
            echo "❌ Source not found and target missing: $file_name"
        fi
        return
    fi
    
    # Copy nếu file đích chưa có hoặc file nguồn mới hơn
    if [ ! -f "$target_file" ] || [ "$source_file" -nt "$target_file" ]; then
        cp "$source_file" "$target_file"
        echo "✅ Copied/Updated: $file_name"
    else
        echo "⏭️  Skipped (target is newer or same): $file_name"
    fi
}

# Copy và rename files
echo "📋 Copying audio files..."

# System audio
copy_if_needed "$AUDIO_SOURCE_DIR/beep-329314.mp3" "$AUDIO_TARGET_DIR/system/beep.mp3" "beep.mp3"
copy_if_needed "$AUDIO_SOURCE_DIR/Begin Preparing Now.mp3" "$AUDIO_TARGET_DIR/system/begin-preparing.mp3" "begin-preparing.mp3"
copy_if_needed "$AUDIO_SOURCE_DIR/Begin Speaking Now.mp3" "$AUDIO_TARGET_DIR/system/begin-speaking.mp3" "begin-speaking.mp3"

# Direction audio
copy_if_needed "$AUDIO_SOURCE_DIR/Direction Question 1-2.mp3" "$AUDIO_TARGET_DIR/directions/part1.mp3" "part1.mp3"
copy_if_needed "$AUDIO_SOURCE_DIR/Direction Question 3-4.mp3" "$AUDIO_TARGET_DIR/directions/part2.mp3" "part2.mp3"
copy_if_needed "$AUDIO_SOURCE_DIR/Direction Question 5-7.mp3" "$AUDIO_TARGET_DIR/directions/part3.mp3" "part3.mp3"
copy_if_needed "$AUDIO_SOURCE_DIR/Direction Question 8-10.mp3" "$AUDIO_TARGET_DIR/directions/part4.mp3" "part4.mp3"
copy_if_needed "$AUDIO_SOURCE_DIR/Direction Question 11.mp3" "$AUDIO_TARGET_DIR/directions/part5.mp3" "part5.mp3"

# Set permissions
echo "🔐 Setting permissions..."
chmod -R 644 "$AUDIO_TARGET_DIR"/*
chown -R www-data:www-data "$AUDIO_TARGET_DIR"

echo "✅ Audio files setup completed!"
echo ""
echo "📝 Next: Update Nginx config and restart:"
echo "   1. Add audio location block to /etc/nginx/sites-available/mini-ielts-score"
echo "   2. sudo nginx -t"
echo "   3. sudo systemctl reload nginx"

