import { Pool, type PoolClient } from 'pg';

const globalForPg = globalThis as unknown as { pgPool?: Pool };
export const pool = (globalForPg.pgPool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 10 }));

export type Scope = { isAdmin: true } | { wardIds: number[] };

/** Runs fn in a transaction with the Row-Level Security scope set for that transaction only. */
export async function withTx<T>(scope: Scope, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    if ('isAdmin' in scope) await c.query(`SELECT set_config('app.is_admin','1',true)`);
    else await c.query(`SELECT set_config('app.ward_ids',$1,true)`, [scope.wardIds.join(',')]);
    const out = await fn(c);
    await c.query('COMMIT');
    return out;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
