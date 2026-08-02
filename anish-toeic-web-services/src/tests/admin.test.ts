import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import adminRoutes from '../routes/admin.routes';
import { pool } from '../services/db.service';
import { ensureDevAdminMembership } from '../migrations/seed';

// Mock ioredis so the real requireAuth can validate jti checks.
jest.mock('ioredis', () => {
  const store = new Map<string, number>();
  return {
    Redis: jest.fn(() => ({
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
    })),
  };
});

jest.mock('../services/db.service', () => ({
  pool: {
    query: jest.fn(),
    getConnection: jest.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);

const SECRET = process.env.JWT_SECRET as string;
// A7: sub must be a safe positive integer string; numeric subs only.
const noJtiToken = jwt.sign({ sub: '1' }, SECRET);
const userNoJtiToken = jwt.sign({ sub: '2' }, SECRET);

function q() {
  return (pool.query as jest.Mock);
}

describe('Admin Exam Lifecycle AC', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // Auth & RBAC
  // -----------------------------------------------------------------------

  describe('Authentication & Authorization', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app)
        .patch('/api/admin/exams/1/lifecycle')
        .send({ status: 'PUBLISHED' });
      expect(res.status).toBe(401);
    });

    it('rejects non-admin users with 403', async () => {
      q().mockResolvedValueOnce([[]]); // admin_users check → no rows

      const res = await request(app)
        .patch('/api/admin/exams/1/lifecycle')
        .set('Authorization', `Bearer ${userNoJtiToken}`)
        .send({ status: 'PUBLISHED' });
      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Admin access required');
    });

    it('authorizes DB admin users', async () => {
      q().mockResolvedValueOnce([[{ id: 1 }]]); // admin_users row found
      q().mockResolvedValueOnce([[]]); // audit log query

      const res = await request(app)
        .get('/api/admin/audit')
        .set('Authorization', `Bearer ${noJtiToken}`);
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });
  });

  // -----------------------------------------------------------------------
  // PATCH lifecycle validation
  // -----------------------------------------------------------------------

  describe('PATCH /api/admin/exams/:id/lifecycle — body validation', () => {
    it('rejects invalid status with 400', async () => {
      q().mockResolvedValueOnce([[{ id: 1 }]]); // admin_users

      const res = await request(app)
        .patch('/api/admin/exams/1/lifecycle')
        .set('Authorization', `Bearer ${noJtiToken}`)
        .send({ status: 'INVALID_STATUS' });
      expect(res.status).toBe(400);
    });

    it('rejects missing status field with 400', async () => {
      q().mockResolvedValueOnce([[{ id: 1 }]]); // admin_users

      const res = await request(app)
        .patch('/api/admin/exams/1/lifecycle')
        .set('Authorization', `Bearer ${noJtiToken}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('rejects non-integer exam id with 400', async () => {
      q().mockResolvedValueOnce([[{ id: 1 }]]); // admin_users

      const res = await request(app)
        .patch('/api/admin/exams/abc/lifecycle')
        .set('Authorization', `Bearer ${noJtiToken}`)
        .send({ status: 'PUBLISHED' });
      expect(res.status).toBe(400);
    });
  });

  // -----------------------------------------------------------------------
  // Publish atomic: snapshot + version + audit
  // -----------------------------------------------------------------------

  describe('PUBLISH — atomic snapshot, version, audit', () => {
    it('creates snapshot, increments version, sets published pointer, and logs audit on success', async () => {
      const mockGetConnection = pool.getConnection as jest.Mock;

      q().mockResolvedValueOnce([[{ id: 1 }]]); // admin_users

      const mockConn = {
        beginTransaction: jest.fn().mockResolvedValue(undefined),
        query: jest.fn(),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
        release: jest.fn(),
      };
      mockGetConnection.mockResolvedValue(mockConn);

      mockConn.query.mockResolvedValueOnce([[{ id: 1, status: 'DRAFT', version: 1 }]]);
      mockConn.query.mockResolvedValueOnce([[{ id: 1, collection_id: 1, slug: 'test-exam', title: 'Test Exam', duration_minutes: 60, question_count: 10, skill_type: 'LR', status: 'DRAFT', version: 1 }]]);
      mockConn.query.mockResolvedValueOnce([[]]); // sections
      mockConn.query.mockResolvedValueOnce([[]]); // questions
      mockConn.query.mockResolvedValueOnce([{ insertId: 1 }]); // INSERT snapshot
      mockConn.query.mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE exam
      mockConn.query.mockResolvedValueOnce([{ insertId: 1 }]); // INSERT audit

      const res = await request(app)
        .patch('/api/admin/exams/1/lifecycle')
        .set('Authorization', `Bearer ${noJtiToken}`)
        .send({ status: 'PUBLISHED' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.status).toBe('PUBLISHED');
      expect(mockConn.commit).toHaveBeenCalled();
      expect(mockConn.rollback).not.toHaveBeenCalled();
    });

    it('rolls back and returns 500 on transaction failure', async () => {
      const mockGetConnection = pool.getConnection as jest.Mock;

      q().mockResolvedValueOnce([[{ id: 1 }]]); // admin_users

      const mockConn = {
        beginTransaction: jest.fn().mockResolvedValue(undefined),
        query: jest.fn(),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
        release: jest.fn(),
      };
      mockGetConnection.mockResolvedValue(mockConn);

      mockConn.query.mockResolvedValueOnce([[{ id: 1, status: 'DRAFT', version: 1 }]]);
      mockConn.query.mockResolvedValueOnce([[{ id: 1, collection_id: 1, slug: 'test-exam', title: 'Test Exam', duration_minutes: 60, question_count: 10, skill_type: 'LR', status: 'DRAFT', version: 1 }]]);
      mockConn.query.mockResolvedValueOnce([[]]); // sections
      mockConn.query.mockRejectedValueOnce(new Error('DB connection lost')); // questions fails

      const res = await request(app)
        .patch('/api/admin/exams/1/lifecycle')
        .set('Authorization', `Bearer ${noJtiToken}`)
        .send({ status: 'PUBLISHED' });

      expect(res.status).toBe(500);
      expect(mockConn.rollback).toHaveBeenCalled();
      expect(mockConn.commit).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Archive audit
  // -----------------------------------------------------------------------

  describe('ARCHIVE — audit event', () => {
    it('updates status to ARCHIVED and creates audit log entry', async () => {
      const mockGetConnection = pool.getConnection as jest.Mock;

      q().mockResolvedValueOnce([[{ id: 1 }]]); // admin_users

      const mockConn = {
        beginTransaction: jest.fn().mockResolvedValue(undefined),
        query: jest.fn(),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
        release: jest.fn(),
      };
      mockGetConnection.mockResolvedValue(mockConn);

      mockConn.query.mockResolvedValueOnce([[{ id: 1, status: 'PUBLISHED', version: 2 }]]);
      mockConn.query.mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE exam → ARCHIVED
      mockConn.query.mockResolvedValueOnce([{ insertId: 1 }]); // INSERT audit

      const res = await request(app)
        .patch('/api/admin/exams/1/lifecycle')
        .set('Authorization', `Bearer ${noJtiToken}`)
        .send({ status: 'ARCHIVED' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.status).toBe('ARCHIVED');
      expect(mockConn.commit).toHaveBeenCalled();
    });

    it('rejects archiving an already ARCHIVED exam with 409', async () => {
      const mockGetConnection = pool.getConnection as jest.Mock;

      q().mockResolvedValueOnce([[{ id: 1 }]]); // admin_users

      const mockConn = {
        beginTransaction: jest.fn().mockResolvedValue(undefined),
        query: jest.fn(),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
        release: jest.fn(),
      };
      mockGetConnection.mockResolvedValue(mockConn);

      mockConn.query.mockResolvedValueOnce([[{ id: 1, status: 'ARCHIVED', version: 3 }]]);

      const res = await request(app)
        .patch('/api/admin/exams/1/lifecycle')
        .set('Authorization', `Bearer ${noJtiToken}`)
        .send({ status: 'ARCHIVED' });

      expect(res.status).toBe(409);
      expect(mockConn.rollback).toHaveBeenCalled();
      expect(mockConn.commit).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // GET snapshot
  // -----------------------------------------------------------------------

  describe('GET /api/admin/exams/:id/snapshot', () => {
    it('returns the latest snapshot for an exam', async () => {
      q().mockResolvedValueOnce([[{ id: 1 }]]); // admin_users
      q().mockResolvedValueOnce([[
        {
          version: 2,
          snapshot: JSON.stringify({ examId: 1, title: 'Test Exam', status: 'PUBLISHED', version: 2 }),
          created_at: '2026-01-01T00:00:00Z',
        },
      ]]);

      const res = await request(app)
        .get('/api/admin/exams/1/snapshot')
        .set('Authorization', `Bearer ${noJtiToken}`);

      expect(res.status).toBe(200);
      expect(res.body.examId).toBe(1);
      expect(res.body.version).toBe(2);
      expect(res.body.snapshot.title).toBe('Test Exam');
    });

    it('returns 404 when no snapshot exists', async () => {
      q().mockResolvedValueOnce([[{ id: 1 }]]); // admin_users
      q().mockResolvedValueOnce([[]]);

      const res = await request(app)
        .get('/api/admin/exams/999/snapshot')
        .set('Authorization', `Bearer ${noJtiToken}`);

      expect(res.status).toBe(404);
    });
  });

  // -----------------------------------------------------------------------
  // GET audit log
  // -----------------------------------------------------------------------

  describe('GET /api/admin/audit', () => {
    it('returns audit log filtered by examId', async () => {
      q().mockResolvedValueOnce([[{ id: 1 }]]); // admin_users
      q().mockResolvedValueOnce([[
        { id: 1, exam_id: 1, action: 'PUBLISH', actor_user_id: '1', details: '{}', created_at: '2026-01-01T00:00:00Z' },
      ]]);

      const res = await request(app)
        .get('/api/admin/audit?examId=1')
        .set('Authorization', `Bearer ${noJtiToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0].action).toBe('PUBLISH');
    });

    it('returns audit log without filter when examId is omitted', async () => {
      q().mockResolvedValueOnce([[{ id: 1 }]]); // admin_users
      q().mockResolvedValueOnce([[]]);

      const res = await request(app)
        .get('/api/admin/audit')
        .set('Authorization', `Bearer ${noJtiToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Negative: no partial persistence on failure
  // -----------------------------------------------------------------------

  describe('Negative: no partial persistence on failure', () => {
    it('rolls back snapshot insert when exam update fails', async () => {
      const mockGetConnection = pool.getConnection as jest.Mock;

      q().mockResolvedValueOnce([[{ id: 1 }]]); // admin_users

      const mockConn = {
        beginTransaction: jest.fn().mockResolvedValue(undefined),
        query: jest.fn(),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
        release: jest.fn(),
      };
      mockGetConnection.mockResolvedValue(mockConn);

      mockConn.query.mockResolvedValueOnce([[{ id: 1, status: 'DRAFT', version: 1 }]]);
      mockConn.query.mockResolvedValueOnce([[{ id: 1, collection_id: 1, slug: 'test-exam', title: 'Test Exam', duration_minutes: 60, question_count: 10, skill_type: 'LR', status: 'DRAFT', version: 1 }]]);
      mockConn.query.mockResolvedValueOnce([[]]); // sections
      mockConn.query.mockResolvedValueOnce([[]]); // questions
      mockConn.query.mockResolvedValueOnce([{ insertId: 1 }]); // INSERT snapshot succeeds
      mockConn.query.mockRejectedValueOnce(new Error('DB error on update')); // UPDATE exam fails

      const res = await request(app)
        .patch('/api/admin/exams/1/lifecycle')
        .set('Authorization', `Bearer ${noJtiToken}`)
        .send({ status: 'PUBLISHED' });

      expect(res.status).toBe(500);
      expect(mockConn.rollback).toHaveBeenCalled();
      expect(mockConn.commit).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Negative: malformed / non-numeric / unsafe decoded sub
  // -----------------------------------------------------------------------

  describe('Negative: invalid JWT sub', () => {
    function forgedToken(sub: string): string {
      return jwt.sign({ sub }, SECRET);
    }

    it('rejects non-numeric sub with 401', async () => {
      const token = forgedToken('admin-user');
      const res = await request(app)
        .patch('/api/admin/exams/1/lifecycle')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'PUBLISHED' });
      expect(res.status).toBe(401);
    });

    it('rejects sub with leading zeros with 401', async () => {
      const token = forgedToken('01');
      const res = await request(app)
        .patch('/api/admin/exams/1/lifecycle')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'PUBLISHED' });
      expect(res.status).toBe(401);
    });

    it('rejects sub exceeding MAX_SAFE_INTEGER with 401', async () => {
      const token = forgedToken(String(Number.MAX_SAFE_INTEGER + 1));
      const res = await request(app)
        .patch('/api/admin/exams/1/lifecycle')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'PUBLISHED' });
      expect(res.status).toBe(401);
    });

    it('rejects zero sub with 401', async () => {
      const token = forgedToken('0');
      const res = await request(app)
        .patch('/api/admin/exams/1/lifecycle')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'PUBLISHED' });
      expect(res.status).toBe(401);
    });

    it('rejects negative sub with 401', async () => {
      const token = forgedToken('-1');
      const res = await request(app)
        .patch('/api/admin/exams/1/lifecycle')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'PUBLISHED' });
      expect(res.status).toBe(401);
    });
  });

  // -----------------------------------------------------------------------
  // DRAFT→ARCHIVED coverage
  // -----------------------------------------------------------------------

  describe('DRAFT→ARCHIVED', () => {
    it('archives a DRAFT exam and creates audit log entry', async () => {
      const mockGetConnection = pool.getConnection as jest.Mock;

      q().mockResolvedValueOnce([[{ id: 1 }]]); // admin_users

      const mockConn = {
        beginTransaction: jest.fn().mockResolvedValue(undefined),
        query: jest.fn(),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
        release: jest.fn(),
      };
      mockGetConnection.mockResolvedValue(mockConn);

      mockConn.query.mockResolvedValueOnce([[{ id: 1, status: 'DRAFT', version: 1 }]]);
      mockConn.query.mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE exam → ARCHIVED
      mockConn.query.mockResolvedValueOnce([{ insertId: 1 }]); // INSERT audit

      const res = await request(app)
        .patch('/api/admin/exams/1/lifecycle')
        .set('Authorization', `Bearer ${noJtiToken}`)
        .send({ status: 'ARCHIVED' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.status).toBe('ARCHIVED');
      expect(mockConn.commit).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Negative: repeated publish protection
  // -----------------------------------------------------------------------

  describe('Negative: repeated publish protection', () => {
    it('rejects re-publishing an already PUBLISHED exam with 409', async () => {
      const mockGetConnection = pool.getConnection as jest.Mock;

      q().mockResolvedValueOnce([[{ id: 1 }]]); // admin_users

      const mockConn = {
        beginTransaction: jest.fn().mockResolvedValue(undefined),
        query: jest.fn(),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
        release: jest.fn(),
      };
      mockGetConnection.mockResolvedValue(mockConn);

      mockConn.query.mockResolvedValueOnce([[{ id: 1, status: 'PUBLISHED', version: 2 }]]);

      const res = await request(app)
        .patch('/api/admin/exams/1/lifecycle')
        .set('Authorization', `Bearer ${noJtiToken}`)
        .send({ status: 'PUBLISHED' });

      expect(res.status).toBe(409);
      expect(mockConn.rollback).toHaveBeenCalled();
      expect(mockConn.commit).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Negative: audit append-only invariant
  // -----------------------------------------------------------------------

  describe('Negative: audit append-only invariant', () => {
    it('has no mutation route for audit (no POST/PATCH/DELETE)', async () => {
      q().mockResolvedValueOnce([[{ id: 1 }]]); // admin_users
      // POST to audit must 404 — no POST handler registered on the router.
      const res = await request(app)
        .post('/api/admin/audit')
        .set('Authorization', `Bearer ${noJtiToken}`)
        .send({ examId: 1, action: 'PUBLISH', actor_user_id: '1' });
      expect(res.status).toBe(404);
    });

    it('audit log is read-only (GET only)', async () => {
      q().mockResolvedValueOnce([[{ id: 1 }]]); // admin_users
      // PATCH to audit must 404.
      const res = await request(app)
        .patch('/api/admin/audit')
        .set('Authorization', `Bearer ${noJtiToken}`)
        .send({ examId: 1, action: 'PUBLISH' });
      expect(res.status).toBe(404);
    });

    it('DELETE to audit must 404', async () => {
      q().mockResolvedValueOnce([[{ id: 1 }]]); // admin_users
      const res = await request(app)
        .delete('/api/admin/audit?examId=1')
        .set('Authorization', `Bearer ${noJtiToken}`);
      expect(res.status).toBe(404);
    });
  });

  // -----------------------------------------------------------------------
  // A7 M2 repair: seed admin provisioning (dev-only) + fresh seeded admin
  // -----------------------------------------------------------------------

  describe('Seed admin provisioning (A7 M2)', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('provisions the dev seed owner as a DB admin in dev/test context', async () => {
      const mockQuery = pool.query as jest.Mock;
      mockQuery.mockResolvedValueOnce([[{ id: 42 }]]); // owner user lookup

      await ensureDevAdminMembership();

      const insertCall = mockQuery.mock.calls.find((c) => c[0].includes('INSERT IGNORE INTO admin_users'));
      expect(insertCall).toBeDefined();
      expect(insertCall[1]).toEqual([42, 'ADMIN']);
    });

    it('never grants admin membership in a production context', async () => {
      const prev = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const mockQuery = pool.query as jest.Mock;
        await ensureDevAdminMembership();
        const insertCall = mockQuery.mock.calls.find((c) => c[0].includes('INSERT IGNORE INTO admin_users'));
        expect(insertCall).toBeUndefined();
      } finally {
        process.env.NODE_ENV = prev;
      }
    });

    it('a freshly seeded admin passes admin RBAC', async () => {
      // admin_users row exists for the seed owner (provisioned by the seed).
      q().mockResolvedValueOnce([[{ id: 1 }]]); // requireAdmin check
      q().mockResolvedValueOnce([[{ total: 1 }]]); // count
      q().mockResolvedValueOnce([[
        { id: 1, collection_id: 1, slug: 'full-lr', title: 'Full LR', duration_minutes: 120, question_count: 200, skill_type: 'LR', status: 'PUBLISHED', version: 2, published_version: 2 },
      ]]); // rows

      const res = await request(app)
        .get('/api/admin/exams')
        .set('Authorization', `Bearer ${noJtiToken}`);

      expect(res.status).toBe(200);
      expect(res.body.items[0].status).toBe('PUBLISHED');
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/admin/exams — protected admin list (A7 M1)
  // -----------------------------------------------------------------------

  describe('GET /api/admin/exams — protected admin list', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/admin/exams');
      expect(res.status).toBe(401);
    });

    it('rejects non-admin users with 403', async () => {
      q().mockResolvedValueOnce([[]]); // admin_users check → no rows

      const res = await request(app)
        .get('/api/admin/exams')
        .set('Authorization', `Bearer ${userNoJtiToken}`);
      expect(res.status).toBe(403);
    });

    it('returns admin projection with lifecycle fields for DB admins', async () => {
      q().mockResolvedValueOnce([[{ id: 1 }]]); // admin_users check
      q().mockResolvedValueOnce([[{ total: 2 }]]); // count
      q().mockResolvedValueOnce([[
        { id: 1, collection_id: 1, slug: 'full-lr', title: 'Full LR', duration_minutes: 120, question_count: 200, skill_type: 'LR', status: 'PUBLISHED', version: 2, published_version: 2 },
        { id: 2, collection_id: 1, slug: 'draft-sw', title: 'Draft SW', duration_minutes: 40, question_count: 12, skill_type: 'SW', status: 'DRAFT', version: 1, published_version: null },
      ]]);

      const res = await request(app)
        .get('/api/admin/exams')
        .set('Authorization', `Bearer ${noJtiToken}`);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(2);
      expect(res.body.items[0].status).toBe('PUBLISHED');
      expect(res.body.items[0].version).toBe(2);
      expect(res.body.items[0].published_version).toBe(2);
      expect(res.body.items[1].status).toBe('DRAFT');
      expect(res.body.items[1].version).toBe(1);
    });

    it('does not leak snapshot or audit data through the list', async () => {
      q().mockResolvedValueOnce([[{ id: 1 }]]); // admin_users check
      q().mockResolvedValueOnce([[{ total: 1 }]]);
      // Row mock intentionally includes snapshot/audit-shaped columns — they must
      // never reach the client because the SELECT is bound to toeic_exams only.
      q().mockResolvedValueOnce([[
        { id: 1, collection_id: 1, slug: 'full-lr', title: 'Full LR', duration_minutes: 120, question_count: 200, skill_type: 'LR', status: 'PUBLISHED', version: 2, published_version: 2, snapshot: '{"leaked":true}', details: '{"leaked":true}', action: 'PUBLISH' },
      ]]);

      const res = await request(app)
        .get('/api/admin/exams')
        .set('Authorization', `Bearer ${noJtiToken}`);

      expect(res.status).toBe(200);
      const item = res.body.items[0];
      expect(item.status).toBe('PUBLISHED');
      expect(item.snapshot).toBeUndefined();
      expect(item.details).toBeUndefined();
      expect(item.action).toBeUndefined();
    });
  });
});