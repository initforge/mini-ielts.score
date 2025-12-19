import http from 'http';
import { URL } from 'url';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { pathToFileURL } from 'url';

// Simple dev server to handle API requests locally
// This wraps Vercel serverless functions for local development

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface VercelRequest {
  method: string;
  body: any;
  query: Record<string, string>;
  headers: Record<string, string>;
}

interface VercelResponse {
  status: (code: number) => VercelResponse;
  json: (data: any) => void;
  _statusCode: number;
  _data: any;
}

function createVercelResponse(): VercelResponse {
  const res: VercelResponse = {
    _statusCode: 200,
    _data: null,
    status(code: number) {
      this._statusCode = code;
      return this;
    },
    json(data: any) {
      this._data = data;
    }
  };
  return res;
}

// Dynamically import handlers với đường dẫn tuyệt đối
async function loadHandler(relativePath: string) {
  try {
    // Chuyển đường dẫn tương đối thành tuyệt đối
    const absolutePath = join(__dirname, relativePath);
    const fileUrl = pathToFileURL(absolutePath).href;
    const module = await import(fileUrl);
    
    if (!module.default) {
      throw new Error(`Handler không có default export: ${relativePath}`);
    }
    
    return module.default;
  } catch (error) {
    console.error(`[Dev Server] Lỗi khi load handler từ ${relativePath}:`, error);
    throw error;
  }
}

// Dùng port riêng cho dev API server để tránh đụng với process khác
const PORT = 4000;

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  const pathname = url.pathname;

  console.log(`[Dev Server] ${req.method} ${pathname}`);

  // Route to appropriate handler
  let handler: any = null;
  
  if (pathname === '/api/grade-speaking') {
    handler = await loadHandler('../api/grade-speaking.ts');
  } else if (pathname === '/api/grade-writing') {
    handler = await loadHandler('../api/grade-writing.ts');
  }

  if (!handler) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  // Parse body for POST requests
  let rawBody = '';
  for await (const chunk of req) {
    rawBody += chunk;
  }

  let parsedBody: any = {};
  if (rawBody) {
    try {
      parsedBody = JSON.parse(rawBody);
    } catch (err) {
      console.error('[Dev Server] Failed to parse JSON body:', err);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      return;
    }
  }

  const vercelReq: VercelRequest = {
    method: req.method || 'GET',
    body: parsedBody,
    query: Object.fromEntries(url.searchParams),
    headers: req.headers as Record<string, string>,
  };

  const vercelRes = createVercelResponse();

  try {
    await handler(vercelReq, vercelRes);
    
    res.writeHead(vercelRes._statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(vercelRes._data));
  } catch (error) {
    console.error('[Dev Server] Error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
});

server.listen(PORT, () => {
  console.log(`\n🚀 Dev API Server running at http://localhost:${PORT}`);
  console.log(`   - POST /api/grade-speaking`);
  console.log(`   - POST /api/grade-writing\n`);
});

