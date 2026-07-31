import request from 'supertest';
import express from 'express';
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

describe('AC6 Catalog: public contract, pagination, protected-field isolation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('serves the catalog publicly without authentication', async () => {
    const mockQuery = pool.query as jest.Mock;
    mockQuery
      .mockResolvedValueOnce([[{ total: 0 }]]) // count
      .mockResolvedValueOnce([[]]); // rows

    const res = await request(app).get('/api/toeic-exams');
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.total).toBe(0);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(20);
    expect(res.body.totalPages).toBe(0);
  });

  it('applies LIMIT/OFFSET pagination from page and pageSize params', async () => {
    const mockQuery = pool.query as jest.Mock;
    mockQuery
      .mockResolvedValueOnce([[{ total: 45 }]])
      .mockResolvedValueOnce([[{ id: 1, title: 'E1' }, { id: 2, title: 'E2' }]]);

    const res = await request(app).get('/api/toeic-exams?page=3&pageSize=10');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(45);
    expect(res.body.page).toBe(3);
    expect(res.body.pageSize).toBe(10);
    expect(res.body.totalPages).toBe(5);

    const rowsQuery = mockQuery.mock.calls.find((c) => c[0].includes('LIMIT ? OFFSET ?'));
    expect(rowsQuery).toBeDefined();
    expect(rowsQuery[1]).toEqual([10, 20]);
  });

  it('clamps pageSize to a sane maximum and ignores negative pages', async () => {
    const mockQuery = pool.query as jest.Mock;
    mockQuery.mockResolvedValueOnce([[{ total: 5 }]]).mockResolvedValueOnce([[]]);

    const res = await request(app).get('/api/toeic-exams?page=0&pageSize=99999');
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(100);
  });

  it('rejects non-numeric pagination parameters with 400', async () => {
    const res = await request(app).get('/api/toeic-exams?page=abc');
    expect(res.status).toBe(400);
  });

  it('exam detail payload never exposes review/answer content', async () => {
    const mockQuery = pool.query as jest.Mock;
    mockQuery
      .mockResolvedValueOnce([[{ id: 1, slug: 'full-lr', title: 'Full LR', skill_type: 'LR' }]])
      .mockResolvedValueOnce([[{ id: 10, exam_id: 1, title: 'Listening' }]]);

    const res = await request(app).get('/api/toeic-exams/full-lr');
    expect(res.status).toBe(200);
    expect(res.body.explanation).toBeUndefined();
    expect(res.body.correct_option_id).toBeUndefined();
    expect(res.body.rubric).toBeUndefined();
    expect(res.body.sections[0].title).toBe('Listening');
  });

  it('filters catalog by skillType without leaking protected columns', async () => {
    const mockQuery = pool.query as jest.Mock;
    mockQuery.mockResolvedValueOnce([[{ total: 1 }]]);
    mockQuery.mockResolvedValueOnce([[{ id: 1, skill_type: 'SW' }]]);

    const res = await request(app).get('/api/toeic-exams?skillType=SW');
    expect(res.status).toBe(200);
    const filterCall = mockQuery.mock.calls.find((c) => c[0].includes('skill_type = ?'));
    expect(filterCall[1][0]).toBe('SW');
    expect(res.body.items[0].explanation).toBeUndefined();
  });
});
