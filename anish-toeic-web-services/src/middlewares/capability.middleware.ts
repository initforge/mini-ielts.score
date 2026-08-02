import { Request, Response, NextFunction } from 'express';
import { pool } from '../services/db.service';
import { RowDataPacket } from 'mysql2';
import { CAPABILITIES, type Capability } from '../services/admin-capability.service';

// DB-authoritative capability check: verifies user has the required role/capability.
// Must be used after requireAuth and requireAdmin middleware.
export function requireCapability(capability: Capability) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check specific role capability.
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT ar.name
       FROM admin_user_roles aur
       JOIN admin_roles ar ON aur.role_id = ar.id
       WHERE aur.user_id = ? AND ar.name = ?
       LIMIT 1`,
      [userId, capability]
    );

    if (!rows.length) {
      return res.status(403).json({ error: `Missing required capability: ${capability}` });
    }

    next();
  };
}

// Pre-built middleware instances for common capabilities.
export const requireExamEditor = requireCapability(CAPABILITIES.EXAM_EDITOR);
export const requireResultManager = requireCapability(CAPABILITIES.RESULT_MANAGER);
export const requireAuditor = requireCapability(CAPABILITIES.AUDITOR);
