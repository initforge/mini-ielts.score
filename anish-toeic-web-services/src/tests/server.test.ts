import request from 'supertest';
import app from '../server';
import { validateEnv } from '../config/env';

describe('Server & Env Validation (AC4 & AC10)', () => {
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
    // Regression: auth router must be mounted before the toeic router's
    // requireAuth guard, otherwise login/register respond 401 "Missing token".
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'a@b.com', password: 'password123' });
    expect(res.status).not.toBe(401);
    expect(res.body.error).not.toContain('Missing token');
  });

  it('should enforce CORS origin allowlist', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'http://localhost:5173');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('should fail-fast if DB_HOST is invalid/empty (negative path invariant)', () => {
    expect(() => {
      validateEnv({ DB_HOST: '' });
    }).toThrow(/Environment validation failed/);
  });
});
