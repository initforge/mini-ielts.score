import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import net from 'net';
import toeicRoutes from './routes/toeic.routes';
import authRoutes from './routes/auth.routes';
import adminRoutes from './routes/admin.routes';
import { validateServerEnv } from './config/env';

// Validate environment variables on startup (fail-fast, incl. JWT_SECRET)
const env = validateServerEnv();

const app = express();
const port = parseInt(env.PORT || '7000', 10);

const allowedOrigins = env.CORS_ORIGIN.split(',').map((o) => o.trim());

// INJ-003: trust the first reverse proxy (nginx/Cloudflare) ONLY when explicitly
// enabled. Off by default so dev keeps direct client IPs for rate limiting.
if (env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

/**
 * INJ-003 / R2-SEC-FIX (N1): rate-limit identity. `cf-connecting-ip` is
 * client-supplied (spoofable when the origin is reachable without Cloudflare),
 * so trust it ONLY when TRUST_PROXY=true (a trusted reverse proxy in front
 * overwrites the header) — and even then require a real IP literal (net.isIP).
 * Otherwise fall back to Express's req.ip (which honors trust proxy). Never
 * logs the raw header.
 */
function clientIp(req: express.Request): string {
  if (env.TRUST_PROXY === 'true') {
    const cfIp = req.headers['cf-connecting-ip'];
    if (typeof cfIp === 'string' && net.isIP(cfIp) > 0) {
      return cfIp;
    }
  }
  return req.ip || 'unknown';
}

// R3-SECURITY: exported so the trust-proxy test can prove that with
// TRUST_PROXY=false a direct client's spoofed headers are ignored and the
// rate-limit bucket stays shared on the real client IP (127.0.0.1).
export { clientIp };

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

// INJ-003: rate-limit identity from cf-connecting-ip (validated) else req.ip.
const rateLimitOptions = {
  keyGenerator: clientIp,
  standardHeaders: true,
  legacyHeaders: false,
};

// Rate-limit credential endpoints (login/register brute-force mitigation)
const authLimiter = rateLimit({ ...rateLimitOptions, windowMs: 15 * 60 * 1000, limit: 20 });
const attemptsCreateLimiter = rateLimit({ ...rateLimitOptions, windowMs: 15 * 60 * 1000, limit: 30 });
const responsesLimiter = rateLimit({ ...rateLimitOptions, windowMs: 15 * 60 * 1000, limit: 120 });
const mediaPresignLimiter = rateLimit({ ...rateLimitOptions, windowMs: 15 * 60 * 1000, limit: 60 });
const submitLimiter = rateLimit({ ...rateLimitOptions, windowMs: 15 * 60 * 1000, limit: 30 });
const gradingStatusLimiter = rateLimit({ ...rateLimitOptions, windowMs: 15 * 60 * 1000, limit: 120 });

// Mount auth router BEFORE the protected TOEIC router so credential
// endpoints are not swallowed by requireAuth.
app.use('/api/auth', authLimiter, authRoutes);

// INJ-003: per-endpoint limits for authenticated toeic routes (router-level
// middleware mounted on the same prefixes as the routes below).
app.use('/api/toeic-exams/:id/attempts', attemptsCreateLimiter);
app.use('/api/toeic-attempts/:id/responses', responsesLimiter);
app.use('/api/toeic-attempts/:id/media/presign', mediaPresignLimiter);
app.use('/api/toeic-attempts/:id/submit', submitLimiter);
app.use('/api/toeic-attempts/:id/grading-status', gradingStatusLimiter);

// Mount TOEIC router under /api
app.use('/api', toeicRoutes);

// Mount ADMIN router under /api/admin (protected by requireAuth + requireAdmin).
app.use('/api/admin', adminRoutes);

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

export default app;
