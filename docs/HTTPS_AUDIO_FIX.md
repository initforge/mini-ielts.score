# Fix HTTPS 404 cho Audio Files

## Vấn đề
Audio files trả về 404 khi truy cập qua HTTPS (port 443) vì HTTPS server block thiếu `location /audio`.

## Giải pháp

### Cách 1: Chạy script tự động (Khuyến nghị)

```bash
# Trên VPS
cd /var/www/mini-ielts-score
bash scripts/add-audio-to-https.sh
```

### Cách 2: Thêm thủ công

1. **SSH vào VPS:**
```bash
ssh root@165.22.246.35
```

2. **Mở nginx config:**
```bash
sudo nano /etc/nginx/sites-available/mini-ielts-score
```

3. **Tìm HTTPS server block (listen 443) và thêm location /audio:**

Tìm dòng:
```nginx
server {
    listen 443 ssl http2;
    server_name webinprogress.click www.webinprogress.click;
    # ... các config khác ...
```

Thêm vào TRƯỚC dòng `}` đóng server block:
```nginx
    # Audio files location
    location /audio/speaking/ {
        alias /var/www/mini-ielts-score/public/audio/speaking/;
        
        # Cache audio files for 1 year
        add_header Cache-Control "public, max-age=31536000";
        
        # CORS headers
        add_header Access-Control-Allow-Origin "*";
        add_header Access-Control-Allow-Methods "GET, OPTIONS";
        
        # MIME types for audio
        types {
            audio/mpeg mp3;
            audio/mp3 mp3;
        }
        default_type audio/mpeg;
        
        # Fallback if file doesn't exist
        try_files $uri =404;
    }
```

4. **Test và restart nginx:**
```bash
sudo nginx -t
sudo systemctl restart nginx
```

5. **Test HTTPS audio:**
```bash
curl -k -I https://165.22.246.35/audio/speaking/system/beep.mp3
```

Nếu thành công, bạn sẽ thấy `HTTP/2 200` thay vì `HTTP/2 404`.

## Kiểm tra

```bash
# Kiểm tra HTTPS block có audio location không
sudo cat /etc/nginx/sites-available/mini-ielts-score | grep -A 20 "listen 443" | grep -A 15 "location /audio"

# Test HTTPS
curl -k -I https://165.22.246.35/audio/speaking/system/beep.mp3
```

## Lưu ý

- Đảm bảo audio files đã được upload vào `/var/www/mini-ielts-score/public/audio/speaking/`
- Đảm bảo permissions đúng: `chown -R www-data:www-data /var/www/mini-ielts-score/public/audio`
- Nếu vẫn 404, kiểm tra:
  - File có tồn tại không: `ls -la /var/www/mini-ielts-score/public/audio/speaking/system/beep.mp3`
  - Nginx error log: `sudo tail -f /var/log/nginx/error.log`

