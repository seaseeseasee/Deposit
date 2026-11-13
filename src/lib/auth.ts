import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { pool, withTx, type Scope } from './db.ts';
import { hashPassword, verifyPassword } from './password.ts';

const COOKIE = 'sid';
const TTL_MS = 8 * 3600_000;
const tokenHash = (t: string) => createHash('sha256').update(t).digest('hex');

export type AuthUser = {
  id: number; username: string; fullName: string; role: 'staff' | 'manager' | 'admin';
  scope: Scope; wardIds: number[];
};

// Login throttling per username (single instance). Use a shared store when scaled out.
const fails = new Map<string, number[]>();
const locked = (u: string) => (fails.get(u) ?? []).filter((t) => Date.now() - t < 15 * 60_000).length >= 5;
const noteFail = (u: string) =>
  fails.set(u, [...(fails.get(u) ?? []).filter((t) => Date.now() - t < 15 * 60_000), Date.now()]);

let dummyHash: Promise<string> | undefined;

export async function login(username: string, password: string): Promise<'ok' | 'invalid' | 'locked'> {
  const jar = await cookies(); // grab the request-scoped store before any DB awaits
  const key = username.trim().toLowerCase();
  if (locked(key)) return 'locked';
  const r = await pool.query(`SELECT id, password_hash, is_active FROM users WHERE username = $1`, [username.trim()]);
  const u = r.rows[0];
  // Always run one hash comparison so unknown users and wrong passwords take similar time.
  const ok = await verifyPassword(password, u?.password_hash ?? (await (dummyHash ??= hashPassword('x'))));
  if (!u || !u.is_active || !ok) {
    noteFail(key);
    return 'invalid';
  }
  fails.delete(key);
  const token = randomBytes(32).toString('base64url');
  await pool.query(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1,$2,$3)`,
    [tokenHash(token), u.id, new Date(Date.now() + TTL_MS)]);
  await pool.query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [u.id]);
  await withTx({ isAdmin: true }, (c) =>
    c.query(`INSERT INTO audit_logs (user_id, action, entity_type, entity_id) VALUES ($1,'auth.login','user',$1)`, [u.id]));
  jar.set(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', path: '/', maxAge: TTL_MS / 1000,
    secure: process.env.COOKIE_SECURE !== 'false',
  });
  return 'ok';
}

export async function logout() {
  const jar = await cookies();
  const t = jar.get(COOKIE)?.value;
  if (t) await pool.query(`DELETE FROM sessions WHERE token_hash = $1`, [tokenHash(t)]);
  jar.delete(COOKIE);
}

export async function getUser(): Promise<AuthUser | null> {
  const t = (await cookies()).get(COOKIE)?.value;
  if (!t) return null;
  const r = await pool.query(
    `SELECT u.id, u.username, u.full_name, u.role
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now() AND u.is_active`, [tokenHash(t)]);
  const u = r.rows[0];
  if (!u) return null;
  let wardIds: number[] = [];
  if (u.role !== 'admin') {
    const w = await pool.query(
      `SELECT p.ward_id FROM user_ward_permissions p JOIN wards w ON w.id = p.ward_id AND w.is_active
        WHERE p.user_id = $1`, [u.id]);
    wardIds = w.rows.map((x) => Number(x.ward_id));
  }
  return {
    id: Number(u.id), username: u.username, fullName: u.full_name, role: u.role, wardIds,
    scope: u.role === 'admin' ? { isAdmin: true } : { wardIds },
  };
}

export async function requireUser(): Promise<AuthUser> {
  const u = await getUser();
  if (!u) redirect('/login');
  return u;
}

/** Staff and ward managers may verify money; admins have read-only access to the queue. */
export async function requireStaff(): Promise<AuthUser> {
  const u = await requireUser();
  if (u.role === 'admin') redirect('/staff');
  return u;
}
