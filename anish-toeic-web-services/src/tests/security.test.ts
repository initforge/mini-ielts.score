import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import { scryptSync } from 'crypto';
import toeicRoutes from '../routes/toeic.routes';
import authRoutes from '../routes/auth.routes';
import { pool } from '../services/db.service';

// R3-SECURITY: stub ioredis — register/login persist the jti key in-memory.
jest.mock('ioredis', () => {
  const store = new Map();
  const instance = {
    setex: jest.fn((key, ttl) => {
      store.set(key, Date.now() + ttl * 1000);
      return Promise.resolve('OK');
    }),
    exists: jest.fn((key) => Promise.resolve(store.has(key) ? 1 : 0)),
    del: jest.fn((key) => {
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
  pool: {
    query: jest.fn(),
    getConnection: jest.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/auth', authRoutes);
app.use('/api', toeicRoutes);

const SECRET = process.env.JWT_SECRET as string;
const ownerToken = jwt.sign({ sub: '1' }, SECRET);
const otherToken = jwt.sign({ sub: '2' }, SECRET);

// A real scrypt hash produced exactly like src/routes/auth.routes.ts does.
const SALT = 'a'.repeat(32);
const passwordHashFor = (pw: string) => `${SALT}:${scryptSync(pw, SALT, 64).toString('hex')}`;

describe('AC7 Security: auth, ownership, membership, revision, idempotency', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Authentication (401)', () => {
    it('rejects protected routes without a token', async () => {
      const res = await request(app).post('/api/toeic-exams/1/attempts').send({ mode: 'EXAM' });
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Unauthorized');
    });

    it('rejects a malformed Authorization header', async () => {
      const res = await request(app)
        .get('/api/toeic-attempts')
        .set('Authorization', 'NotBearer anything');
      expect(res.status).toBe(401);
    });

    it('rejects a token signed with a different secret', async () => {
      const forged = jwt.sign({ sub: '1' }, 'another-secret-that-is-long-enough-32char');
      const res = await request(app).get('/api/toeic-attempts').set('Authorization', `Bearer ${forged}`);
      expect(res.status).toBe(401);
    });

    it('rejects a token without a sub claim', async () => {
      const noSub = jwt.sign({ userId: '1' }, SECRET);
      const res = await request(app).get('/api/toeic-attempts').set('Authorization', `Bearer ${noSub}`);
      expect(res.status).toBe(401);
    });

    it('accepts a valid httpOnly cookie instead of a Bearer header', async () => {
      const mockQuery = pool.query as jest.Mock;
      mockQuery.mockResolvedValueOnce([[]]); // history rows
      const res = await request(app)
        .get('/api/toeic-attempts')
        .set('Cookie', `token=${ownerToken}`);
      expect(res.status).toBe(200);
    });
  });

  describe('Register / login (no mock fallback)', () => {
    it('registers a user, hashes the password and sets an httpOnly cookie', async () => {
      const mockQuery = pool.query as jest.Mock;
      mockQuery.mockResolvedValueOnce([{ insertId: 42 }]);

      const res = await request(app).post('/api/auth/register').send({
        email: 'new@example.com',
        password: 'supersecret1',
        displayName: 'New User',
      });

      expect(res.status).toBe(201);
      expect(res.body.user.id).toBe('42');
      // INJ-003: token must NOT leak in the JSON body — session is httpOnly cookie.
      expect(res.body.token).toBeUndefined();
      expect(res.headers['set-cookie']?.[0]).toContain('HttpOnly');

      const insertCall = mockQuery.mock.calls.find((c) => c[0].includes('INSERT INTO users'));
      expect(insertCall).toBeDefined();
      const storedHash = insertCall[1][1];
      expect(storedHash).not.toContain('supersecret1');
      expect(storedHash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/);
    });

    it('returns 409 when the email is already registered', async () => {
      const mockQuery = pool.query as jest.Mock;
      mockQuery.mockRejectedValueOnce({ code: 'ER_DUP_ENTRY' });

      const res = await request(app).post('/api/auth/register').send({
        email: 'dup@example.com',
        password: 'supersecret1',
      });

      expect(res.status).toBe(409);
    });

    it('returns 400 for an invalid email', async () => {
      const res = await request(app).post('/api/auth/register').send({
        email: 'not-an-email',
        password: 'supersecret1',
      });
      expect(res.status).toBe(400);
    });

    it('logs in with the correct password', async () => {
      const mockQuery = pool.query as jest.Mock;
      mockQuery.mockResolvedValueOnce([
        [{ id: 5, email: 'user@example.com', display_name: 'User', password_hash: passwordHashFor('correct-password') }],
      ]);

      const res = await request(app).post('/api/auth/login').send({
        email: 'user@example.com',
        password: 'correct-password',
      });

      expect(res.status).toBe(200);
      expect(res.body.user.id).toBe('5');
      // INJ-003: token must NOT leak in the JSON body — session is httpOnly cookie.
      expect(res.body.token).toBeUndefined();
      expect(res.headers['set-cookie']?.[0]).toContain('HttpOnly');
    });

    it('returns 401 for an unknown user', async () => {
      const mockQuery = pool.query as jest.Mock;
      mockQuery.mockResolvedValueOnce([[]]);

      const res = await request(app).post('/api/auth/login').send({
        email: 'ghost@example.com',
        password: 'whatever123',
      });

      expect(res.status).toBe(401);
    });

    it('returns 401 for a wrong password', async () => {
      const mockQuery = pool.query as jest.Mock;
      mockQuery.mockResolvedValueOnce([
        [{ id: 5, email: 'user@example.com', display_name: 'User', password_hash: passwordHashFor('correct-password') }],
      ]);

      const res = await request(app).post('/api/auth/login').send({
        email: 'user@example.com',
        password: 'wrong-password',
      });

      expect(res.status).toBe(401);
    });
  });

  describe('Ownership (403/404)', () => {
    it('rejects updateResponse on another user attempt with 403', async () => {
      const mockQuery = pool.query as jest.Mock;
      mockQuery.mockResolvedValueOnce([[]]); // attempt ownership check

      const res = await request(app)
        .patch('/api/toeic-attempts/1/responses/101')
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ selectedOptionId: 1001 });

      expect(res.status).toBe(403);
    });

    it('rejects submit on another user attempt with 403', async () => {
      const mockConn = {
        beginTransaction: jest.fn().mockResolvedValue(undefined),
        query: jest.fn().mockResolvedValueOnce([[]]),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
        release: jest.fn(),
      };
      (pool.getConnection as jest.Mock).mockResolvedValue(mockConn);

      const res = await request(app)
        .post('/api/toeic-attempts/1/submit')
        .set('Authorization', `Bearer ${otherToken}`);
      expect(res.status).toBe(403);
      expect(mockConn.rollback).toHaveBeenCalled();
    });

    it('rejects presignMedia on another user attempt with 403', async () => {
      const mockQuery = pool.query as jest.Mock;
      mockQuery.mockResolvedValueOnce([[]]);

      const res = await request(app)
        .post('/api/toeic-attempts/1/media/presign')
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ questionId: 101, fileName: 'audio.webm', fileType: 'audio/webm', fileSize: 1024000 });
      expect(res.status).toBe(403);
    });

    it('returns 404 for reading another user attempt (no existence oracle leak)', async () => {
      const mockQuery = pool.query as jest.Mock;
      mockQuery.mockResolvedValueOnce([[]]);

      const res = await request(app)
        .get('/api/toeic-attempts/9')
        .set('Authorization', `Bearer ${otherToken}`);
      expect(res.status).toBe(404);
    });

    it('returns 404 for another user result and review', async () => {
      const mockQuery = pool.query as jest.Mock;
      mockQuery.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]]);

      const resultRes = await request(app)
        .get('/api/toeic-attempts/9/result')
        .set('Authorization', `Bearer ${otherToken}`);
      expect(resultRes.status).toBe(404);

      const reviewRes = await request(app)
        .get('/api/toeic-attempts/9/review')
        .set('Authorization', `Bearer ${otherToken}`);
      expect(reviewRes.status).toBe(404);
    });
  });

  describe('Membership validation (409)', () => {
    it('rejects a question that does not belong to the attempt exam', async () => {
      const mockQuery = pool.query as jest.Mock;
      mockQuery.mockResolvedValueOnce([[{ id: 1, status: 'IN_PROGRESS', exam_id: 10 }]]);
      mockQuery.mockResolvedValueOnce([[]]); // question membership

      const res = await request(app)
        .patch('/api/toeic-attempts/1/responses/999')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ selectedOptionId: 1001 });
      expect(res.status).toBe(409);
    });

    it('rejects a selected option that belongs to a different question', async () => {
      const mockQuery = pool.query as jest.Mock;
      mockQuery.mockResolvedValueOnce([[{ id: 1, status: 'IN_PROGRESS', exam_id: 10 }]]);
      mockQuery.mockResolvedValueOnce([[{ id: 101 }]]); // question ok
      mockQuery.mockResolvedValueOnce([[]]); // option membership fails

      const res = await request(app)
        .patch('/api/toeic-attempts/1/responses/101')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ selectedOptionId: 777 });
      expect(res.status).toBe(409);
    });

    it('rejects presignMedia for a question outside the attempt exam', async () => {
      const mockQuery = pool.query as jest.Mock;
      mockQuery.mockResolvedValueOnce([[{ id: 1, status: 'IN_PROGRESS', exam_id: 10 }]]);
      mockQuery.mockResolvedValueOnce([[]]);

      const res = await request(app)
        .post('/api/toeic-attempts/1/media/presign')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ questionId: 888, fileName: 'audio.webm', fileType: 'audio/webm', fileSize: 1024000 });
      expect(res.status).toBe(409);
    });
  });

  describe('Attempt state and revision conflicts (409)', () => {
    it('rejects response updates after the attempt is no longer IN_PROGRESS', async () => {
      const mockQuery = pool.query as jest.Mock;
      mockQuery.mockResolvedValueOnce([[{ id: 1, status: 'SUBMITTED', exam_id: 10 }]]);

      const res = await request(app)
        .patch('/api/toeic-attempts/1/responses/101')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ selectedOptionId: 1001 });
      expect(res.status).toBe(409);
    });

    it('rejects a stale client_revision', async () => {
      const mockQuery = pool.query as jest.Mock;
      mockQuery.mockResolvedValueOnce([[{ id: 1, status: 'IN_PROGRESS', exam_id: 10 }]]);
      mockQuery.mockResolvedValueOnce([[{ id: 101 }]]);
      mockQuery.mockResolvedValueOnce([[{ id: 1001 }]]); // option membership
      mockQuery.mockResolvedValueOnce([[{ client_revision: 5 }]]);

      const res = await request(app)
        .patch('/api/toeic-attempts/1/responses/101')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ clientRevision: 3, selectedOptionId: 1001 });
      expect(res.status).toBe(409);
      expect(res.body.error).toContain('Stale client_revision');
    });

    it('replays an identical write at the same revision as idempotent success', async () => {
      const mockQuery = pool.query as jest.Mock;
      mockQuery.mockResolvedValueOnce([[{ id: 1, status: 'IN_PROGRESS', exam_id: 10 }]]);
      mockQuery.mockResolvedValueOnce([[{ id: 101 }]]);
      mockQuery.mockResolvedValueOnce([[{ id: 1001 }]]); // option belongs
      mockQuery.mockResolvedValueOnce([
        [{ client_revision: 2, selected_option_id: 1001, text_response: null, marked_for_review: 0, note: null }],
      ]);

      const res = await request(app)
        .patch('/api/toeic-attempts/1/responses/101')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ clientRevision: 2, selectedOptionId: 1001 });

      expect(res.status).toBe(200);
      expect(res.body.replayed).toBe(true);
      // No write query executed
      const insertCalls = mockQuery.mock.calls.filter((c) => c[0].includes('INSERT INTO toeic_attempt_responses'));
      expect(insertCalls).toHaveLength(0);
    });

    it('rejects divergent writes at the same revision', async () => {
      const mockQuery = pool.query as jest.Mock;
      mockQuery.mockResolvedValueOnce([[{ id: 1, status: 'IN_PROGRESS', exam_id: 10 }]]);
      mockQuery.mockResolvedValueOnce([[{ id: 101 }]]);
      mockQuery.mockResolvedValueOnce([[{ id: 1001 }]]);
      mockQuery.mockResolvedValueOnce([
        [{ client_revision: 2, selected_option_id: 1001, text_response: null, marked_for_review: 0, note: null }],
      ]);

      const res = await request(app)
        .patch('/api/toeic-attempts/1/responses/101')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ clientRevision: 2, selectedOptionId: 777 });
      expect(res.status).toBe(409);
    });
  });

  describe('Submit idempotency and transaction', () => {
    function mockConnection() {
      return {
        beginTransaction: jest.fn().mockResolvedValue(undefined),
        query: jest.fn(),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
        release: jest.fn(),
      };
    }

    it('returns alreadySubmitted for a terminal attempt without double work', async () => {
      const conn = mockConnection();
      conn.query.mockResolvedValueOnce([[{ id: 1, status: 'SUBMITTED', skill_type: 'SW' }]]);
      (pool.getConnection as jest.Mock).mockResolvedValue(conn);

      const res = await request(app)
        .post('/api/toeic-attempts/1/submit')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.alreadySubmitted).toBe(true);
      expect(conn.commit).not.toHaveBeenCalled();
      expect(conn.rollback).toHaveBeenCalled();
    });

    it('submits, enqueues one grading job and commits in one transaction', async () => {
      const conn = mockConnection();
      conn.query
        .mockResolvedValueOnce([[{ id: 1, status: 'IN_PROGRESS', skill_type: 'SW' }]]) // FOR UPDATE
        .mockResolvedValueOnce([[]]) // UPDATE attempts -> SUBMITTED
        .mockResolvedValueOnce([[]]); // INSERT grading job (ON DUPLICATE KEY UPDATE)
      (pool.getConnection as jest.Mock).mockResolvedValue(conn);

      const res = await request(app)
        .post('/api/toeic-attempts/1/submit')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(conn.commit).toHaveBeenCalled();
      expect(conn.rollback).not.toHaveBeenCalled();

      const jobInsert = conn.query.mock.calls.find((c) => c[0].includes('INSERT INTO toeic_grading_jobs'));
      expect(jobInsert).toBeDefined();
      expect(jobInsert[1]).toEqual([1]);

      const stateUpdate = conn.query.mock.calls.find((c) => c[0].includes('UPDATE toeic_attempts'));
      expect(stateUpdate[1]).toEqual(['SUBMITTED', undefined, 1]);
    });

    it('rolls back and surfaces errors instead of a partial state', async () => {
      const conn = mockConnection();
      conn.query.mockResolvedValueOnce([[{ id: 1, status: 'IN_PROGRESS', skill_type: 'SW' }]]);
      conn.query.mockRejectedValueOnce(new Error('DB died'));
      (pool.getConnection as jest.Mock).mockResolvedValue(conn);

      const res = await request(app)
        .post('/api/toeic-attempts/1/submit')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(500);
      expect(conn.rollback).toHaveBeenCalled();
      expect(conn.commit).not.toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalled();
    });
  });
});
