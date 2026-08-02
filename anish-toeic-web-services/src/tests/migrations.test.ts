import { runMigrations, listMigrationFiles, splitSqlStatements } from '../migrations/runner';
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
  'admin_users',
  'exam_snapshots',
  'exam_audit_log',
  'schema_migrations',
];

describe('splitSqlStatements - INJ004C-A3 runner SQL splitter', () => {
  it('does not split `;` inside -- line comments', () => {
    const sql = [
      '-- No partial exam tree/READY asset on failure; transaction rollback ensures atomicity.',
      'CREATE TABLE a (id INT);',
    ].join('\n');
    const parts = splitSqlStatements(sql);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatch(/^-- [\s\S]*CREATE TABLE a \(id INT\)$/);
  });

  it('does not split `;` inside # line comments', () => {
    const sql = ['# comment; with semicolon', 'CREATE TABLE a (id INT);'].join('\n');
    const parts = splitSqlStatements(sql);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatch(/^# [\s\S]*CREATE TABLE a \(id INT\)$/);
  });

  it('does not split `;` inside block comments', () => {
    const sql = ['/* split; here */', 'CREATE TABLE a (id INT);'].join('\n');
    const parts = splitSqlStatements(sql);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatch(/^\/\* split; here \*\/\s*CREATE TABLE a \(id INT\)$/);
  });

  it('does not split `;` inside single/double/backtick literals', () => {
    const sql =
      "INSERT INTO t (a, b, c) VALUES ('x;y', \"p;q\", `r;s`); CREATE TABLE b (id INT);";
    expect(splitSqlStatements(sql)).toHaveLength(2);
    expect(splitSqlStatements(sql)[0]).toContain("'x;y'");
    expect(splitSqlStatements(sql)[0]).toContain('"p;q"');
    expect(splitSqlStatements(sql)[0]).toContain('`r;s`');
  });

  it('handles doubled-quote escapes inside literals', () => {
    const sql = "INSERT INTO t (a) VALUES ('it''s; fine'); CREATE TABLE c (id INT);";
    const parts = splitSqlStatements(sql);
    expect(parts).toHaveLength(2);
    expect(parts[0]).toBe("INSERT INTO t (a) VALUES ('it''s; fine')");
  });

  it('keeps a comment line with `;` inside a multi-line statement attached', () => {
    const sql = [
      'CREATE TABLE t (',
      '  -- Only PUBLISHED exams can be used as sources; sources are ordered.',
      '  id INT',
      ');',
    ].join('\n');
    expect(splitSqlStatements(sql)).toHaveLength(1);
    expect(splitSqlStatements(sql)[0]).toContain('ordered.');
  });

  it('preserves a BEGIN...END trigger body with internal `;` as one statement', () => {
    const sql = [
      'CREATE TRIGGER trg_before_insert',
      'BEFORE INSERT ON t',
      'FOR EACH ROW',
      'BEGIN',
      "  IF NEW.x > 0 THEN SET NEW.y = 'a;b'; END IF;",
      '  SET NEW.z = NOW();',
      'END;',
      'SELECT 1;',
    ].join('\n');
    const parts = splitSqlStatements(sql);
    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatch(/^CREATE TRIGGER trg_before_insert[\s\S]*NOW\(\);[\s\S]*END$/);
    expect(parts[1]).toBe('SELECT 1');
  });

  it('handles nested BEGIN...END and END CASE inside a procedure', () => {
    const sql = [
      'CREATE PROCEDURE p()',
      'BEGIN',
      '  BEGIN SET @x = 1; END;',
      '  CASE WHEN @x THEN SET @y = 1; ELSE SET @y = 2; END CASE;',
      'END;',
    ].join('\n');
    expect(splitSqlStatements(sql)).toHaveLength(1);
  });
});

describe('Migrations AC5 - Real MySQL Integration', () => {
  let isDbAvailable = false;

  async function resetMigrationDatabase(): Promise<void> {
    const databaseName = process.env.DB_NAME || '';
    if (!/_test$/i.test(databaseName)) {
      throw new Error(`Refusing destructive migration reset outside a *_test database: ${databaseName}`);
    }

    const [tables] = await pool.query<RowDataPacket[]>(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'`
    );
    await pool.query('SET FOREIGN_KEY_CHECKS = 0');
    try {
      for (const row of tables) {
        const tableName = String(row.TABLE_NAME);
        await pool.query(`DROP TABLE IF EXISTS \`${tableName.replace(/`/g, '``')}\``);
      }
    } finally {
      await pool.query('SET FOREIGN_KEY_CHECKS = 1');
    }
  }

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

    // A failed migration can leave tables behind before schema_migrations is
    // recorded. Reset every table in the disposable *_test database so a
    // rerun is deterministic and cannot silently skip a partial schema.
    await resetMigrationDatabase();

    // 1. Up
    await runMigrations('up');

    const [tables] = await pool.query<RowDataPacket[]>('SHOW TABLES');
    const tableNames = (tables as RowDataPacket[]).map((r) => Object.values(r)[0]);

    for (const expected of EXPECTED_TABLES) {
      expect(tableNames).toContain(expected);
    }

    // R2-SEC-FIX: assert the recorded count equals the number of migration files
    // the runner itself discovers (001 + 002_media_columns) — not a hardcoded 1.
    const upFiles = listMigrationFiles('up');
    const [applied] = await pool.query<RowDataPacket[]>('SELECT name FROM schema_migrations');
    expect(applied).toHaveLength(upFiles.length);
    expect(applied.map((r) => r.name)).toEqual(upFiles);

    // INJ004C-A3: every CREATE TRIGGER statement survived the `;`-in-comment fix
    // (003/004/005/006 each carry two append-only triggers).
    const [triggers] = await pool.query<RowDataPacket[]>(
      `SELECT TRIGGER_NAME FROM INFORMATION_SCHEMA.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE()`
    );
    const triggerNames = (triggers as RowDataPacket[]).map((r) => r.TRIGGER_NAME);
    expect(triggerNames).toEqual(
      expect.arrayContaining([
        'trg_exam_audit_log_before_update',
        'trg_exam_audit_log_before_delete',
        'trg_result_audit_log_before_update',
        'trg_result_audit_log_before_delete',
        'trg_mixed_exam_audit_log_before_update',
        'trg_mixed_exam_audit_log_before_delete',
        'trg_import_audit_log_before_update',
        'trg_import_audit_log_before_delete',
      ])
    );

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

    // Verify append-only triggers exist and block UPDATE/DELETE on exam_audit_log
    await pool.query('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)', [
      'trigger-test@example.com',
      'hash',
      'Trigger Test',
    ]);
    const [userRows] = await pool.query<RowDataPacket[]>('SELECT id FROM users WHERE email = ?', [
      'trigger-test@example.com',
    ]);
    const userId = userRows[0].id;

    await pool.query(
      'INSERT INTO toeic_exam_collections (title, slug) VALUES (?, ?)',
      ['Trigger Test Collection', 'trigger-test-collection']
    );
    const [collRows] = await pool.query<RowDataPacket[]>('SELECT id FROM toeic_exam_collections WHERE slug = ?', [
      'trigger-test-collection',
    ]);
    const collId = collRows[0].id;

    await pool.query(
      'INSERT INTO toeic_exams (collection_id, slug, title, duration_minutes, question_count, skill_type) VALUES (?, ?, ?, ?, ?, ?)',
      [collId, 'trigger-test-exam', 'Trigger Test Exam', 60, 10, 'LR']
    );
    const [examRows] = await pool.query<RowDataPacket[]>('SELECT id FROM toeic_exams WHERE slug = ?', [
      'trigger-test-exam',
    ]);
    const examId = examRows[0].id;

    await pool.query(
      'INSERT INTO exam_audit_log (exam_id, action, actor_user_id, details) VALUES (?, ?, ?, ?)',
      [examId, 'PUBLISH', userId, '{}']
    );

    await expect(
      pool.query('UPDATE exam_audit_log SET action = ? WHERE exam_id = ?', ['ARCHIVE', examId])
    ).rejects.toThrow();

    await expect(
      pool.query('DELETE FROM exam_audit_log WHERE exam_id = ?', [examId])
    ).rejects.toThrow();

    // Re-running up must be idempotent (skips applied migrations)
    await runMigrations('up');
    const [appliedAgain] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) AS count FROM schema_migrations');
    expect(Number(appliedAgain[0].count)).toBe(upFiles.length);

    // 2. Down
    await runMigrations('down');

    const [tablesAfter] = await pool.query<RowDataPacket[]>('SHOW TABLES');
    const tableNamesAfter = (tablesAfter as RowDataPacket[]).map((r) => Object.values(r)[0]);
    for (const expected of EXPECTED_TABLES) {
      expect(tableNamesAfter).not.toContain(expected);
    }
  }, 60000);
});
