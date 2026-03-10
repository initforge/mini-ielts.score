🇻🇳 [Đọc bằng tiếng Việt](README-vi.md)

# Mini IELTS Score — AI Writing Grader

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white) ![React](https://img.shields.io/badge/React-61DAFB?style=flat-square&logo=react&logoColor=white) ![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white) ![Gemini API](https://img.shields.io/badge/Gemini%20API-8E75B2?style=flat-square) ![Express](https://img.shields.io/badge/Express-000?style=flat-square&logo=express&logoColor=white) ![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white) ![Framer Motion](https://img.shields.io/badge/Framer%20Motion-0055FF?style=flat-square)

An AI-powered IELTS writing assessment tool that grades essays using Google Gemini API. Provides band scores, detailed feedback, and improvement suggestions — like having a personal IELTS examiner.

## Preview

![Mini IELTS Score — AI Writing Grader](docs/screenshot.png)

## What it does

- **Automated band scoring** — grades IELTS Writing Task 1 & 2
- **Criterion breakdown** — Task Response, Coherence, Lexical Resource, Grammar
- **Detailed feedback** — specific suggestions for improvement
- **Express backend** — API proxy for Gemini, rate limiting, CORS
- **Speaking test mode** — voice recording with audio playback

## How it works

```mermaid
sequenceDiagram
    User->>Frontend: Paste IELTS essay
    Frontend->>Express API: POST /api/grade
    Express API->>Gemini API: Analyze with band descriptors
    Gemini API-->>Express API: Structured scores + feedback
    Express API-->>Frontend: Display results
```

## Getting started

```bash
git clone https://github.com/initforge/mini-ielts.score.git
cd mini-ielts.score
cp env.example .env  # Add your Gemini API key
npm install
npm run dev
```

---

**Xuan Linh** — Fullstack Developer

[![GitHub](https://img.shields.io/badge/GitHub-initforge-181717?style=flat-square&logo=github)](https://github.com/initforge) [![LinkedIn](https://img.shields.io/badge/LinkedIn-linhnx--dev-0A66C2?style=flat-square&logo=linkedin)](https://linkedin.com/in/linhnx-dev)
