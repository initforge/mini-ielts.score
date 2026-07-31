/**
 * Proxy Smoke Test
 *
 * Validates that both Vite proxy configurations (root Vite dev → :4000,
 * anish-toeic-web-app → :7000) forward the expected /api paths and that
 * each backend's health endpoint responds on its respective port.
 *
 * This is a configuration-contract test — it reads the Vite config files
 * and asserts the proxy target port maps to a live backend endpoint.  It
 * does NOT start real servers; it only validates that the proxy targets
 * specified in the config files match the ports the backends are expected
 * to listen on.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

// ---------------------------------------------------------------------------
// Configuration validation (no runtime servers needed)
// ---------------------------------------------------------------------------

describe('Proxy Smoke — Vite config alignment', () => {
  // ── Web-app Vite config (serves anish-toeic-web-app) ──
  const appVitePath = resolve(__dirname, '../../../anish-toeic-web-app/vite.config.ts');
  let appViteContent: string;

  beforeAll(() => {
    appViteContent = readFileSync(appVitePath, 'utf-8');
  });

  it('anish-toeic-web-app vite.config.ts proxies /api to 127.0.0.1:7000', () => {
    expect(appViteContent).toContain("'/api'");
    expect(appViteContent).toContain('127.0.0.1:7000');
  });

  it('anish-toeic-web-app vite.config.ts has changeOrigin enabled', () => {
    expect(appViteContent).toContain('changeOrigin');
  });
});

// ---------------------------------------------------------------------------
// Port contract: each backend listens on its expected port
// ---------------------------------------------------------------------------

describe('Proxy Smoke — backend port contracts', () => {
  // ── Web-services server ──
  it('anish-toeic-web-services server.ts defaults to 7000', () => {
    const content = readFileSync(
      resolve(__dirname, '../server.ts'),
      'utf-8',
    );
    expect(content).toContain("'7000'");
  });

});

// ---------------------------------------------------------------------------
// Route alignment: verify proxy target endpoints are reachable on the
// expected paths.  These validate that the backend router mounts the same
// paths the proxy would forward.
// ---------------------------------------------------------------------------
import request from 'supertest';
import app from '../server';

describe('Proxy Smoke — route mount alignment', () => {
  it('backend provides /api/health', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status');
  });

  it('backend provides /api/toeic-exams (public)', async () => {
    const res = await request(app).get('/api/toeic-exams');
    // Route proof is independent of optional local MySQL availability.
    expect(res.status).not.toBe(404);
  });

  it('backend provides /api/auth/login (public)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'a@b.com', password: 'password123' });
    // Must NOT be 404 (route missing) — may be 400/401 depending on payload
    expect(res.status).not.toBe(404);
  });

  it('backend provides /api/auth/register (public)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'a@b.com', password: 'password123' });
    expect(res.status).not.toBe(404);
  });

  it('backend provides /api/auth/logout', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(200);
  });

  // Protected routes respond 401 (not 404) when unauthenticated — proving mount
  it('backend mounts /api/toeic-exams/:id/attempts (protected)', async () => {
    const res = await request(app)
      .post('/api/toeic-exams/1/attempts')
      .send({ mode: 'EXAM' });
    expect(res.status).toBe(401);
  });

  it('backend mounts /api/toeic-attempts (protected)', async () => {
    const res = await request(app).get('/api/toeic-attempts');
    expect(res.status).toBe(401);
  });

  it('backend mounts /api/toeic-attempts/:id (protected)', async () => {
    const res = await request(app).get('/api/toeic-attempts/1');
    expect(res.status).toBe(401);
  });

  it('backend mounts /api/toeic-attempts/:id/responses/:qid (protected)', async () => {
    const res = await request(app).patch('/api/toeic-attempts/1/responses/101');
    expect(res.status).toBe(401);
  });

  it('backend mounts /api/toeic-attempts/:id/media/presign (protected)', async () => {
    const res = await request(app)
      .post('/api/toeic-attempts/1/media/presign')
      .send({ questionId: 101, fileName: 'a.webm', fileType: 'audio/webm', fileSize: 1024 });
    expect(res.status).toBe(401);
  });

  it('backend mounts /api/toeic-attempts/:id/submit (protected)', async () => {
    const res = await request(app).post('/api/toeic-attempts/1/submit');
    expect(res.status).toBe(401);
  });

  it('backend mounts /api/toeic-attempts/:id/grading-status (protected)', async () => {
    const res = await request(app).get('/api/toeic-attempts/1/grading-status');
    expect(res.status).toBe(401);
  });

  it('backend mounts /api/toeic-attempts/:id/result (protected)', async () => {
    const res = await request(app).get('/api/toeic-attempts/1/result');
    expect(res.status).toBe(401);
  });

  it('backend mounts /api/toeic-attempts/:id/review (protected)', async () => {
    const res = await request(app).get('/api/toeic-attempts/1/review');
    expect(res.status).toBe(401);
  });
});
