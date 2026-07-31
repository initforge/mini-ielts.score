import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import toeicRoutes from './routes/toeic.routes';
import authRoutes from './routes/auth.routes';
import { validateEnv } from './config/env';

// Validate environment variables on startup (fail-fast, incl. JWT_SECRET)
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
app.use(cookieParser());

// Public health check route
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'anish-toeic-web-services' });
});

// Rate-limit credential endpoints (login/register brute-force mitigation)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

// Mount auth router BEFORE the protected TOEIC router so credential
// endpoints are not swallowed by requireAuth.
app.use('/api/auth', authLimiter, authRoutes);

// Mount TOEIC router under /api
app.use('/api', toeicRoutes);

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

export default app;
