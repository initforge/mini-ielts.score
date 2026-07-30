import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import toeicRoutes from './routes/toeic.routes';
import { validateEnv } from './config/env';

// Validate environment variables on startup (fail-fast)
const env = validateEnv();

const app = express();
const port = parseInt(env.PORT || '7000', 10);

const allowedOrigins = env.CORS_ORIGIN.split(',').map((o) => o.trim());

app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. server-to-server or curl)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('CORS policy violation: Origin not allowed'));
    },
    credentials: true,
  })
);
app.use(express.json());

// Public health check route
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'anish-toeic-web-services' });
});

// Mount TOEIC router under /api
app.use('/api', toeicRoutes);

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

export default app;
