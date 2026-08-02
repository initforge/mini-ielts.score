import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import toeicRoutes from '../routes/toeic.routes';
import { pool } from '../services/db.service';
import { ToeicService } from '../services/toeic.service';

jest.mock('../services/db.service', () => ({
  pool: {
    query: jest.fn(),
    getConnection: jest.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use('/api', toeicRoutes);

const mockToken = jwt.sign({ sub: '1' }, process.env.JWT_SECRET as string);

describe('API Security & Data Separation AC6', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Session projection
  // ---------------------------------------------------------------------------

  it('should return safe session payload without protected review fields', async () => {
    const mockQuery = pool.query as jest.Mock;

    // 1st query: attempt
    mockQuery.mockResolvedValueOnce([[{ id: 1, user_id: '1', exam_id: 10, status: 'IN_PROGRESS' }]]);
    // 2nd query: responses
    mockQuery.mockResolvedValueOnce([[]]);
    // 3rd query: sections
    mockQuery.mockResolvedValueOnce([[{ id: 1, title: 'Section 1' }]]);
    // 4th query: questions
    mockQuery.mockResolvedValueOnce([[{ id: 101, section_id: 1, content: 'Q1' }]]);
    // 5th query: options
    mockQuery.mockResolvedValueOnce([[{ id: 1001, question_id: 101, label: 'A' }]]);

    const res = await request(app)
      .get('/api/toeic-attempts/1')
      .set('Authorization', `Bearer ${mockToken}`);

    expect(res.status).toBe(200);
    const body = res.body;

    // Assert no protected fields in the payload
    expect(body.session.questions[0].explanation).toBeUndefined();
    expect(body.session.questions[0].correct_option_id).toBeUndefined();
    expect(body.session.options[0].is_correct).toBeUndefined();
    expect(body.session.questions[0].content).toBe('Q1');
  });

  // ---------------------------------------------------------------------------
  // Review authorization
  // ---------------------------------------------------------------------------

  it('should deny access to review endpoint if attempt is not COMPLETED', async () => {
    const mockQuery = pool.query as jest.Mock;

    // 1st query: attempt check returns IN_PROGRESS
    mockQuery.mockResolvedValueOnce([[{ id: 1, status: 'IN_PROGRESS', exam_id: 10, user_id: '1' }]]);

    const res = await request(app)
      .get('/api/toeic-attempts/1/review')
      .set('Authorization', `Bearer ${mockToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('not available');
  });

  it('should return review content if attempt is COMPLETED', async () => {
    const mockQuery = pool.query as jest.Mock;

    // 1st query: attempt check returns COMPLETED
    mockQuery.mockResolvedValueOnce([[{ id: 1, status: 'COMPLETED', exam_id: 10, user_id: '1' }]]);
    // 2nd query: get review content
    mockQuery.mockResolvedValueOnce([[{ question_id: 101, correct_option_id: 1001, explanation: 'Because it is' }]]);

    const res = await request(app)
      .get('/api/toeic-attempts/1/review')
      .set('Authorization', `Bearer ${mockToken}`);

    expect(res.status).toBe(200);
    expect(res.body[0].explanation).toBe('Because it is');
  });

  // ---------------------------------------------------------------------------
  // S4-BE: Protected result projection
  // ---------------------------------------------------------------------------

  describe('Result projection safety (S4-BE)', () => {
    it('projectResult strips internal columns and returns only safe fields', () => {
      const raw = {
        id: 1,
        attempt_id: 42,
        listening_score: 45,
        reading_score: 52,
        total_score: 97,
        status: 'FINAL',
        metrics: '{"key":"value"}',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };

      const projected = ToeicService.projectResult(raw);

      expect(projected).toEqual({
        listeningScore: 45,
        readingScore: 52,
        totalScore: 97,
        status: 'FINAL',
      });
      expect(Object.keys(projected)).not.toContain('id');
      expect(Object.keys(projected)).not.toContain('attempt_id');
      expect(Object.keys(projected)).not.toContain('metrics');
      expect(Object.keys(projected)).not.toContain('created_at');
      expect(Object.keys(projected)).not.toContain('updated_at');
    });

    it('projectResult defaults missing score fields to 0', () => {
      const raw = { status: 'PROVISIONAL' };
      const projected = ToeicService.projectResult(raw);

      expect(projected).toEqual({
        listeningScore: 0,
        readingScore: 0,
        totalScore: 0,
        status: 'PROVISIONAL',
      });
    });
  });

  describe('GET /api/toeic-attempts/:id/result — safe projection', () => {
    it('returns only the projected score fields', async () => {
      const mockQuery = pool.query as jest.Mock;

      // Simulate SELECT that returns only projected columns
      mockQuery.mockResolvedValueOnce([
        [{ listening_score: 60, reading_score: 72, total_score: 132, status: 'FINAL' }],
      ]);

      const res = await request(app)
        .get('/api/toeic-attempts/99/result')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        listeningScore: 60,
        readingScore: 72,
        totalScore: 132,
        status: 'FINAL',
      });

      // Verify no internal columns leak
      const bodyKeys = Object.keys(res.body);
      expect(bodyKeys).not.toContain('id');
      expect(bodyKeys).not.toContain('attempt_id');
      expect(bodyKeys).not.toContain('metrics');
      expect(bodyKeys).not.toContain('created_at');
      expect(bodyKeys).not.toContain('updated_at');
      expect(bodyKeys).not.toContain('listening_score');
      expect(bodyKeys).not.toContain('reading_score');
      expect(bodyKeys).not.toContain('total_score');
    });

    it('returns 404 when result not found', async () => {
      const mockQuery = pool.query as jest.Mock;
      mockQuery.mockResolvedValueOnce([[]]);

      const res = await request(app)
        .get('/api/toeic-attempts/99/result')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(res.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------------
  // A7 M1: public catalog DTO must never disclose lifecycle internals
  // ---------------------------------------------------------------------------

  describe('Public catalog DTO — lifecycle field isolation (A7 M1)', () => {
    it('strips status/version/published_version from anonymous list response', async () => {
      const mockQuery = pool.query as jest.Mock;
      mockQuery
        .mockResolvedValueOnce([[{ total: 1 }]]) // count
        .mockResolvedValueOnce([[
          {
            id: 1,
            collection_id: 1,
            slug: 'full-lr',
            title: 'Full LR',
            duration_minutes: 120,
            question_count: 200,
            skill_type: 'LR',
            status: 'PUBLISHED',
            version: 3,
            published_version: 2,
            updated_at: '2026-08-02T00:00:00Z',
          },
        ]]); // raw row deliberately carries lifecycle columns

      const res = await request(app).get('/api/toeic-exams');
      expect(res.status).toBe(200);

      const item = res.body.items[0];
      expect(item.status).toBeUndefined();
      expect(item.version).toBeUndefined();
      expect(item.published_version).toBeUndefined();
      // Public safe fields still present
      expect(item.slug).toBe('full-lr');
      expect(item.title).toBe('Full LR');
      expect(item.skill_type).toBe('LR');
    });

    it('strips lifecycle fields from anonymous exam detail response', async () => {
      const mockQuery = pool.query as jest.Mock;
      mockQuery
        .mockResolvedValueOnce([[
          {
            id: 1,
            collection_id: 1,
            slug: 'full-lr',
            title: 'Full LR',
            duration_minutes: 120,
            question_count: 200,
            skill_type: 'LR',
            status: 'PUBLISHED',
            version: 5,
            published_version: 4,
          },
        ]])
        .mockResolvedValueOnce([[{ id: 10, exam_id: 1, title: 'Listening' }]]);

      const res = await request(app).get('/api/toeic-exams/full-lr');
      expect(res.status).toBe(200);
      expect(res.body.status).toBeUndefined();
      expect(res.body.version).toBeUndefined();
      expect(res.body.published_version).toBeUndefined();
      expect(res.body.sections[0].title).toBe('Listening');
    });
  });

  // ---------------------------------------------------------------------------
  // A7 M1 repair: PUBLISHED-only lifecycle on public learner surfaces
  // ---------------------------------------------------------------------------

  describe('Public lifecycle enforcement — PUBLISHED only (A7 M1 repair)', () => {
    it('restricts both count and row queries to status = PUBLISHED', async () => {
      const mockQuery = pool.query as jest.Mock;
      mockQuery
        .mockResolvedValueOnce([[{ total: 0 }]]) // count
        .mockResolvedValueOnce([[]]); // rows

      const res = await request(app).get('/api/toeic-exams');
      expect(res.status).toBe(200);

      const countCall = mockQuery.mock.calls[0];
      const rowsCall = mockQuery.mock.calls[1];
      expect(countCall[0]).toContain('status = ?');
      expect(countCall[1][0]).toBe('PUBLISHED');
      expect(rowsCall[0]).toContain('status = ?');
      expect(rowsCall[0]).toContain('LIMIT ? OFFSET ?');
      expect(rowsCall[1][0]).toBe('PUBLISHED');
    });

    it('returns 404 for a DRAFT/ARCHIVED exam slug (not merely stripped)', async () => {
      const mockQuery = pool.query as jest.Mock;
      mockQuery.mockResolvedValueOnce([[]]); // no PUBLISHED row

      const res = await request(app).get('/api/toeic-exams/archived-lr');
      expect(res.status).toBe(404);

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain("AND status = 'PUBLISHED'");
    });

    it('still serves detail for a PUBLISHED exam', async () => {
      const mockQuery = pool.query as jest.Mock;
      mockQuery
        .mockResolvedValueOnce([[
          { id: 1, collection_id: 1, slug: 'full-lr', title: 'Full LR', duration_minutes: 120, question_count: 200, skill_type: 'LR' },
        ]])
        .mockResolvedValueOnce([[{ id: 10, exam_id: 1, title: 'Listening' }]]);

      const res = await request(app).get('/api/toeic-exams/full-lr');
      expect(res.status).toBe(200);
      expect(res.body.slug).toBe('full-lr');
      expect(res.body.sections[0].title).toBe('Listening');
    });

    it('createAttempt rejects a DRAFT/ARCHIVED exam with 404 (no existence oracle)', async () => {
      const mockGetConnection = pool.getConnection as jest.Mock;

      const mockConn = {
        beginTransaction: jest.fn().mockResolvedValue(undefined),
        query: jest.fn(),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
        release: jest.fn(),
      };

      // Exam not found → 404
      mockConn.query.mockResolvedValueOnce([[]]);
      mockGetConnection.mockResolvedValue(mockConn);

      const res = await request(app)
        .post('/api/toeic-exams/5/attempts')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({ mode: 'EXAM' });

      expect(res.status).toBe(404);
      expect(mockConn.rollback).toHaveBeenCalled();
      expect(mockConn.release).toHaveBeenCalled();
    });

    it('createAttempt atomically gates on PUBLISHED inside the insert and allows PUBLISHED', async () => {
      const mockGetConnection = pool.getConnection as jest.Mock;

      const mockConn = {
        beginTransaction: jest.fn().mockResolvedValue(undefined),
        query: jest.fn(),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
        release: jest.fn(),
      };

      // Exam is PUBLISHED
      mockConn.query
        .mockResolvedValueOnce([[{ id: 3, status: 'PUBLISHED', version: 1, published_version: 1 }]])
        .mockResolvedValueOnce([{ insertId: 77, affectedRows: 1 }]);
      mockGetConnection.mockResolvedValue(mockConn);

      const res = await request(app)
        .post('/api/toeic-exams/3/attempts')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({ mode: 'EXAM' });

      expect(res.status).toBe(201);
      expect(res.body.attemptId).toBe(77);
      expect(res.body.status).toBe('IN_PROGRESS');
      expect(mockConn.commit).toHaveBeenCalled();
      expect(mockConn.release).toHaveBeenCalled();
    });
  });
});
