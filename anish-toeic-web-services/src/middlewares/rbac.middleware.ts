import { Request, Response, NextFunction } from 'express';
import { pool } from '../services/db.service';
import { RowDataPacket } from 'mysql2';

// DB-authoritative ADMIN RBAC: checks the admin_users table after
// requireAuth has already populated req.user. Returns 401 when
// no user is attached (missing token) and 403 when the user is
// not a DB admin.
export const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT id FROM admin_users WHERE user_id = ? LIMIT 1',
    [userId]
  );

  if (!rows.length) {
    return res.status(403).json({ error: 'Forbidden: Admin access required' });
  }

  next();
};
