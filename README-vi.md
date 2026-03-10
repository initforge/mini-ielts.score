🇬🇧 [Read in English](README.md)

# Mini IELTS Score — Chấm điểm IELTS bằng AI

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white) ![React](https://img.shields.io/badge/React-61DAFB?style=flat-square&logo=react&logoColor=white) ![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white) ![Gemini API](https://img.shields.io/badge/Gemini%20API-8E75B2?style=flat-square) ![Express](https://img.shields.io/badge/Express-000?style=flat-square&logo=express&logoColor=white) ![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white) ![Framer Motion](https://img.shields.io/badge/Framer%20Motion-0055FF?style=flat-square)

Công cụ chấm điểm IELTS Writing bằng Google Gemini API. Cung cấp band score, nhận xét chi tiết và gợi ý cải thiện — như có giám khảo IELTS cá nhân.

## Xem trước

![Mini IELTS Score — Chấm điểm IELTS bằng AI](docs/screenshot.png)

## Tính năng chính

- **Chấm band score tự động** — IELTS Writing Task 1 & 2
- **Phân tích theo tiêu chí** — Task Response, Coherence, Lexical Resource, Grammar
- **Nhận xét chi tiết** — gợi ý cụ thể để cải thiện
- **Backend Express** — proxy Gemini API, rate limiting, CORS
- **Chế độ Speaking** — ghi âm giọng nói với phát lại audio

## Cách hoạt động

```mermaid
sequenceDiagram
    User->>Frontend: Paste bài luận IELTS
    Frontend->>Express API: POST /api/grade
    Express API->>Gemini API: Phân tích theo band descriptors
    Gemini API-->>Express API: Điểm + feedback có cấu trúc
    Express API-->>Frontend: Hiển thị kết quả
```

## Cài đặt

```bash
git clone https://github.com/initforge/mini-ielts.score.git
cd mini-ielts.score
cp env.example .env  # Thêm Gemini API key
npm install
npm run dev
```

---

**Xuan Linh** — Fullstack Developer

[![GitHub](https://img.shields.io/badge/GitHub-initforge-181717?style=flat-square&logo=github)](https://github.com/initforge) [![LinkedIn](https://img.shields.io/badge/LinkedIn-linhnx--dev-0A66C2?style=flat-square&logo=linkedin)](https://linkedin.com/in/linhnx-dev)
