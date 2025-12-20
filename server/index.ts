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

// Resolve dist directory path (absolute path để tránh lỗi với tsx)
const distPath = path.resolve(__dirname, '../dist');
const indexPath = path.resolve(distPath, 'index.html');

// Log paths để debug
console.log(`📁 __dirname: ${__dirname}`);
console.log(`📁 distPath: ${distPath}`);
console.log(`📁 indexPath: ${indexPath}`);

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files from dist folder (production build)
app.use(express.static(distPath));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.post('/api/grade-speaking', async (req, res) => {
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
  // Sử dụng absolute path đã resolve ở trên
  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error(`❌ Error sending index.html: ${err.message}`);
      console.error(`   Requested path: ${req.path}`);
      console.error(`   Resolved indexPath: ${indexPath}`);
      res.status(500).send('Error loading application');
    }
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   - POST /api/grade-speaking`);
  console.log(`   - POST /api/grade-writing`);
  console.log(`   - GET /health`);
});
