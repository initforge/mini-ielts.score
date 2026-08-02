import mysql from 'mysql2/promise';

export const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'anish_toeic',
  // Time convention: every TIMESTAMP/DATETIME is stored and served as UTC.
  // MySQL server session time_zone = UTC; `timezone: 'Z'` makes mysql2 parse
  // incoming date strings as UTC and serialize JS Date params as UTC wall-clock,
  // so API dates are the correct instant (no ±7h offset for host TZ=Asia/Ho_Chi_Minh).
  timezone: 'Z',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});
