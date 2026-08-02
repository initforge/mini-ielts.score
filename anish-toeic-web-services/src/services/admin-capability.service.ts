import { pool } from './db.service';
import { RowDataPacket } from 'mysql2';
import { forbidden } from '../errors/http.error';

// Capability names matching admin_roles table.
export const CAPABILITIES = {
  EXAM_EDITOR: 'EXAM_EDITOR',
  RESULT_MANAGER: 'RESULT_MANAGER',
  AUDITOR: 'AUDITOR',
} as const;

export type Capability = typeof CAPABILITIES[keyof typeof CAPABILITIES];

interface AdminRoleRow extends RowDataPacket {
  role_id: number;
  role_name: string;
}

/** Check if user has a specific capability. Returns true if user has the role. */
export async function hasCapability(userId: string, capability: Capability): Promise<boolean> {
  // ADMIN has all capabilities.
  const [adminRows] = await pool.query<RowDataPacket[]>(
    'SELECT id FROM admin_users WHERE user_id = ? LIMIT 1',
    [userId]
  );
  if (adminRows.length) return true;

  // Check specific role capability.
  const [rows] = await pool.query<AdminRoleRow[]>(
    `SELECT aur.role_id, ar.name as role_name
     FROM admin_user_roles aur
     JOIN admin_roles ar ON aur.role_id = ar.id
     WHERE aur.user_id = ? AND ar.name = ?
     LIMIT 1`,
    [userId, capability]
  );
  return rows.length > 0;
}

/** Require a specific capability or throw 403. */
export async function requireCapability(userId: string, capability: Capability): Promise<void> {
  const allowed = await hasCapability(userId, capability);
  if (!allowed) {
    throw forbidden(`Missing required capability: ${capability}`);
  }
}

/** Get all capabilities for a user. */
export async function getUserCapabilities(userId: string): Promise<string[]> {
  const capabilities: string[] = [];

  const [adminRows] = await pool.query<RowDataPacket[]>(
    'SELECT id FROM admin_users WHERE user_id = ? LIMIT 1',
    [userId]
  );
  if (adminRows.length) {
    capabilities.push('ADMIN');
    return capabilities; // ADMIN has all capabilities
  }

  const [rows] = await pool.query<AdminRoleRow[]>(
    `SELECT ar.name as role_name
     FROM admin_user_roles aur
     JOIN admin_roles ar ON aur.role_id = ar.id
     WHERE aur.user_id = ?`,
    [userId]
  );

  return rows.map(r => r.role_name);
}
