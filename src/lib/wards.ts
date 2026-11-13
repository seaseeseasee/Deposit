import { pool } from './db.ts';
import type { AuthUser } from './auth.ts';

export type WardRow = { id: number; name: string };

/** Wards the user may see: every active ward for admins, otherwise the assigned active wards. */
export async function allowedWards(user: AuthUser): Promise<WardRow[]> {
  const r = await pool.query(
    `SELECT id, name FROM wards WHERE is_active AND ($1::bigint[] IS NULL OR id = ANY($1::bigint[])) ORDER BY name`,
    [user.role === 'admin' ? null : user.wardIds]);
  return r.rows.map((x) => ({ id: Number(x.id), name: x.name }));
}

/** Applies an optional ward filter from the query string, never widening beyond what is allowed. */
export function pickWardIds(allowed: WardRow[], requested?: string): number[] {
  const id = Number(requested);
  if (requested && allowed.some((w) => w.id === id)) return [id];
  return allowed.map((w) => w.id);
}
