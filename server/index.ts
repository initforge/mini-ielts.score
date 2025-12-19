import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import API handlers
import gradeSpeakingHandler from '../api/grade-speaking.ts';
import gradeWritingHandler from '../api/grade-writing.ts';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files from dist folder (production build)
app.use(express.static(path.join(__dirname, '../dist')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.post('/api/grade-speaking', async (req, res) => {
  try {
    // Log request body size để debug
    const bodySize = JSON.stringify(req.body).length;
    const bodySizeKB = Math.round(bodySize / 1024);
    console.log(`[Express] POST /api/grade-speaking: bodySize=${bodySizeKB}KB, hasAnswers=${!!req.body?.answers}, answersCount=${req.body?.answers?.length || 0}`);
    
    // Log audioBase64 info nếu có
    if (req.body?.answers && Array.isArray(req.body.answers)) {
      req.body.answers.forEach((answer: any) => {
        if (answer.audioBase64) {
          const audioSizeKB = Math.round(answer.audioBase64.length * 3 / 4 / 1024);
          console.log(`[Express] Answer ${answer.questionId}: audioBase64 length=${answer.audioBase64.length}, ~${audioSizeKB}KB`);
        } else {
          console.log(`[Express] Answer ${answer.questionId}: NO audioBase64`);
        }
      });
    }
    
    // Convert Express request to Vercel-like format
    const vercelReq = {
      method: req.method,
      body: req.body,
      query: req.query as Record<string, string>,
      headers: req.headers as Record<string, string>,
    };

    const vercelRes = {
      _statusCode: 200,
      _data: null,
      status(code: number) {
        this._statusCode = code;
        return this;
      },
      json(data: any) {
        this._data = data;
      },
    };

    await gradeSpeakingHandler(vercelReq as any, vercelRes as any);
    
    res.status(vercelRes._statusCode).json(vercelRes._data);
  } catch (error: any) {
    console.error('Error in /api/grade-speaking:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/grade-writing', async (req, res) => {
  try {
    // Convert Express request to Vercel-like format
    const vercelReq = {
      method: req.method,
      body: req.body,
      query: req.query as Record<string, string>,
      headers: req.headers as Record<string, string>,
    };

    const vercelRes = {
      _statusCode: 200,
      _data: null,
      status(code: number) {
        this._statusCode = code;
        return this;
      },
      json(data: any) {
        this._data = data;
      },
    };

    await gradeWritingHandler(vercelReq as any, vercelRes as any);
    
    res.status(vercelRes._statusCode).json(vercelRes._data);
  } catch (error: any) {
    console.error('Error in /api/grade-writing:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Serve React app for all other routes (SPA routing)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   - POST /api/grade-speaking`);
  console.log(`   - POST /api/grade-writing`);
  console.log(`   - GET /health`);
});
