import fs from 'fs';
import path from 'path';
import { pool } from '../services/db.service';

export async function runMigrations(direction: 'up' | 'down' = 'up') {
  console.log(`Running migrations: ${direction}`);
  const file = direction === 'up' ? '001_schema.up.sql' : '001_schema.down.sql';
  const filePath = path.join(__dirname, file);
  
  const sql = fs.readFileSync(filePath, 'utf8');
  
  // Split statements by semicolon and filter empty
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);
    
  for (const statement of statements) {
    try {
      await pool.query(statement);
      console.log('Executed:', statement.substring(0, 50) + '...');
    } catch (err: any) {
      console.error('Migration error on statement:', statement);
      console.error(err);
      throw err;
    }
  }
  console.log('Migrations completed successfully.');
  process.exit(0);
}

if (require.main === module) {
  const direction = process.argv[2] === 'down' ? 'down' : 'up';
  runMigrations(direction).catch(() => process.exit(1));
}
