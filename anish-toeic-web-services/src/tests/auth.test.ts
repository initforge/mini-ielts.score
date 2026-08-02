import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { scryptSync } from 'crypto';
import app, { clientIp } from '../server';
import authRoutes from '../routes/auth.routes';
import { pool } from '../services/db.service';

// R3-SECURITY: in-memory ioredis substitute. login/register SETEX the jti key,
// middleware EXISTS it, logout DELs it — all through this shared store.
jest.mock('ioredis', () => {
  const store = new Map<string, number>();
  const instance = {
    setex: jest.fn((key: string, ttl: number) => {
      store.set(key, Date.now() + ttl * 1000);
      return Promise.resolve('OK');
    }),
    exists: jest.fn((key: string) => Promise.resolve(store.has(key) ? 1 : 0)),
    del: jest.fn((key: string) => {
      store.delete(key);
      return Promise.resolve(1);
    }),
    set: jest.fn(),
    get: jest.fn(),
    quit: jest.fn(),
  };
  return { Redis: jest.fn(() => instance) };
});

jest.mock('../services/db.service', () => ({
  pool: { query: jest.fn(), getConnection: jest.fn() },
}));

const SALT = 'a'.repeat(32);
const passwordHashFor = (pw: string) => `${SALT}:${scryptSync(pw, SALT, 64).toString('hex')}`;

describe('R3-SECURITY: jti revocation & trust proxy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('revokes the session on logout: login → authed 200 → logout → old cookie 401', async () => {
    const mockQuery = pool.query as jest.Mock;

    // login issues a jti and stores it in Redis
    mockQuery.mockResolvedValueOnce([
      [{ id: 7, email: 'jti@test.dev', display_name: 'Jti', password_hash: passwordHashFor('password123') }],
    ]);
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'jti@test.dev', password: 'password123' });
    expect(login.status).toBe(200);
    const setCookie = login.headers['set-cookie'] as unknown as string[] | undefined;
    const cookie = setCookie?.find((c) => c.startsWith('token='))?.split(';')[0] as string;
    expect(cookie.length).toBeGreaterThan(0);

    // fresh session is accepted by the protected router
    mockQuery.mockResolvedValue([[]]); // history rows
    const authed = await request(app).get('/api/toeic-attempts').set('Cookie', cookie);
    expect(authed.status).toBe(200);

    // logout revokes the server-side session (DEL jti) before clearing cookie
    const logout = await request(app).post('/api/auth/logout').set('Cookie', cookie);
    expect(logout.status).toBe(200);

    // the OLD cookie is now rejected — the Redis jti key is gone
    const after = await request(app).get('/api/toeic-attempts').set('Cookie', cookie);
    expect(after.status).toBe(401);
    expect(after.body.error).toContain('Session revoked');
  });

  it('rejects a Bearer token whose jti was revoked even if the signature is valid', async () => {
    const mockQuery = pool.query as jest.Mock;
    mockQuery.mockResolvedValue([[]]);

    // forge a VALIDLY-SIGNED token (same secret) with an arbitrary jti that was
    // never stored in Redis — equivalent to a revoked session
    const forged = jwt.sign({ sub: '1', jti: 'never-stored-jti' }, process.env.JWT_SECRET as string);
    const res = await request(app)
      .get('/api/toeic-attempts')
      .set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Session revoked');
  });

  it('TRUST_PROXY=false ignores spoofed X-Forwarded-For / cf-connecting-ip (shared 127.0.0.1 bucket)', async () => {
    // Standalone wiring identical to server.ts: clientIp is the production
    // rate-limit identity function, mounted on a low-limit bucket so the test
    // needs few requests. TRUST_PROXY is false in the test env.
    const proxyApp = express();
    proxyApp.use(express.json());
    proxyApp.use(cookieParser());
    proxyApp.use('/api/auth', rateLimit({ keyGenerator: clientIp, windowMs: 60000, limit: 5 }), authRoutes);

    const mockQuery = pool.query as jest.Mock;
    mockQuery.mockResolvedValue([[]]); // unknown user → 401

    const spoofedIps = ['203.0.113.1', '198.51.100.9', '10.20.30.40', '172.16.0.7', '9.9.9.9'];
    const statuses: number[] = [];
    for (const ip of spoofedIps) {
      const res = await request(proxyApp)
        .post('/api/auth/login')
        .set('X-Forwarded-For', ip)
        .set('cf-connecting-ip', ip)
        .send({ email: 'a@b.com', password: 'password123' });
      statuses.push(res.status);
    }
    // Five DIFFERENT spoofed IPs still filled ONE bucket (real client stays
    // 127.0.0.1) — the 6th request is rate-limited regardless of its spoofed IP.
    const blocked = await request(proxyApp)
      .post('/api/auth/login')
      .set('X-Forwarded-For', '203.0.113.200')
      .set('cf-connecting-ip', '203.0.113.200')
      .send({ email: 'a@b.com', password: 'password123' });

    expect(statuses.every((s) => s === 401)).toBe(true);
    expect(blocked.status).toBe(429);
  });
});
