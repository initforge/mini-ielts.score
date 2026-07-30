import request from 'supertest';
import express from 'express';
import toeicRoutes from '../routes/toeic.routes';
import { pool } from '../services/db.service';

jest.mock('../services/db.service', () => ({
  pool: {
    query: jest.fn()
  }
}));

const app = express();
app.use(express.json());
app.use('/api', toeicRoutes);

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
        .set('x-user-id', 'wrong-user-id')
        .send({ clientRevision: 1 });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Unauthorized');
    });
  });

  describe('State Enforcement and Idempotency', () => {
    it('should deny updateResponse if attempt is SUBMITTED', async () => {
      const mockQuery = pool.query as jest.Mock;
      mockQuery.mockResolvedValueOnce([[{ id: 1, status: 'SUBMITTED' }]]);

      const res = await request(app)
        .patch('/api/toeic-attempts/1/responses/101')
        .set('x-user-id', 'mock-user-id')
        .send({ clientRevision: 1 });

      expect(res.status).toBe(409); // From our custom error "Conflict: Attempt is not IN_PROGRESS" mapped to 500 currently in controller?
      // Wait, let's check controller. If error includes "Conflict", it should return 409. I need to make sure controller handles 409!
    });

    it('should return idempotency success if submitAttempt called on SUBMITTED attempt', async () => {
      const mockQuery = pool.query as jest.Mock;
      mockQuery.mockResolvedValueOnce([[{ id: 1, status: 'SUBMITTED' }]]);

      const res = await request(app)
        .post('/api/toeic-attempts/1/submit')
        .set('x-user-id', 'mock-user-id');

      expect(res.status).toBe(200);
      expect(res.body.alreadySubmitted).toBe(true);
    });
  });
  
  describe('Revision Safety', () => {
    it('should include IF(VALUES(client_revision) >= client_revision in sql', async () => {
      const mockQuery = pool.query as jest.Mock;
      mockQuery.mockResolvedValueOnce([[{ id: 1, status: 'IN_PROGRESS' }]]);
      mockQuery.mockResolvedValueOnce([{}]);

      await request(app)
        .patch('/api/toeic-attempts/1/responses/101')
        .set('x-user-id', 'mock-user-id')
        .send({ clientRevision: 5, selectedOptionId: 1001 });

      const queryArg = mockQuery.mock.calls[1][0];
      expect(queryArg).toContain('IF(VALUES(client_revision) >= client_revision');
    });
  });
});
