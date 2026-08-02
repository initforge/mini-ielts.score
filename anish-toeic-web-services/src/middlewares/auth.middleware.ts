import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Redis } from 'ioredis';

const JWT_SECRET_MIN_LENGTH = 32;
const COOKIE_NAME = 'token';
const JTI_CACHE_TTL_MS = 5000;

// R3-SECURITY: shared Redis client + jti session store (server side). Login/
// register call storeSessionJti; logout calls revokeSessionJti; requireAuth
// checks the key exists before granting. The in-memory cache (TTL 5s) avoids
// a Redis round-trip on every request; revokeSessionJti deletes the cache
// entry so revocation is effective immediately, not up to 5s later.
// ponytail: refactor to DI when second client needed
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  lazyConnect: true, // ponytail: remove lazyConnect when DI container added
  maxRetriesPerRequest: 3,
});

/** Idempotent test-safe Redis shutdown. Safe to call multiple times. */
export function shutdownRedis(): Promise<void> {
  if (!redis) return Promise.resolve();
  if (typeof (redis as Redis & { quit?: unknown }).quit !== 'function') return Promise.resolve();
  const s = redis.status;
  if (s === 'wait' || s === 'close' || (s as string) === 'closing') return Promise.resolve();
  return Promise.resolve(redis.quit()).then(() => undefined).catch(() => {/* already closing/closed */});
}

const jtiCache = new Map<string, { ok: boolean; expiresAt: number }>();

export function jtiKey(jti: string): string {
  return `jti:${jti}`;
}

/** Seconds for a Redis SETEX key, parsed from jsonwebtoken-style expiresIn. */
function jwtExpirySeconds(expiresIn: string): number {
  const m = /^(\d+)\s*([smhd]?)$/i.exec(expiresIn.trim());
  if (!m) return 7 * 24 * 60 * 60;
  const n = parseInt(m[1], 10);
  switch ((m[2] || 's').toLowerCase()) {
    case 'm':
      return n * 60;
    case 'h':
      return n * 3600;
    case 'd':
      return n * 86400;
    default:
      return n; // plain seconds
  }
}

/** Record a freshly-issued session token so it can be revoked later. */
export async function storeSessionJti(jti: string, userId: string): Promise<void> {
  const ttl = jwtExpirySeconds(process.env.JWT_EXPIRES_IN || '7d');
  await redis.setex(jtiKey(jti), ttl, userId);
}

/** Revoke a session: drop the Redis key and the middleware cache entry. */
export async function revokeSessionJti(jti: string): Promise<number> {
  jtiCache.delete(jti);
  return redis.del(jtiKey(jti));
}

async function isJtiValid(jti: string): Promise<boolean> {
  const cached = jtiCache.get(jti);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.ok;
  }
  let exists = 0;
  try {
    exists = await redis.exists(jtiKey(jti));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[auth] Redis jti check failed — failing closed (401):', msg);
    return false;
  }
  const ok = exists === 1;
  // Cache both hits and misses; misses expire fast so a re-issued key is not
  // blocked for long, and a revoked key stays revoked.
  jtiCache.set(jti, { ok, expiresAt: Date.now() + JTI_CACHE_TTL_MS });
  return ok;
}

// Adaptable auth: accepts a Bearer token (Authorization header) or an httpOnly
// session cookie named `token`. No x-user-id header, no mock/fallback secret.
export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < JWT_SECRET_MIN_LENGTH) {
    return res.status(500).json({ error: 'Server configuration error: JWT_SECRET is missing or too short' });
  }

  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  try {
    const decoded = jwt.verify(token, secret);
    if (typeof decoded === 'string' || typeof decoded.sub !== 'string' || decoded.sub.length === 0) {
      return res.status(401).json({ error: 'Unauthorized: Invalid token payload' });
    }
    // A7: parse/validate decoded.sub as a safe positive integer before DB use.
    // Reject non-numeric, zero, negative, or unsafe-integer subs fail-closed (401).
    const subInt = parseInt(decoded.sub, 10);
    if (!Number.isSafeInteger(subInt) || subInt <= 0 || String(subInt) !== decoded.sub) {
      return res.status(401).json({ error: 'Unauthorized: Invalid token payload' });
    }
    // R3-SECURITY: every token signed by this codebase carries a jti; a token
    // without one (pre-R3 or third-party) is still signature-verified but is
    // accepted without a revocation lookup.
    if (typeof decoded.jti === 'string' && decoded.jti.length > 0) {
      if (!(await isJtiValid(decoded.jti))) {
        return res.status(401).json({ error: 'Unauthorized: Session revoked or expired' });
      }
    }
    req.user = { id: decoded.sub };
    next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }
};

function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    if (token.length > 0) return token;
  }
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  const cookieToken = cookies && cookies[COOKIE_NAME];
  return cookieToken && cookieToken.length > 0 ? cookieToken : null;
}
