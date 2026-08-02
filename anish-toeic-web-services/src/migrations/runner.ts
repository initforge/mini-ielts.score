import fs from 'fs';
import path from 'path';
import { pool } from '../services/db.service';
import { RowDataPacket } from 'mysql2';

const MIGRATIONS_DIR = __dirname;
const SCHEMA_TABLE = 'schema_migrations';

async function ensureSchemaTable(): Promise<void> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS ${SCHEMA_TABLE} (
      name VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
}

/** R2-SEC-FIX: exported so tests can assert the recorded count against the same file discovery the runner uses. */
export function listMigrationFiles(direction: 'up' | 'down'): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d+.*\.(up|down)\.sql$/.test(f) && f.endsWith(`.${direction}.sql`))
    .sort();
}

/**
 * INJ004-A3-FIX: split SQL on top-level `;` only.
 * Naive `;` split broke statements whose comments contained `;`
 * (e.g. 005/006 `-- ... sources; sources are ...`) and would split
 * trigger bodies. Parser skips --/# line comments, block comments
 * (slash-star-star-slash), and '...'/`...`/"..." literals, and defers `;` inside BEGIN...END
 * compound bodies (triggers, procedures, functions) until the matching
 * END; — MySQL control-flow closers (END IF/CASE/LOOP/WHILE/REPEAT) carry
 * a trailing keyword, so only the bare block-closing `END` is counted.
 * ponytail: full grammar (DELIMITER, DO blocks) not needed by repo SQL;
 * add a real parser if stored procedures with DELIMITER appear.
 */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let depth = 0; // BEGIN...END nesting
  let i = 0;
  const n = sql.length;

  const isWordChar = (c: string | undefined): boolean => c !== undefined && /[\w$]/.test(c);
  const isWord = (word: string, pos: number): boolean =>
    sql.startsWith(word, pos) &&
    !isWordChar(sql[pos - 1]) &&
    !isWordChar(sql[pos + word.length]);

  while (i < n) {
    const c = sql[i];
    const next = sql[i + 1];

    if (c === '-' && next === '-') {
      while (i < n && sql[i] !== '\n') {
        current += sql[i];
        i++;
      }
      continue;
    }
    if (c === '#') {
      while (i < n && sql[i] !== '\n') {
        current += sql[i];
        i++;
      }
      continue;
    }
    if (c === '/' && next === '*') {
      current += c + next;
      i += 2;
      while (i < n && !(sql[i] === '*' && sql[i + 1] === '/')) {
        current += sql[i];
        i++;
      }
      if (i < n) {
        current += '*/';
        i += 2;
      }
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const quote = c;
      current += c;
      i++;
      while (i < n) {
        current += sql[i];
        if (sql[i] === quote && sql[i + 1] === quote) {
          current += sql[i + 1];
          i += 2;
          continue;
        }
        if (sql[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    if (c === ';' && depth === 0) {
      const stmt = current.trim();
      if (stmt.length > 0) statements.push(stmt);
      current = '';
      i++;
      continue;
    }
    if (isWord('BEGIN', i)) {
      depth++;
      current += 'BEGIN';
      i += 5;
      continue;
    }
    if (isWord('END', i)) {
      let j = i + 3;
      while (j < n && /\s/.test(sql[j])) j++;
      if (sql[j] === ';') {
        depth = Math.max(0, depth - 1);
      }
      current += 'END';
      i += 3;
      continue;
    }
    current += c;
    i++;
  }

  const tail = current.trim();
  if (tail.length > 0) statements.push(tail);
  return statements;
}

async function isApplied(file: string): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>('SELECT name FROM schema_migrations WHERE name = ? LIMIT 1', [file]);
  return rows.length > 0;
}

export async function runMigrations(direction: 'up' | 'down' = 'up'): Promise<void> {
  console.log(`Running migrations: ${direction}`);
  await ensureSchemaTable();

  const files = listMigrationFiles(direction);
  if (direction === 'down') files.reverse();

  for (const file of files) {
    if (direction === 'up' && (await isApplied(file))) {
      console.log('Skipping already-applied migration:', file);
      continue;
    }

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const statements = splitSqlStatements(sql);

    for (const statement of statements) {
      try {
        await pool.query(statement);
      } catch (err: unknown) {
        console.error('Migration error on statement:', statement.substring(0, 120));
        console.error(err);
        throw err;
      }
    }

    if (direction === 'up') {
      await pool.query('INSERT INTO schema_migrations (name) VALUES (?)', [file]);
    } else {
      await pool.query('DELETE FROM schema_migrations WHERE name = ?', [file]);
    }
    console.log(`${direction === 'up' ? 'Applied' : 'Reverted'}:`, file);
  }

  if (direction === 'down') {
    // Full rollback leaves no trace of the runner itself.
    await pool.query(`DROP TABLE IF EXISTS ${SCHEMA_TABLE}`);
  }

  console.log('Migrations completed successfully.');
}

if (require.main === module) {
  const direction = process.argv[2] === 'down' ? 'down' : 'up';
  runMigrations(direction)
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
