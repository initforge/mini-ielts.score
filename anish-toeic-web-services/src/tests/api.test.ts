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

const mockToken = jwt.sign({ userId: 'mock-user-id' }, process.env.JWT_SECRET || 'fallback_secret');

describe('API Security & Data Separation AC6', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return safe session payload without protected review fields', async () => {
    const mockQuery = pool.query as jest.Mock;

    // 1st query: attempt
    mockQuery.mockResolvedValueOnce([[{ id: 1, user_id: 'mock-user-id', exam_id: 10, status: 'IN_PROGRESS' }]]);
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

  it('should deny access to review endpoint if attempt is not COMPLETED', async () => {
    const mockQuery = pool.query as jest.Mock;

    // 1st query: attempt check returns IN_PROGRESS
    mockQuery.mockResolvedValueOnce([[{ id: 1, status: 'IN_PROGRESS', exam_id: 10, user_id: 'mock-user-id' }]]);

    const res = await request(app)
      .get('/api/toeic-attempts/1/review')
      .set('Authorization', `Bearer ${mockToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('not available');
  });

  it('should return review content if attempt is COMPLETED', async () => {
    const mockQuery = pool.query as jest.Mock;

    // 1st query: attempt check returns COMPLETED
    mockQuery.mockResolvedValueOnce([[{ id: 1, status: 'COMPLETED', exam_id: 10, user_id: 'mock-user-id' }]]);
    // 2nd query: get review content
    mockQuery.mockResolvedValueOnce([[{ question_id: 101, correct_option_id: 1001, explanation: 'Because it is' }]]);

    const res = await request(app)
      .get('/api/toeic-attempts/1/review')
      .set('Authorization', `Bearer ${mockToken}`);

    expect(res.status).toBe(200);
    expect(res.body[0].explanation).toBe('Because it is');
  });
});
