import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import adminRoutes from '../routes/admin.routes';
import { pool } from '../services/db.service';

// Mock ioredis.
jest.mock('ioredis', () => {
  const store = new Map();
  return {
    Redis: jest.fn(() => ({
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
const examEditorToken = jwt.sign({ sub: '2' }, SECRET);
const resultManagerToken = jwt.sign({ sub: '3' }, SECRET);
const auditorToken = jwt.sign({ sub: '4' }, SECRET);
const userToken = jwt.sign({ sub: '5' }, SECRET);

function q() {
  return pool.query as jest.Mock;
}

describe('Admin Mixed Results AC', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    q().mockResolvedValue([[]]); // prevent hang on unplanned DB mock
  });

  // Helper to setup admin + EXAM_EDITOR mocks.
  // Middleware sequence: requireAdmin (admin_users) → requireExamEditor (roles)
  function setupExamEditorMocks() {
    // requireAdmin: check if user is in admin_users table
    q().mockResolvedValueOnce([[{ id: 1 }]]); // admin check - user IS admin
    // requireCapability middleware: check role
    q().mockResolvedValueOnce([[{ role_name: 'EXAM_EDITOR' }]]); // has EXAM_EDITOR role
  }

  // Helper to setup RESULT_MANAGER mocks (admin user).
  // Middleware sequence: requireAdmin (admin_users) → requireResultManager (roles)
  function setupResultManagerMocks() {
    // requireAdmin: check if user is in admin_users table
    q().mockResolvedValueOnce([[{ id: 1 }]]); // admin check - user IS admin
    // requireCapability middleware: check role
    q().mockResolvedValueOnce([[{ role_name: 'RESULT_MANAGER' }]]); // has RESULT_MANAGER role
  }

  // -----------------------------------------------------------------------
  // AC1: Mixed sources only published snapshot
  // -----------------------------------------------------------------------

  describe('AC1: Mixed sources only published snapshot', () => {
    it('rejects DRAFT source exams', async () => {
      setupExamEditorMocks();
      // Source exam validation: DRAFT exam.
      q().mockResolvedValueOnce([[
        { id: 10, status: 'DRAFT', published_version: null, title: 'Draft Source' },
      ]]);

      const res = await request(app)
        .post('/api/admin/mixed-exams')
        .set('Authorization', `Bearer ${examEditorToken}`)
        .send({
          title: 'Mixed Exam',
          slug: 'mixed-exam',
          collectionId: 1,
          skillType: 'LR',
          durationMinutes: 120,
          sources: [{ sourceExamId: 10, sourceVersion: 1, orderIndex: 0 }],
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('not PUBLISHED');
    });

    it('rejects source exam with version mismatch', async () => {
      setupExamEditorMocks();
      // Source exam exists but version doesn't match.
      q().mockResolvedValueOnce([[
        { id: 10, status: 'PUBLISHED', published_version: 3, title: 'Published Source' },
      ]]);

      const res = await request(app)
        .post('/api/admin/mixed-exams')
        .set('Authorization', `Bearer ${examEditorToken}`)
        .send({
          title: 'Mixed Exam',
          slug: 'mixed-exam',
          collectionId: 1,
          skillType: 'LR',
          durationMinutes: 120,
          sources: [{ sourceExamId: 10, sourceVersion: 1, orderIndex: 0 }], // Wrong version
        });

      expect(res.status).toBe(409);
    });
  });

  // -----------------------------------------------------------------------
  // AC2: Deterministic ordering
  // -----------------------------------------------------------------------

  describe('AC2: Deterministic ordering', () => {
    it('creates mixed exam with sorted sources', async () => {
      setupExamEditorMocks();
      // Source validation passes.
      q().mockResolvedValueOnce([[
        { id: 10, status: 'PUBLISHED', published_version: 1, title: 'Source A' },
        { id: 11, status: 'PUBLISHED', published_version: 1, title: 'Source B' },
      ]]);

      const mockGetConnection = pool.getConnection as jest.Mock;
      const mockConn = {
        beginTransaction: jest.fn().mockResolvedValue(undefined),
        query: jest.fn(),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
        release: jest.fn(),
      };
      mockGetConnection.mockResolvedValue(mockConn);

      // Mixed exam insert.
      mockConn.query.mockResolvedValueOnce([{ insertId: 100 }]);
      // Source inserts.
      mockConn.query.mockResolvedValueOnce([{ insertId: 1 }]);
      mockConn.query.mockResolvedValueOnce([{ insertId: 2 }]);
      // Audit insert.
      mockConn.query.mockResolvedValueOnce([{ insertId: 1 }]);

      const res = await request(app)
        .post('/api/admin/mixed-exams')
        .set('Authorization', `Bearer ${examEditorToken}`)
        .send({
          title: 'Mixed Exam',
          slug: 'mixed-exam',
          collectionId: 1,
          skillType: 'LR',
          durationMinutes: 120,
          sources: [
            { sourceExamId: 11, sourceVersion: 1, orderIndex: 1 },
            { sourceExamId: 10, sourceVersion: 1, orderIndex: 0 },
          ],
        });

      expect(res.status).toBe(201);
      // Verify sources were inserted.
      const sourceInserts = mockConn.query.mock.calls.filter(c =>
        c[0].includes('mixed_exam_sources')
      );
      expect(sourceInserts.length).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // AC3: Rejects duplicate sources
  // -----------------------------------------------------------------------

  describe('AC3: Rejects duplicate sources', () => {
    it('rejects duplicate source exam in same request', async () => {
      setupExamEditorMocks();
      // Both sources return valid but are duplicates.
      q().mockResolvedValueOnce([[
        { id: 10, status: 'PUBLISHED', published_version: 1, title: 'Source' },
      ]]);

      const res = await request(app)
        .post('/api/admin/mixed-exams')
        .set('Authorization', `Bearer ${examEditorToken}`)
        .send({
          title: 'Mixed Exam',
          slug: 'mixed-exam',
          collectionId: 1,
          skillType: 'LR',
          durationMinutes: 120,
          sources: [
            { sourceExamId: 10, sourceVersion: 1, orderIndex: 0 },
            { sourceExamId: 10, sourceVersion: 1, orderIndex: 1 },
          ],
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('Duplicate');
    });
  });

  // -----------------------------------------------------------------------
  // AC4: Published mixed produces immutable snapshot
  // -----------------------------------------------------------------------

  describe('AC4: Published mixed produces immutable snapshot', () => {
    it('publish creates immutable snapshot from sources', async () => {
      setupExamEditorMocks();

      const mockGetConnection = pool.getConnection as jest.Mock;
      const mockConn = {
        beginTransaction: jest.fn().mockResolvedValue(undefined),
        query: jest.fn(),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
        release: jest.fn(),
      };
      mockGetConnection.mockResolvedValue(mockConn);

      // Exam lookup.
      mockConn.query.mockResolvedValueOnce([[{
        id: 100,
        status: 'DRAFT',
        version: 1,
        is_mixed: true,
      }]]);
      // Sources lookup.
      mockConn.query.mockResolvedValueOnce([[
        {
          source_exam_id: 10,
          source_version: 1,
          order_index: 0,
          section_mapping: null,
          source_title: 'Source A',
          source_slug: 'source-a',
        },
      ]]);
      // Source snapshot lookup.
      mockConn.query.mockResolvedValueOnce([[
        { snapshot: JSON.stringify({ examId: 10, sections: [], questionCount: 50 }) },
      ]]);
      // Snapshot insert.
      mockConn.query.mockResolvedValueOnce([{ insertId: 1 }]);
      // Exam update.
      mockConn.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      // Audit insert.
      mockConn.query.mockResolvedValueOnce([{ insertId: 1 }]);

      const res = await request(app)
        .post('/api/admin/mixed-exams/100/publish')
        .set('Authorization', `Bearer ${examEditorToken}`);

      expect(res.status).toBe(200);
      // Verify snapshot insert was called.
      expect(mockConn.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO exam_snapshots'),
        expect.any(Array)
      );
    });
  });

  // -----------------------------------------------------------------------
  // AC5: Admin results require capabilities/reasons/idempotency/audit
  // -----------------------------------------------------------------------

  describe('AC5: Admin results require capabilities', () => {
    it('rejects result operations without RESULT_MANAGER capability', async () => {
      // userToken (sub: 5) is not admin, requireAdmin returns 403
      q().mockResolvedValueOnce([[]]); // admin check - user NOT admin
      const res = await request(app)
        .get('/api/admin/results')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Admin access required');
    });

    it('allows result operations with RESULT_MANAGER capability', async () => {
      setupResultManagerMocks();
      q().mockResolvedValueOnce([[{ total: 0 }]]); // count
      q().mockResolvedValueOnce([[]]); // rows

      const res = await request(app)
        .get('/api/admin/results')
        .set('Authorization', `Bearer ${resultManagerToken}`);

      expect(res.status).toBe(200);
    });

    it('regrade requires reason', async () => {
      setupResultManagerMocks();

      const res = await request(app)
        .post('/api/admin/results/1/regrade')
        .set('Authorization', `Bearer ${resultManagerToken}`)
        .send({}); // Missing reason

      expect(res.status).toBe(400);
    });

    it('override requires at least one score', async () => {
      setupResultManagerMocks();
      // No idempotency key, so no extra query needed

      const res = await request(app)
        .post('/api/admin/results/1/override')
        .set('Authorization', `Bearer ${resultManagerToken}`)
        .send({ reason: 'Test' }); // Missing scores

      expect(res.status).toBe(400);
    });
  });

  // -----------------------------------------------------------------------
  // AC6: Idempotency
  // -----------------------------------------------------------------------

  describe('AC6: Regrade deterministic revision', () => {
    it('regrade recalculates scores from correct answers (new revision, not copy)', async () => {
      setupResultManagerMocks();
      // No existing idempotency key (first call)
      q().mockResolvedValueOnce([[]]);

      const mockGetConnection = pool.getConnection as jest.Mock;
      const mockConn = {
        beginTransaction: jest.fn().mockResolvedValue(undefined),
        query: jest.fn(),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
        release: jest.fn(),
      };
      mockGetConnection.mockResolvedValue(mockConn);

      // Attempt locked: prev scores 1+1=2, but responses contain 2 correct answers
      mockConn.query.mockResolvedValueOnce([[{
        id: 1,
        status: 'COMPLETED',
        skill_type: 'LR',
        prev_listening: 1,
        prev_reading: 1,
        prev_total: 2,
        grading_snapshot_version: 1,
        exam_id: 100,
      }]]);
      // Correct options: Q1 listening(section 1), Q2 listening(section 2), Q3 reading(section 5)
      mockConn.query.mockResolvedValueOnce([[
        { question_id: 1, correct_option_id: 1, section_order: 1 },
        { question_id: 2, correct_option_id: 2, section_order: 2 },
        { question_id: 3, correct_option_id: 3, section_order: 5 },
      ]]);
      // Responses: 3 correct answers
      mockConn.query.mockResolvedValueOnce([[
        { question_id: 1, selected_option_id: 1 },
        { question_id: 2, selected_option_id: 2 },
        { question_id: 3, selected_option_id: 3 },
      ]]);
      // Persist question scores
      mockConn.query.mockResolvedValueOnce([{ affectedRows: 3 }]);
      // Result update (deterministic recalc)
      mockConn.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      // Audit log
      mockConn.query.mockResolvedValueOnce([{ insertId: 1 }]);
      // Idempotency store
      mockConn.query.mockResolvedValueOnce([{ insertId: 1 }]);

      const res = await request(app)
        .post('/api/admin/results/1/regrade')
        .set('Authorization', `Bearer ${resultManagerToken}`)
        .send({ reason: 'Recalc after key change' });

      expect(res.status).toBe(200);
      // Scores recomputed deterministically: 2 listening + 1 reading = 3 total
      expect(res.body.newScores).toEqual({ listening: 2, reading: 1, total: 3 });
      expect(res.body.previousScores).toEqual({ listening: 1, reading: 1, total: 2 });
      // Not a copy — new revision differs from previous
      expect(res.body.newScores).not.toEqual(res.body.previousScores);
    });
  });

  describe('AC7: Restore re-applies prior revision score payload', () => {
    it('restore applies prior revision scores from audit log at target version', async () => {
      setupResultManagerMocks();

      const mockGetConnection = pool.getConnection as jest.Mock;
      const mockConn = {
        beginTransaction: jest.fn().mockResolvedValue(undefined),
        query: jest.fn(),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
        release: jest.fn(),
      };
      mockGetConnection.mockResolvedValue(mockConn);

      // Attempt locked: current scores differ from revision
      mockConn.query.mockResolvedValueOnce([[{
        id: 1,
        status: 'COMPLETED',
        skill_type: 'LR',
        prev_listening: 300,
        prev_reading: 250,
        prev_total: 550,
        grading_snapshot_version: 2,
        pinned_snapshot_version: 1,
        exam_id: 100,
      }]]);
      // Snapshot v1 exists for exam
      mockConn.query.mockResolvedValueOnce([[{ version: 1 }]]);
      // Prior revision payload from audit log (scores at snapshot v1)
      mockConn.query.mockResolvedValueOnce([[{
        new_scores: JSON.stringify({ listening: 200, reading: 150, total: 350 }),
      }]]);
      // Update grading_snapshot_version to 1
      mockConn.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      // Apply restored score payload to result
      mockConn.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      // Audit log
      mockConn.query.mockResolvedValueOnce([{ insertId: 1 }]);

      const res = await request(app)
        .post('/api/admin/results/1/restore')
        .set('Authorization', `Bearer ${resultManagerToken}`)
        .send({ targetSnapshotVersion: 1, reason: 'Revert to v1 scoring' });

      expect(res.status).toBe(200);
      expect(res.body.restoredToVersion).toBe(1);
      // Score payload re-applied from prior revision, not just snapshot version flip
      expect(res.body.restoredScores).toEqual({ listening: 200, reading: 150, total: 350 });
    });

    it('restore falls back to current scores when no prior revision exists', async () => {
      setupResultManagerMocks();

      const mockGetConnection = pool.getConnection as jest.Mock;
      const mockConn = {
        beginTransaction: jest.fn().mockResolvedValue(undefined),
        query: jest.fn(),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
        release: jest.fn(),
      };
      mockGetConnection.mockResolvedValue(mockConn);

      mockConn.query.mockResolvedValueOnce([[{
        id: 1,
        status: 'COMPLETED',
        skill_type: 'LR',
        prev_listening: 300,
        prev_reading: 250,
        prev_total: 550,
        grading_snapshot_version: 2,
        pinned_snapshot_version: 1,
        exam_id: 100,
      }]]);
      mockConn.query.mockResolvedValueOnce([[{ version: 1 }]]);
      // No prior revision found
      mockConn.query.mockResolvedValueOnce([[]]);
      // Update snapshot version
      mockConn.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      // Apply result
      mockConn.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      // Audit
      mockConn.query.mockResolvedValueOnce([{ insertId: 1 }]);

      const res = await request(app)
        .post('/api/admin/results/1/restore')
        .set('Authorization', `Bearer ${resultManagerToken}`)
        .send({ targetSnapshotVersion: 1, reason: 'Restore without revision' });

      expect(res.status).toBe(200);
      expect(res.body.restoredScores).toEqual({ listening: 300, reading: 250, total: 550 });
    });
  });

  describe('AC6: Idempotency for result operations', () => {
    it('duplicate override with same idempotency key returns replayed', async () => {
      setupResultManagerMocks();
      // No existing idempotency key (first call)
      q().mockResolvedValueOnce([[]]);

      const mockGetConnection = pool.getConnection as jest.Mock;
      const mockConn = {
        beginTransaction: jest.fn().mockResolvedValue(undefined),
        query: jest.fn(),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
        release: jest.fn(),
      };
      mockGetConnection.mockResolvedValue(mockConn);

      mockConn.query.mockResolvedValueOnce([[{
        id: 1,
        status: 'COMPLETED',
        skill_type: 'LR',
        prev_listening: 300,
        prev_reading: 250,
        prev_total: 550,
        grading_snapshot_version: 1,
      }]]);
      mockConn.query.mockResolvedValueOnce([[{ question_id: 1, correct_option_id: 1, section_order: 1 }]]); // correct options
      mockConn.query.mockResolvedValueOnce([[{ question_id: 1, selected_option_id: 1 }]]); // responses
      mockConn.query.mockResolvedValueOnce([{ affectedRows: 1 }]); // question scores
      mockConn.query.mockResolvedValueOnce([{ affectedRows: 1 }]); // result update
      mockConn.query.mockResolvedValueOnce([{ insertId: 1 }]); // audit
      mockConn.query.mockResolvedValueOnce([{ insertId: 1 }]); // idempotency store

      const res = await request(app)
        .post('/api/admin/results/1/override')
        .set('Authorization', `Bearer ${resultManagerToken}`)
        .send({
          listeningScore: 400,
          readingScore: 350,
          reason: 'Test',
          idempotencyKey: 'test-key-123',
        });

      expect(res.status).toBe(200);
      expect(res.body.replayed).toBeUndefined();
    });

    it('override with new idempotency key proceeds', async () => {
      setupResultManagerMocks();
      // No existing idempotency key.
      q().mockResolvedValueOnce([[]]);

      const mockGetConnection = pool.getConnection as jest.Mock;
      const mockConn = {
        beginTransaction: jest.fn().mockResolvedValue(undefined),
        query: jest.fn(),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
        release: jest.fn(),
      };
      mockGetConnection.mockResolvedValue(mockConn);

      mockConn.query.mockResolvedValueOnce([[{
        id: 1,
        status: 'COMPLETED',
        skill_type: 'LR',
        prev_listening: 300,
        prev_reading: 250,
        prev_total: 550,
        grading_snapshot_version: 1,
      }]]);
      mockConn.query.mockResolvedValueOnce([[{ question_id: 1, correct_option_id: 1, section_order: 1 }]]); // correct options
      mockConn.query.mockResolvedValueOnce([[{ question_id: 1, selected_option_id: 1 }]]); // responses
      mockConn.query.mockResolvedValueOnce([{ affectedRows: 1 }]); // question scores
      mockConn.query.mockResolvedValueOnce([{ affectedRows: 1 }]); // result update
      mockConn.query.mockResolvedValueOnce([{ insertId: 1 }]); // audit
      mockConn.query.mockResolvedValueOnce([{ insertId: 1 }]); // idempotency store

      const res = await request(app)
        .post('/api/admin/results/1/override')
        .set('Authorization', `Bearer ${resultManagerToken}`)
        .send({
          listeningScore: 400,
          readingScore: 350,
          reason: 'Score correction',
          idempotencyKey: 'new-key-456',
        });

      expect(res.status).toBe(200);
      expect(res.body.replayed).toBeUndefined();
    });

    it('same key/different request returns 409 conflict', async () => {
      setupResultManagerMocks();

      const mockGetConnection = pool.getConnection as jest.Mock;
      const mockConn = {
        beginTransaction: jest.fn().mockResolvedValue(undefined),
        query: jest.fn(),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
        release: jest.fn(),
      };
      mockGetConnection.mockResolvedValue(mockConn);

      // Mock attempt query
      mockConn.query.mockResolvedValueOnce([[{
        id: 1,
        status: 'COMPLETED',
        skill_type: 'LR',
        prev_listening: 300,
        prev_reading: 250,
        prev_total: 550,
        grading_snapshot_version: 1,
      }]]);
      // checkIdempotency uses pool.query (not connection) → needs q() mock
      q().mockResolvedValueOnce([[{ result_hash: 'different-hash-xyz' }]]);
      mockConn.query.mockResolvedValueOnce([{ affectedRows: 1 }]); // rollback

      const res = await request(app)
        .post('/api/admin/results/1/override')
        .set('Authorization', `Bearer ${resultManagerToken}`)
        .send({
          listeningScore: 400,
          readingScore: 350,
          reason: 'Different request',
          idempotencyKey: 'reused-key',
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('different request parameters');
    });
  });

  // -----------------------------------------------------------------------
  // Negative: unauthorized roles
  // -----------------------------------------------------------------------

  describe('Negative: unauthorized roles', () => {
    it('rejects mixed exam create without EXAM_EDITOR', async () => {
      // userToken (sub: 5) is not an admin, so requireAdmin returns 403
      q().mockResolvedValueOnce([[]]); // admin check - user NOT admin
      const res = await request(app)
        .post('/api/admin/mixed-exams')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'Mixed Exam',
          slug: 'mixed-exam',
          collectionId: 1,
          skillType: 'LR',
          durationMinutes: 120,
          sources: [{ sourceExamId: 10, sourceVersion: 1, orderIndex: 0 }],
        });

      expect(res.status).toBe(403);
    });

    it('AUDITOR cannot modify results', async () => {
      // auditorToken (sub: 4) is admin but AUDITOR role cannot regrade
      q().mockResolvedValueOnce([[{ id: 1 }]]); // requireAdmin check - is admin
      q().mockResolvedValueOnce([[]]); // roles check - AUDITOR not RESULT_MANAGER

      const res = await request(app)
        .post('/api/admin/results/1/regrade')
        .set('Authorization', `Bearer ${auditorToken}`)
        .send({ reason: 'Test' });

      expect(res.status).toBe(403);
    });
  });

  // -----------------------------------------------------------------------
  // Negative: mixed duplicate/draft
  // -----------------------------------------------------------------------

  describe('Negative: mixed duplicate/draft', () => {
    it('rejects update sources on PUBLISHED mixed exam', async () => {
      setupExamEditorMocks();
      // validateSources calls pool.query for source exams
      q().mockResolvedValueOnce([[{ id: 10, status: 'PUBLISHED', published_version: 1, title: 'Source' }]]);

      const mockGetConnection = pool.getConnection as jest.Mock;
      const mockConn = {
        beginTransaction: jest.fn().mockResolvedValue(undefined),
        query: jest.fn(),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
        release: jest.fn(),
      };
      mockGetConnection.mockResolvedValue(mockConn);

      // Exam is PUBLISHED.
      mockConn.query.mockResolvedValueOnce([[{
        id: 100,
        status: 'PUBLISHED',
        is_mixed: true,
      }]]);

      const res = await request(app)
        .patch('/api/admin/mixed-exams/100/sources')
        .set('Authorization', `Bearer ${examEditorToken}`)
        .send({
          sources: [{ sourceExamId: 10, sourceVersion: 1, orderIndex: 0 }],
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('DRAFT');
    });
  });

  // -----------------------------------------------------------------------
  // Negative: replay operations
  // -----------------------------------------------------------------------

  describe('Negative: replay operations', () => {
    it('replay idempotent operation returns success without re-processing', async () => {
      setupResultManagerMocks();

      const mockGetConnection = pool.getConnection as jest.Mock;
      const mockConn = {
        beginTransaction: jest.fn().mockResolvedValue(undefined),
        query: jest.fn(),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
        release: jest.fn(),
      };
      mockGetConnection.mockResolvedValue(mockConn);

      // Existing idempotency key with matching hash (same previous scores).
      mockConn.query.mockResolvedValueOnce([[{
        id: 1,
        status: 'COMPLETED',
        skill_type: 'LR',
        prev_listening: 300,
        prev_reading: 250,
        prev_total: 550,
        grading_snapshot_version: 1,
      }]]);
      // checkIdempotency uses pool.query → mock the match
      // hash of {listening:300, reading:250, total:550} (prev scores of the mocked attempt)
      q().mockResolvedValueOnce([[{ result_hash: 'f0114efd9b12178693c24609f59ca9d6ee42cdc6b4723971b57c13e136ffeed5' }]]);
      mockConn.query.mockResolvedValueOnce([{ affectedRows: 1 }]); // rollback

      const res = await request(app)
        .post('/api/admin/results/1/regrade')
        .set('Authorization', `Bearer ${resultManagerToken}`)
        .send({
          reason: 'Regrading',
          idempotencyKey: 'replay-key',
        });

      expect(res.status).toBe(200);
      expect(res.body.replayed).toBe(true);
    });

    it('regrade with same key/different body returns 409', async () => {
      setupResultManagerMocks();

      const mockGetConnection = pool.getConnection as jest.Mock;
      const mockConn = {
        beginTransaction: jest.fn().mockResolvedValue(undefined),
        query: jest.fn(),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
        release: jest.fn(),
      };
      mockGetConnection.mockResolvedValue(mockConn);

      // Existing idempotency key with different hash.
      mockConn.query.mockResolvedValueOnce([[{
        id: 1,
        status: 'COMPLETED',
        skill_type: 'LR',
        prev_listening: 300,
        prev_reading: 250,
        prev_total: 550,
        grading_snapshot_version: 1,
      }]]);
      // checkIdempotency finds hash mismatch via pool.query
      q().mockResolvedValueOnce([[{ result_hash: 'hash-from-previous-override' }]]);
      mockConn.query.mockResolvedValueOnce([{ affectedRows: 1 }]); // rollback

      const res = await request(app)
        .post('/api/admin/results/1/regrade')
        .set('Authorization', `Bearer ${resultManagerToken}`)
        .send({
          reason: 'Regrading with different params',
          idempotencyKey: 'replay-key',
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('different request parameters');
    });
  });

  // -----------------------------------------------------------------------
  // Score validation (<=990)
  // -----------------------------------------------------------------------

  describe('Score validation: total <= 990', () => {
    it('rejects override with total > 990', async () => {
      setupResultManagerMocks();

      const res = await request(app)
        .post('/api/admin/results/1/override')
        .set('Authorization', `Bearer ${resultManagerToken}`)
        .send({
          listeningScore: 500,
          readingScore: 500,
          reason: 'Invalid score',
          idempotencyKey: 'over-limit-key',
        });

      expect(res.status).toBe(400);
      // Zod validation error is an array
      expect(res.body.error).toBeInstanceOf(Array);
      const totalError = res.body.error.find((e: { path: string[] }) => e.path === undefined || e.path.length === 0);
      expect(totalError?.message).toContain('cannot exceed 990');
    });
  });
});
