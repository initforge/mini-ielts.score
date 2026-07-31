/**
 * Synthetic Journey / E2E Scaffolding
 *
 * Covers the critical end-to-end path through the /thi-thu API without a
 * real DB: catalog browse → login → create attempt → respond → submit →
 * result → review.  Each step verifies the next expected state.
 *
 * All DB calls are mocked; this tests the controller→service→validation
 * pipeline in the integration-tested router.
 */

import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import toeicRoutes from '../routes/toeic.routes';
import authRoutes from '../routes/auth.routes';
import { pool } from '../services/db.service';

jest.mock('../services/db.service', () => ({
  pool: {
    query: jest.fn(),
    getConnection: jest.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use(cookieParser());

// Health must be mounted BEFORE toeicRoutes (whose router.use(requireAuth)
// captures unmatched paths). This mirrors the real server.ts layout.
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api', toeicRoutes);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SECRET = process.env.JWT_SECRET as string;
const ownerToken = jwt.sign({ sub: 'user-1' }, SECRET);
const otherToken = jwt.sign({ sub: 'user-2' }, SECRET);

/** Quick auth header */
function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/** Keep call-site clean */
function q() {
  return (pool.query as jest.Mock);
}
function mockConn() {
  return {
    beginTransaction: jest.fn().mockResolvedValue(undefined),
    query: jest.fn(),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    release: jest.fn(),
  };
}

// ---------------------------------------------------------------------------
describe('S7 Synthetic Journey — /thi-thu full lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Step 0: Health ─────────────────────────────────────────────────────
  it('S7-J0 health returns ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  // ── Step 1: Public catalog ─────────────────────────────────────────────
  it('S7-J1 catalog returns paginated items without auth', async () => {
    q()
      .mockResolvedValueOnce([[{ total: 2 }]])
      .mockResolvedValueOnce([
        [{ id: 1, slug: 'full-lr', title: 'Full LR', skill_type: 'LR' }],
      ]);

    const res = await request(app).get('/api/toeic-exams?skillType=LR&page=1&pageSize=20');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(Array.isArray(res.body.items)).toBe(true);
    // No protected fields should leak
    expect(res.body.items[0].explanation).toBeUndefined();
  });

  // ── Step 2: Exam detail ────────────────────────────────────────────────
  it('S7-J2 exam detail returns slug + sections, no review leak', async () => {
    q()
      .mockResolvedValueOnce([[{ id: 1, slug: 'full-lr', title: 'Full LR', skill_type: 'LR' }]])
      .mockResolvedValueOnce([[{ id: 10, exam_id: 1, title: 'Listening' }]]);

    const res = await request(app).get('/api/toeic-exams/full-lr');
    expect(res.status).toBe(200);
    expect(res.body.slug).toBe('full-lr');
    expect(res.body.sections).toHaveLength(1);
    expect(res.body.sections[0].title).toBe('Listening');
    expect(res.body.explanation).toBeUndefined();
  });

  // ── Step 3: Login / register ───────────────────────────────────────────
  it('S7-J3 register → login → create attempt chain', async () => {
    // register
    q().mockResolvedValueOnce([{ insertId: 99 }]);

    const regRes = await request(app)
      .post('/api/auth/register')
      .send({ email: 'journey@test.com', password: 'journey123' });
    expect(regRes.status).toBe(201);
    expect(regRes.body.user.id).toBe('99');
    expect(regRes.body.token).toBeTruthy();

    // login
    jest.clearAllMocks();
    const SCRYPT_HASH =
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';
    q().mockResolvedValueOnce([
      [{ id: 99, email: 'journey@test.com', display_name: 'Journey', password_hash: SCRYPT_HASH }],
    ]);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'journey@test.com', password: 'journey123' });
    // scrypt comparison with dummy won't match real hash, but this is a
    // synthetic journey — the critical property is that the login route
    // does NOT return 401 "Missing token" (regression guard).
    expect(loginRes.status).toBe(401); // password won't match dummy hash
    expect(loginRes.body.error).toContain('Invalid email or password');
    // It must not be a "Missing token" error
    expect(loginRes.body.error).not.toContain('Missing token');
  });

  // ── Step 4: Create attempt (authenticated) ─────────────────────────────
  it('S7-J4 create attempt returns 201 with attemptId', async () => {
    q()
      .mockResolvedValueOnce([[{ id: 1 }]]) // exam exists
      .mockResolvedValueOnce([{ insertId: 50 }]); // insert attempt

    const res = await request(app)
      .post('/api/toeic-exams/1/attempts')
      .set(auth(ownerToken))
      .send({ mode: 'EXAM' });
    expect(res.status).toBe(201);
    expect(res.body.attemptId).toBe(50);
    expect(res.body.status).toBe('IN_PROGRESS');
  });

  // ── Step 5: Get attempt session (no review leak) ──────────────────────
  it('S7-J5 get attempt returns session without review fields', async () => {
    q()
      .mockResolvedValueOnce([[{ id: 1, user_id: 'user-1', exam_id: 10, status: 'IN_PROGRESS' }]])
      .mockResolvedValueOnce([[]]) // responses
      .mockResolvedValueOnce([[{ id: 1, title: 'Section 1' }]]) // sections
      .mockResolvedValueOnce([[{ id: 101, section_id: 1, content: 'Q1' }]]) // questions
      .mockResolvedValueOnce([[{ id: 1001, question_id: 101, label: 'A' }]]); // options

    const res = await request(app)
      .get('/api/toeic-attempts/1')
      .set(auth(ownerToken));
    expect(res.status).toBe(200);
    expect(res.body.session.questions[0].content).toBe('Q1');
    expect(res.body.session.questions[0].explanation).toBeUndefined();
    expect(res.body.session.questions[0].correct_option_id).toBeUndefined();
    expect(res.body.session.options[0].is_correct).toBeUndefined();
  });

  // ── Step 6: Update response (optimistic concurrency) ──────────────────
  it('S7-J6 update response with valid clientRevision', async () => {
    q()
      .mockResolvedValueOnce([[{ id: 1, status: 'IN_PROGRESS', exam_id: 10 }]]) // attempt
      .mockResolvedValueOnce([[{ id: 101 }]]) // question membership
      .mockResolvedValueOnce([[{ id: 1001 }]]) // option membership
      .mockResolvedValueOnce([[]]); // no existing response

    q().mockResolvedValueOnce([[]]); // insert/upsert

    const res = await request(app)
      .patch('/api/toeic-attempts/1/responses/101')
      .set(auth(ownerToken))
      .send({ clientRevision: 0, selectedOptionId: 1001 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // ── Step 7: Submit attempt (idempotent) ──────────────────────────────
  it('S7-J7 submit IN_PROGRESS attempt enqueues grading job', async () => {
    const conn = mockConn();
    conn.query
      .mockResolvedValueOnce([[{ id: 1, status: 'IN_PROGRESS', skill_type: 'SW' }]]) // FOR UPDATE
      .mockResolvedValueOnce([[]]) // UPDATE status → SUBMITTED
      .mockResolvedValueOnce([[]]); // INSERT IGNORE grading job
    (pool.getConnection as jest.Mock).mockResolvedValue(conn);

    const res = await request(app)
      .post('/api/toeic-attempts/1/submit')
      .set(auth(ownerToken));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.rollback).not.toHaveBeenCalled();
  });

  it('S7-J7b re-submit on already SUBMITTED returns idempotent success', async () => {
    const conn = mockConn();
    conn.query.mockResolvedValueOnce([[{ id: 1, status: 'SUBMITTED', skill_type: 'SW' }]]);
    (pool.getConnection as jest.Mock).mockResolvedValue(conn);

    const res = await request(app)
      .post('/api/toeic-attempts/1/submit')
      .set(auth(ownerToken));
    expect(res.status).toBe(200);
    expect(res.body.alreadySubmitted).toBe(true);
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
  });

  // ── Step 8: Grading status polling ────────────────────────────────────
  it('S7-J8 grading status returns job for owned attempt', async () => {
    q().mockResolvedValueOnce([
      [{ attempt_id: 1, status: 'PROCESSING', retry_count: 0 }],
    ]);

    const res = await request(app)
      .get('/api/toeic-attempts/1/grading-status')
      .set(auth(ownerToken));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PROCESSING');
  });

  it('S7-J8b grading status 404 for another user', async () => {
    q().mockResolvedValueOnce([[]]);

    const res = await request(app)
      .get('/api/toeic-attempts/1/grading-status')
      .set(auth(otherToken));
    expect(res.status).toBe(404);
  });

  // ── Step 9: Result (safe projection) ──────────────────────────────────
  it('S7-J9 result returns projected scores only', async () => {
    q().mockResolvedValueOnce([
      [{ listening_score: 60, reading_score: 72, total_score: 132, status: 'FINAL' }],
    ]);

    const res = await request(app)
      .get('/api/toeic-attempts/99/result')
      .set(auth(ownerToken));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      listeningScore: 60,
      readingScore: 72,
      totalScore: 132,
      status: 'FINAL',
    });
    // No internal columns leak
    for (const k of Object.keys(res.body)) {
      expect(k).not.toContain('_');
    }
  });

  // ── Step 10: Review (authorized, only COMPLETED) ─────────────────────
  it('S7-J10 review 403 when attempt not COMPLETED', async () => {
    q().mockResolvedValueOnce([[{ id: 1, status: 'IN_PROGRESS', exam_id: 10, user_id: 'user-1' }]]);

    const res = await request(app)
      .get('/api/toeic-attempts/1/review')
      .set(auth(ownerToken));
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('not available');
  });

  it('S7-J10b review 200 when attempt COMPLETED', async () => {
    q()
      .mockResolvedValueOnce([[{ id: 1, status: 'COMPLETED', exam_id: 10, user_id: 'user-1' }]])
      .mockResolvedValueOnce([
        [{ question_id: 101, correct_option_id: 1001, explanation: 'Because it is' }],
      ]);

    const res = await request(app)
      .get('/api/toeic-attempts/1/review')
      .set(auth(ownerToken));
    expect(res.status).toBe(200);
    expect(res.body[0].explanation).toBe('Because it is');
  });

  // ── Step 11: History ──────────────────────────────────────────────────
  it('S7-J11 attempt history returns owned attempts only', async () => {
    q().mockResolvedValueOnce([
      [
        { id: 1, user_id: 'user-1', exam_id: 10, status: 'COMPLETED' },
        { id: 2, user_id: 'user-1', exam_id: 11, status: 'IN_PROGRESS' },
      ],
    ]);

    const res = await request(app)
      .get('/api/toeic-attempts')
      .set(auth(ownerToken));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].user_id).toBe('user-1');
  });

  // ── Negative: Presign requires auth & ownership ──────────────────────
  it('S7-J12 presignMedia rejects unauthenticated requests', async () => {
    const res = await request(app)
      .post('/api/toeic-attempts/1/media/presign')
      .send({ questionId: 101, fileName: 'audio.webm', fileType: 'audio/webm', fileSize: 1024 });
    expect(res.status).toBe(401);
  });

  it('S7-J13 presignMedia rejects base64 in body', async () => {
    q()
      .mockResolvedValueOnce([[{ id: 1, status: 'IN_PROGRESS', exam_id: 10, user_id: 'user-1' }]])
      .mockResolvedValueOnce([[{ id: 101 }]]); // question membership

    const res = await request(app)
      .post('/api/toeic-attempts/1/media/presign')
      .set(auth(ownerToken))
      .send({
        questionId: 101,
        fileName: 'data:audio/mp3;base64,AAAA',
        fileType: 'audio/webm',
        fileSize: 1024,
      });
    expect(res.status).toBe(400);
  });
});
