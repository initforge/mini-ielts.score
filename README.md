# TOEIC Speaking & Writing Lab

Ứng dụng đánh giá TOEIC Speaking và Writing sử dụng React + Vite + Vercel Serverless Functions.

## Tech Stack

- **Frontend**: React 18 + Vite + TypeScript
- **Styling**: Tailwind CSS
- **Animations**: Framer Motion
- **Backend**: Vercel Serverless Functions
- **AI**: Google Gemini API

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Deployment

### Vercel

1. Push code lên GitHub/GitLab
2. Import project vào Vercel
3. Vercel sẽ tự động detect và deploy:
   - Frontend: Build từ `vite.config.ts`
   - API Routes: Tự động detect từ folder `/api`

### Environment Variables

Không cần setup environment variables vì API key được lưu trong localStorage của user.

## Project Structure

```
├── api/                    # Vercel serverless functions
│   ├── grade-speaking.ts
│   ├── grade-writing.ts
│   └── lib/                # Shared lib for API
├── src/
│   ├── components/         # React components
│   ├── contexts/           # React contexts
│   ├── lib/                # Utilities và types
│   ├── App.tsx             # Main app component
│   ├── main.tsx            # Entry point
│   └── index.css           # Global styles
├── public/                 # Static assets
├── index.html
├── vite.config.ts
├── tailwind.config.ts
└── vercel.json             # Vercel config
```

## Features

- ✅ TOEIC Speaking test với audio recording
- ✅ TOEIC Writing test với word count
- ✅ Image upload cho questions
- ✅ Real-time grading với Gemini AI
- ✅ Detailed feedback và scoring
- ✅ Dark/Light theme
- ✅ Responsive design

## Notes

- API routes được deploy như Vercel serverless functions
- Frontend được build thành static files và deploy lên Vercel CDN
- Tất cả state được lưu trong sessionStorage/localStorage (client-side)
