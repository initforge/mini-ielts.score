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

function listMigrationFiles(direction: 'up' | 'down'): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d+.*\.(up|down)\.sql$/.test(f) && f.endsWith(`.${direction}.sql`))
    .sort();
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
    const statements = sql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

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
