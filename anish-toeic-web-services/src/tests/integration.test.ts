import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import toeicRoutes from '../routes/toeic.routes';
import { pool } from '../services/db.service';

jest.mock('../services/db.service', () => ({
  pool: {
    query: jest.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use('/api', toeicRoutes);

const mockUserToken = jwt.sign({ sub: '1' }, process.env.JWT_SECRET as string);
const wrongUserToken = jwt.sign({ sub: '2' }, process.env.JWT_SECRET as string);

describe('Integration AC7: Auth, ownership, revision, idempotency', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Ownership and Auth', () => {
    it('should deny updateResponse for different owner', async () => {
      const mockQuery = pool.query as jest.Mock;
      // Return empty array to simulate not found or not owner
      mockQuery.mockResolvedValueOnce([[]]);

      const res = await request(app)
        .patch('/api/toeic-attempts/1/responses/101')
        .set('Authorization', `Bearer ${wrongUserToken}`)
        .send({ clientRevision: 1 });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Attempt not found or access denied');
    });
  });

  describe('State Enforcement and Idempotency', () => {
    it('should deny updateResponse if attempt is SUBMITTED', async () => {
      const mockQuery = pool.query as jest.Mock;
      mockQuery.mockResolvedValueOnce([[{ id: 1, status: 'SUBMITTED', exam_id: 10 }]]);

      const res = await request(app)
        .patch('/api/toeic-attempts/1/responses/101')
        .set('Authorization', `Bearer ${mockUserToken}`)
        .send({ clientRevision: 1 });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('Attempt is not IN_PROGRESS');
    });

    it('should return idempotency success if submitAttempt called on SUBMITTED attempt', async () => {
      const mockConn = {
        beginTransaction: jest.fn().mockResolvedValue(undefined),
        query: jest.fn().mockResolvedValueOnce([[{ id: 1, status: 'SUBMITTED' }]]),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
        release: jest.fn(),
      };
      (pool as unknown as { getConnection: jest.Mock }).getConnection = jest.fn().mockResolvedValue(mockConn);

      const res = await request(app)
        .post('/api/toeic-attempts/1/submit')
        .set('Authorization', `Bearer ${mockUserToken}`);

      expect(res.status).toBe(200);
      expect(res.body.alreadySubmitted).toBe(true);
    });
  });

  describe('Revision Safety', () => {
    it('should handle stale client_revision with conflict', async () => {
      const mockQuery = pool.query as jest.Mock;
      // Query 1: attempt check
      mockQuery.mockResolvedValueOnce([[{ id: 1, status: 'IN_PROGRESS', exam_id: 10 }]]);
      // Query 2: question check
      mockQuery.mockResolvedValueOnce([[{ id: 101 }]]);
      // Query 3: selected option belongs to the question
      mockQuery.mockResolvedValueOnce([[{ id: 1001 }]]);
      // Query 4: existing response with client_revision = 5
      mockQuery.mockResolvedValueOnce([[{ client_revision: 5 }]]);

      const res = await request(app)
        .patch('/api/toeic-attempts/1/responses/101')
        .set('Authorization', `Bearer ${mockUserToken}`)
        .send({ clientRevision: 3, selectedOptionId: 1001 });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('Stale client_revision');
    });
  });
});
