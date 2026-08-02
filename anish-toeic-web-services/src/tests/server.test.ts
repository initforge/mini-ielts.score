import request from 'supertest';
import { randomBytes, scrypt } from 'crypto';
import { promisify } from 'util';
import app from '../server';
import { validateServerEnv, validateWorkerEnv } from '../config/env';
import { pool } from '../services/db.service';

// R2-SEC-FIX: DB-independent. The auth router must be mounted BEFORE the TOEIC
// router's requireAuth guard; with a live DB an unknown-email login returns 401
// "Invalid email or password" (handler reached, not swallowed), while a fixture
// user succeeds with a session cookie. Mock the DB layer so the suite stays
// green with AND without a reachable MySQL.
jest.mock('../services/db.service', () => ({
  pool: { query: jest.fn() },
}));

// R3-SECURITY: stub ioredis — login persists its jti key in an in-memory store.
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

const mockQuery = pool.query as jest.Mock;
const scryptAsync = promisify(scrypt);

describe('Server & Env Validation (AC4 & AC10)', () => {
  beforeEach(() => {
    // Default: empty result rows. Tests override per-call.
    mockQuery.mockReset();
    mockQuery.mockResolvedValue([[]]);
  });

  it('should respond to /api/health with ok status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', service: 'anish-toeic-web-services' });
  });

  it('should mount /api/toeic-exams route', async () => {
    const res = await request(app).get('/api/toeic-exams');
    // Router is mounted if it responds (either 200 or controlled status, not 404 HTML)
    expect(res.status).not.toBe(404);
  });

  it('must NOT let the protected TOEIC router swallow /api/auth routes', async () => {
    // Unknown email → auth handler rejects (401 "Invalid email or password").
    // A swallowed route would instead answer 401 "Unauthorized: Missing token".
    mockQuery.mockResolvedValueOnce([[]]);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'a@b.com', password: 'password123' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password');
  });

  it('logs in a known fixture user with a session cookie', async () => {
    // Real scrypt hash of the plaintext password (same scheme as auth.routes).
    const salt = randomBytes(16).toString('hex');
    const derivedKey = (await scryptAsync('password123', salt, 64)) as Buffer;
    mockQuery.mockResolvedValueOnce([
      [{ id: 42, email: 'fixture@t.dev', password_hash: `${salt}:${derivedKey.toString('hex')}`, display_name: 'Fixture' }],
    ]);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'fixture@t.dev', password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({ id: '42', email: 'fixture@t.dev', displayName: 'Fixture' });
    const setCookie = res.headers['set-cookie'] as unknown as string[] | undefined;
    expect(setCookie?.some((c) => c.startsWith('token='))).toBe(true);
  });

  it('should enforce CORS origin allowlist', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'http://localhost:5173');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('should fail-fast if DB_HOST is invalid/empty (negative path invariant)', () => {
    expect(() => {
      validateServerEnv({ DB_HOST: '' });
    }).toThrow(/Environment validation failed/);
  });

  it('R3: rejects CORS_ORIGIN=* (credentials:true is always set)', () => {
    expect(() => {
      validateServerEnv({
        DB_HOST: 'localhost',
        DB_USER: 'root',
        DB_NAME: 'anish_toeic_test',
        JWT_SECRET: 'a-real-looking-secret-that-is-long-enough-32ch',
        CORS_ORIGIN: '*',
      });
    }).toThrow(/CORS_ORIGIN/);
  });

  it('R3: worker env validation passes with all required vars', () => {
    const env = validateWorkerEnv({
      DB_HOST: 'localhost',
      DB_USER: 'root',
      DB_NAME: 'anish_toeic_test',
      JWT_SECRET: 'a-real-looking-secret-that-is-long-enough-32ch',
    });
    expect(env.REDIS_URL).toBeDefined();
    expect(env.CLOUDFLARE_AI_TIMEOUT_MS).toBe('60000');
  });

  it('R3: worker env validation fails when JWT_SECRET is missing', () => {
    expect(() => {
      validateWorkerEnv({ DB_HOST: 'localhost', DB_USER: 'root', DB_NAME: 'anish_toeic_test' });
    }).toThrow(/JWT_SECRET/);
  });

  it('R3: worker env validation fails closed on the documented placeholder', () => {
    expect(() => {
      validateWorkerEnv({
        DB_HOST: 'localhost',
        DB_USER: 'root',
        DB_NAME: 'anish_toeic_test',
        JWT_SECRET: 'REPLACE_WITH_STRONG_SECRET_32+chars',
      });
    }).toThrow(/REPLACE_WITH/);
  });
});
