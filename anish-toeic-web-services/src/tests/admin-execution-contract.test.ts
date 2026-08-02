import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import adminRoutes from '../routes/admin.routes';
import { pool } from '../services/db.service';

// Mock ioredis.
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
const adminToken = jwt.sign({ sub: '1' }, SECRET);
const userToken = jwt.sign({ sub: '4' }, SECRET);

function q() {
  return pool.query as jest.Mock;
}

describe('Admin Execution Snapshot Contract AC', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // AC1: Attempts pin immutable published snapshot
  // -----------------------------------------------------------------------

  describe('AC1: Attempts pin immutable published snapshot', () => {
    it('stale version returns 409 on lifecycle', async () => {
      q().mockResolvedValueOnce([[{ id: 1 }]]); // admin check

      const mockGetConnection = pool.getConnection as jest.Mock;
      const mockConn = {
        beginTransaction: jest.fn().mockResolvedValue(undefined),
        query: jest.fn(),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
        release: jest.fn(),
      };
      mockGetConnection.mockResolvedValue(mockConn);

      // Current version is 10, but user expects 5.
      mockConn.query.mockResolvedValueOnce([[{ id: 1, status: 'DRAFT', version: 10, published_version: 9 }]]);

      await request(app)
        .patch('/api/admin/exams/1/lifecycle')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'PUBLISHED', expectedVersion: 5 });

      // Stale version check triggers rollback.
      expect(mockConn.rollback).toHaveBeenCalled();
    });

    it('publish succeeds when expectedVersion matches', async () => {
      q().mockResolvedValueOnce([[{ id: 1 }]]);

      const mockGetConnection = pool.getConnection as jest.Mock;
      const mockConn = {
        beginTransaction: jest.fn().mockResolvedValue(undefined),
        query: jest.fn(),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
        release: jest.fn(),
      };
      mockGetConnection.mockResolvedValue(mockConn);

      // Version matches expectedVersion.
      mockConn.query.mockResolvedValueOnce([[{ id: 1, status: 'DRAFT', version: 5, published_version: null }]]);
      // Snapshot build.
      mockConn.query.mockResolvedValueOnce([[{ id: 1, collection_id: 1, slug: 'exam', title: 'Exam', duration_minutes: 60, question_count: 5, skill_type: 'LR', status: 'DRAFT', version: 5 }]]);
      mockConn.query.mockResolvedValueOnce([[]]); // sections
      mockConn.query.mockResolvedValueOnce([[]]); // questions
      mockConn.query.mockResolvedValueOnce([{ insertId: 1 }]); // snapshot
      mockConn.query.mockResolvedValueOnce([{ affectedRows: 1 }]); // exam update
      mockConn.query.mockResolvedValueOnce([{ insertId: 1 }]); // audit

      const res = await request(app)
        .patch('/api/admin/exams/1/lifecycle')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'PUBLISHED', expectedVersion: 5 });

      expect(res.status).toBe(200);
      expect(mockConn.commit).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // AC2: Existing attempts resolve pinned content
  // -----------------------------------------------------------------------

  describe('AC2: Existing attempts resolve pinned content', () => {
    it('GET snapshot returns latest version', async () => {
      q().mockResolvedValueOnce([[{ id: 1 }]]);
      q().mockResolvedValueOnce([[
        {
          version: 2,
          snapshot: JSON.stringify({ examId: 1, version: 2, title: 'Test' }),
          created_at: '2026-01-01T00:00:00Z',
        },
      ]]);

      const res = await request(app)
        .get('/api/admin/exams/1/snapshot')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.version).toBe(2);
      expect(res.body.snapshot.version).toBe(2);
    });

    it('GET snapshot returns 404 when not found', async () => {
      q().mockResolvedValueOnce([[{ id: 1 }]]);
      q().mockResolvedValueOnce([[]]); // no snapshot

      const res = await request(app)
        .get('/api/admin/exams/999/snapshot')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });
  });

  // -----------------------------------------------------------------------
  // AC3: Lifecycle supports expectedVersion/RESTORE and 409 stale
  // -----------------------------------------------------------------------

  describe('AC3: expectedVersion optimistic locking', () => {
    it('RESTORE transitions ARCHIVED to DRAFT', async () => {
      q().mockResolvedValueOnce([[{ id: 1 }]]);

      const mockGetConnection = pool.getConnection as jest.Mock;
      const mockConn = {
        beginTransaction: jest.fn().mockResolvedValue(undefined),
        query: jest.fn(),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
        release: jest.fn(),
      };
      mockGetConnection.mockResolvedValue(mockConn);

      mockConn.query.mockResolvedValueOnce([[{ id: 1, status: 'ARCHIVED', version: 3, published_version: 2 }]]);
      mockConn.query.mockResolvedValueOnce([{ affectedRows: 1 }]); // status update
      mockConn.query.mockResolvedValueOnce([{ insertId: 1 }]); // audit

      const res = await request(app)
        .patch('/api/admin/exams/1/lifecycle')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'RESTORE' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('RESTORE');
    });

    it('RESTORE rejects non-ARCHIVED exams', async () => {
      q().mockResolvedValueOnce([[{ id: 1 }]]);

      const mockGetConnection = pool.getConnection as jest.Mock;
      const mockConn = {
        beginTransaction: jest.fn().mockResolvedValue(undefined),
        query: jest.fn(),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
        release: jest.fn(),
      };
      mockGetConnection.mockResolvedValue(mockConn);

      mockConn.query.mockResolvedValueOnce([[{ id: 1, status: 'PUBLISHED', version: 3, published_version: 3 }]]);

      const res = await request(app)
        .patch('/api/admin/exams/1/lifecycle')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'RESTORE' });

      expect(res.status).toBe(409);
      expect(mockConn.rollback).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Negative: stale version
  // -----------------------------------------------------------------------

  describe('Negative: stale version rejection', () => {
    it('rejects lifecycle on stale expectedVersion', async () => {
      q().mockResolvedValueOnce([[{ id: 1 }]]);

      const mockGetConnection = pool.getConnection as jest.Mock;
      const mockConn = {
        beginTransaction: jest.fn().mockResolvedValue(undefined),
        query: jest.fn(),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
        release: jest.fn(),
      };
      mockGetConnection.mockResolvedValue(mockConn);

      // Current version is 10, expectedVersion is 5.
      mockConn.query.mockResolvedValueOnce([[{ id: 1, status: 'DRAFT', version: 10, published_version: 9 }]]);

      const res = await request(app)
        .patch('/api/admin/exams/1/lifecycle')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'PUBLISHED', expectedVersion: 5 });

      expect(res.status).toBe(409);
      expect(mockConn.rollback).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Negative: archived create
  // -----------------------------------------------------------------------

  describe('Negative: cannot create on archived', () => {
    it('prevents publish on archived exams', async () => {
      q().mockResolvedValueOnce([[{ id: 1 }]]);

      const mockGetConnection = pool.getConnection as jest.Mock;
      const mockConn = {
        beginTransaction: jest.fn().mockResolvedValue(undefined),
        query: jest.fn(),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
        release: jest.fn(),
      };
      mockGetConnection.mockResolvedValue(mockConn);

      mockConn.query.mockResolvedValueOnce([[{ id: 1, status: 'ARCHIVED', version: 3, published_version: 2 }]]);

      const res = await request(app)
        .patch('/api/admin/exams/1/lifecycle')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'PUBLISHED' });

      expect(res.status).toBe(409);
    });
  });

  // -----------------------------------------------------------------------
  // Negative: snapshot v1 survives v2
  // -----------------------------------------------------------------------

  describe('Negative: snapshot immutability', () => {
    it('snapshot v1 is preserved after v2 publish', async () => {
      q().mockResolvedValueOnce([[{ id: 1 }]]);
      // Return v1 snapshot.
      q().mockResolvedValueOnce([[
        { version: 1, snapshot: JSON.stringify({ examId: 1, version: 1, title: 'Exam v1' }), created_at: '2026-01-01T00:00:00Z' },
      ]]);

      const res = await request(app)
        .get('/api/admin/exams/1/snapshot')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.version).toBe(1);
      expect(res.body.snapshot.version).toBe(1);
    });

    it('publishing v2 does not delete v1', async () => {
      q().mockResolvedValueOnce([[{ id: 1 }]]);

      const mockGetConnection = pool.getConnection as jest.Mock;
      const mockConn = {
        beginTransaction: jest.fn().mockResolvedValue(undefined),
        query: jest.fn(),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
        release: jest.fn(),
      };
      mockGetConnection.mockResolvedValue(mockConn);

      mockConn.query.mockResolvedValueOnce([[{ id: 1, status: 'DRAFT', version: 1, published_version: null }]]);
      mockConn.query.mockResolvedValueOnce([[{ id: 1, collection_id: 1, slug: 'exam', title: 'Exam', duration_minutes: 60, question_count: 5, skill_type: 'LR', status: 'DRAFT', version: 1 }]]);
      mockConn.query.mockResolvedValueOnce([[]]); // sections
      mockConn.query.mockResolvedValueOnce([[]]); // questions
      mockConn.query.mockResolvedValueOnce([{ insertId: 1 }]); // snapshot insert (v2)
      mockConn.query.mockResolvedValueOnce([{ affectedRows: 1 }]); // exam update
      mockConn.query.mockResolvedValueOnce([{ insertId: 1 }]); // audit

      const res = await request(app)
        .patch('/api/admin/exams/1/lifecycle')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'PUBLISHED' });

      expect(res.status).toBe(200);
      // v1 still queryable (snapshot insert only, no DELETE).
      expect(mockConn.query.mock.calls.filter(c => c[0].includes('DELETE'))).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Negative: mixed duplicate/draft
  // -----------------------------------------------------------------------

  describe('Negative: re-publish protection', () => {
    it('rejects re-publishing an already PUBLISHED exam', async () => {
      q().mockResolvedValueOnce([[{ id: 1 }]]);

      const mockGetConnection = pool.getConnection as jest.Mock;
      const mockConn = {
        beginTransaction: jest.fn().mockResolvedValue(undefined),
        query: jest.fn(),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
        release: jest.fn(),
      };
      mockGetConnection.mockResolvedValue(mockConn);

      mockConn.query.mockResolvedValueOnce([[{ id: 1, status: 'PUBLISHED', version: 2, published_version: 2 }]]);

      const res = await request(app)
        .patch('/api/admin/exams/1/lifecycle')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'PUBLISHED' });

      expect(res.status).toBe(409);
      expect(mockConn.rollback).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Unauthorized roles
  // -----------------------------------------------------------------------

  describe('Negative: unauthorized roles', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app)
        .patch('/api/admin/exams/1/lifecycle')
        .send({ status: 'PUBLISHED' });
      expect(res.status).toBe(401);
    });

    it('rejects non-admin users with 403', async () => {
      q().mockResolvedValueOnce([[]]); // no admin_users row

      const res = await request(app)
        .patch('/api/admin/exams/1/lifecycle')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ status: 'PUBLISHED' });
      expect(res.status).toBe(403);
    });
  });
});
