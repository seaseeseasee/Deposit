// Usage: DATABASE_URL=postgres://ward_owner:...@localhost:5440/ward_deposit \
//        node scripts/create-user.ts <username> <password> "<full name>" <staff|manager|admin> [wardCode ...]
import pg from 'pg';
import { hashPassword } from '../src/lib/password.ts';

const [username, password, fullName, role, ...wards] = process.argv.slice(2);
if (!username || !password || !fullName || !['staff', 'manager', 'admin'].includes(role)) {
  console.error('usage: create-user.ts <username> <password> "<full name>" <staff|manager|admin> [wardCode ...]');
  process.exit(1);
}
if (password.length < 8) { console.error('password must be at least 8 characters'); process.exit(1); }

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
try {
  await c.query('BEGIN');
  await c.query(`SELECT set_config('app.is_admin','1',true)`);
  const u = await c.query(
    `INSERT INTO users (username, password_hash, full_name, role) VALUES ($1,$2,$3,$4) RETURNING id`,
    [username, await hashPassword(password), fullName, role]);
  for (const code of wards) {
    const w = await c.query(`SELECT id FROM wards WHERE code = $1`, [code]);
    if (!w.rows[0]) throw new Error(`ward ${code} not found`);
    await c.query(`INSERT INTO user_ward_permissions (user_id, ward_id, role_in_ward) VALUES ($1,$2,$3)`,
      [u.rows[0].id, w.rows[0].id, role === 'manager' ? 'manager' : 'staff']);
  }
  await c.query('COMMIT');
  console.log(`created ${role} ${username}`);
} catch (e) {
  await c.query('ROLLBACK');
  throw e;
} finally {
  await c.end();
}
