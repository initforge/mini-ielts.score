import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { pool } from '../services/db.service';
import { registerSchema, loginSchema } from '../validations/auth.validation';
import { HttpError } from '../errors/http.error';
import { storeSessionJti, revokeSessionJti } from '../middlewares/auth.middleware';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

const scryptAsync = promisify(scrypt);
const COOKIE_NAME = 'token';
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const router = Router();

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('Server configuration error: JWT_SECRET is missing or too short');
  }
  return secret;
}

// Precomputed dummy hash so failed logins take the same scrypt cost as
// successful ones (mitigates timing-based user enumeration).
const dummyHashPromise = hashPassword('dummy-password-for-timing-safety');

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString('hex')}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hash, 'hex');
  return derivedKey.length === expected.length && timingSafeEqual(derivedKey, expected);
}

// R3-SECURITY: signToken now mints a random jti per session. The jti is
// persisted in Redis (jti:<jti> -> userId, TTL = JWT_EXPIRES_IN) so logout
// can revoke the session server-side and requireAuth rejects revoked tokens.
function createSession(userId: number, email: string): { token: string; jti: string } {
  const jti = randomUUID();
  const token = jwt.sign({ sub: String(userId), email, jti }, getJwtSecret(), {
    expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as jwt.SignOptions['expiresIn'],
  });
  return { token, jti };
}

function setAuthCookie(res: Response, token: string): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: COOKIE_MAX_AGE_MS,
    path: '/',
  });
}

router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, displayName } = registerSchema.parse(req.body);

    const passwordHash = await hashPassword(password);
    try {
      const [result] = await pool.query<ResultSetHeader>(
        'INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)',
        [email, passwordHash, displayName || email.split('@')[0]]
      );

      const userId = result.insertId;
      const { token, jti } = createSession(userId, email);
      // R3-SECURITY: register the session in Redis before handing out the
      // cookie — a session that cannot be revoked is not issued.
      await storeSessionJti(jti, String(userId));
      setAuthCookie(res, token);
      // INJ-003: token never in JSON body — httpOnly cookie carries the session.
      return res.status(201).json({
        user: { id: String(userId), email, displayName: displayName || email.split('@')[0] },
      });
    } catch (err: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((err as any)?.code === 'ER_DUP_ENTRY') {
        throw new HttpError(409, 'Email is already registered');
      }
      throw err;
    }
  } catch (err: unknown) {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((err as any)?.name === 'ZodError') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return res.status(400).json({ error: (err as any).errors });
    }
    console.error('[auth] register failed:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT id, email, password_hash, display_name FROM users WHERE email = ? LIMIT 1',
      [email]
    );

    const userRow = rows[0] as
      | { id: number; email: string; password_hash: string; display_name: string }
      | undefined;

    // Always verify against a real or dummy hash to keep timing constant.
    const hashToCheck = userRow ? userRow.password_hash : await dummyHashPromise;
    const passwordOk = await verifyPassword(password, hashToCheck);

    if (!userRow || !passwordOk) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const { token, jti } = createSession(userRow.id, userRow.email);
    // R3-SECURITY: register the session in Redis before handing out the cookie.
    await storeSessionJti(jti, String(userRow.id));
    setAuthCookie(res, token);
    // INJ-003: token never in JSON body — httpOnly cookie carries the session.
    return res.json({
      user: { id: String(userRow.id), email: userRow.email, displayName: userRow.display_name },
    });
  } catch (err: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((err as any)?.name === 'ZodError') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return res.status(400).json({ error: (err as any).errors });
    }
    console.error('[auth] login failed:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/logout', async (req: Request, res: Response) => {
  // R3-SECURITY: revoke the server-side session before clearing the cookie so
  // a stolen cookie is dead even if the client never actually logged out.
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  const cookieToken = cookies && cookies[COOKIE_NAME];
  if (cookieToken) {
    try {
      const decoded = jwt.verify(cookieToken, getJwtSecret());
      if (typeof decoded !== 'string' && typeof decoded.jti === 'string' && decoded.jti.length > 0) {
        await revokeSessionJti(decoded.jti);
      }
    } catch {
      // Token already invalid — nothing to revoke.
    }
  }
  res.clearCookie(COOKIE_NAME, { path: '/' });
  return res.json({ success: true });
});

export default router;
