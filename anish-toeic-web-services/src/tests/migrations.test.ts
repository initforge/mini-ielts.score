import { runMigrations } from '../migrations/runner';
import { pool } from '../services/db.service';
import fs from 'fs';

jest.mock('../services/db.service', () => ({
  pool: {
    query: jest.fn().mockResolvedValue([[], []])
  }
}));

describe('Migrations AC5', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should run up migrations and parse sql correctly', async () => {
    // Override process.exit to prevent test from exiting
    const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    
    await runMigrations('up');
    
    expect(pool.query).toHaveBeenCalled();
    const calls = (pool.query as jest.Mock).mock.calls;
    // Basic inspection that CREATE TABLE is called
    expect(calls.some(call => call[0].includes('CREATE TABLE toeic_exams'))).toBe(true);
    expect(calls.some(call => call[0].includes('CREATE TABLE toeic_attempts'))).toBe(true);
    
    mockExit.mockRestore();
  });

  it('should run down migrations safely', async () => {
    const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    
    await runMigrations('down');
    
    expect(pool.query).toHaveBeenCalled();
    const calls = (pool.query as jest.Mock).mock.calls;
    expect(calls.some(call => call[0].includes('DROP TABLE IF EXISTS toeic_exams'))).toBe(true);
    
    mockExit.mockRestore();
  });
});
