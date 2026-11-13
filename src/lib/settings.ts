import { pool } from './db.ts';

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const r = await pool.query(`SELECT value_json FROM system_settings WHERE key = $1`, [key]);
  return r.rows[0] ? (r.rows[0].value_json as T) : fallback;
}
