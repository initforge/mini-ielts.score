import { GradingService } from '../services/grading.service';
import { pool } from '../services/db.service';

jest.mock('../services/db.service', () => ({
  pool: {
    getConnection: jest.fn(),
    query: jest.fn()
  },
}));

describe('GradingService', () => {
  let mockConnection: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConnection = {
      beginTransaction: jest.fn(),
      query: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn(),
    };

    (pool.getConnection as jest.Mock).mockResolvedValue(mockConnection);
  });

  it('should abort if job already completed', async () => {
    mockConnection.query.mockResolvedValueOnce([[{ id: 1, attempt_id: 10, status: 'COMPLETED' }]]);

    const result = await GradingService.processJob(1);

    expect(result.success).toBe(true);
    expect(result.message).toBe('Already processed');
    expect(mockConnection.rollback).toHaveBeenCalled();
  });

  it('should process job for SW exam', async () => {
    // 1st query: Lock job
    mockConnection.query.mockResolvedValueOnce([[{ id: 1, attempt_id: 10, status: 'QUEUED' }]]);
    // 2nd query: Update job to PROCESSING
    mockConnection.query.mockResolvedValueOnce([]);
    // 3rd query: Update attempt to GRADING
    mockConnection.query.mockResolvedValueOnce([]);
    // 4th query: Fetch attempt and exam
    mockConnection.query.mockResolvedValueOnce([[{ id: 10, exam_id: 100, skill_type: 'SW' }]]);
    // 5th query: Fetch responses
    mockConnection.query.mockResolvedValueOnce([[{ id: 1000, attempt_id: 10, question_id: 50, text_response: 'Answer' }]]);

    // Will take ~2 seconds due to real setTimeout in code
    const result = await GradingService.processJob(1);

    expect(result.success).toBe(true);
    expect(result.message).toBe('Grading completed');

    // Verify commit was called
    expect(mockConnection.commit).toHaveBeenCalled();
    expect(mockConnection.release).toHaveBeenCalled();

    // Verify attempt_results insert contains metrics with speaking and writing scores
    const resultsInsertCall = mockConnection.query.mock.calls.find((call: any) =>
      call[0].includes('INSERT INTO toeic_attempt_results')
    );
    expect(resultsInsertCall).toBeDefined();
    
    const params = resultsInsertCall[1];
    const metricsStr = params[5];
    const metrics = JSON.parse(metricsStr);
    
    expect(metrics).toHaveProperty('speaking_score');
    expect(metrics).toHaveProperty('writing_score');
  }, 10000);

  it('should set job to FAILED on error', async () => {
    // 1st query: Lock job
    mockConnection.query.mockResolvedValueOnce([[{ id: 1, attempt_id: 10, status: 'QUEUED' }]]);
    
    // Simulate error during attempt fetch
    mockConnection.query.mockRejectedValueOnce(new Error('DB Error'));

    // We also mocked pool.query for the fallback
    (pool.query as jest.Mock).mockResolvedValue([]);

    await expect(GradingService.processJob(1)).rejects.toThrow('DB Error');

    expect(mockConnection.rollback).toHaveBeenCalled();
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE toeic_grading_jobs SET status = ?'),
      ['FAILED', 'DB Error', 1]
    );
  });
});
