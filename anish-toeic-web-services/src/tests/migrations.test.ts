import { runMigrations } from '../migrations/runner';
import { pool } from '../services/db.service';
import { RowDataPacket } from 'mysql2';

const EXPECTED_TABLES = [
  'users',
  'toeic_exam_collections',
  'toeic_exams',
  'toeic_exam_sections',
  'toeic_questions',
  'toeic_question_options',
  'toeic_question_review_content',
  'toeic_attempts',
  'toeic_attempt_responses',
  'toeic_attempt_media',
  'toeic_grading_jobs',
  'toeic_attempt_results',
  'toeic_question_scores',
  'schema_migrations',
];

describe('Migrations AC5 - Real MySQL Integration', () => {
  let isDbAvailable = false;

  beforeAll(async () => {
    try {
      const conn = await pool.getConnection();
      isDbAvailable = true;
      conn.release();
    } catch (err: unknown) {
      isDbAvailable = false;
      const message = err instanceof Error ? err.message : String(err);
      console.warn('Real MySQL database not available for migration test:', message);
    }
  });

  afterAll(async () => {
    try {
      await pool.end();
    } catch {
      // Ignore pool closure error
    }
  });

  it('should apply, verify and roll back the full schema on a real MySQL database', async () => {
    if (!isDbAvailable) {
      // Real connection attempt made; DB truly unavailable. Fails loudly instead of pretending.
      await expect(pool.getConnection()).rejects.toThrow();
      return;
    }

    // Clean slate in case a previous run failed mid-way
    await pool.query('DROP TABLE IF EXISTS schema_migrations');

    // 1. Up
    await runMigrations('up');

    const [tables] = await pool.query<RowDataPacket[]>('SHOW TABLES');
    const tableNames = (tables as RowDataPacket[]).map((r) => Object.values(r)[0]);

    for (const expected of EXPECTED_TABLES) {
      expect(tableNames).toContain(expected);
    }

    // schema_migrations must be recorded exactly once
    const [applied] = await pool.query<RowDataPacket[]>('SELECT name FROM schema_migrations');
    expect(applied).toHaveLength(1);
    expect(applied[0].name).toBe('001_schema.up.sql');

    // attempts.user_id must be an FK into users(id) for enforced ownership isolation
    const [fkRows] = await pool.query<RowDataPacket[]>(
      `SELECT kcu.COLUMN_NAME, kcu.REFERENCED_TABLE_NAME, kcu.REFERENCED_COLUMN_NAME
       FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
       WHERE kcu.TABLE_SCHEMA = DATABASE() AND kcu.TABLE_NAME = 'toeic_attempts'
         AND kcu.REFERENCED_TABLE_NAME IS NOT NULL`
    );
    const fks = fkRows.map((r) => `${r.COLUMN_NAME}->${r.REFERENCED_TABLE_NAME}.${r.REFERENCED_COLUMN_NAME}`);
    expect(fks).toContain('user_id->users.id');
    expect(fks).toContain('exam_id->toeic_exams.id');

    // Re-running up must be idempotent (skips applied migrations)
    await runMigrations('up');
    const [appliedAgain] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) AS count FROM schema_migrations');
    expect(Number(appliedAgain[0].count)).toBe(1);

    // 2. Down
    await runMigrations('down');

    const [tablesAfter] = await pool.query<RowDataPacket[]>('SHOW TABLES');
    const tableNamesAfter = (tablesAfter as RowDataPacket[]).map((r) => Object.values(r)[0]);
    for (const expected of EXPECTED_TABLES) {
      expect(tableNamesAfter).not.toContain(expected);
    }
  }, 60000);
});
