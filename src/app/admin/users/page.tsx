import { pool } from '@/lib/db.ts';
import { dateTime } from '@/lib/format.ts';

export const dynamic = 'force-dynamic';
const ROLE = { admin: 'ผู้ดูแลระบบ', manager: 'หัวหน้าหอ', staff: 'เจ้าหน้าที่' } as const;

export default async function Users({ searchParams }: { searchParams: Promise<{ error?: string; done?: string }> }) {
  const { error, done } = await searchParams;
  const wards = (await pool.query(`SELECT id, code, name FROM wards WHERE is_active ORDER BY code`)).rows;
  const users = (await pool.query(
    `SELECT u.id, u.username, u.full_name, u.role, u.is_active, u.last_login_at,
            COALESCE(array_agg(p.ward_id) FILTER (WHERE p.ward_id IS NOT NULL), '{}') AS ward_ids
       FROM users u LEFT JOIN user_ward_permissions p ON p.user_id = u.id GROUP BY u.id ORDER BY u.role, u.username`)).rows;

  return (
    <main className="staff">
      <h1 className="h">ผู้ใช้และสิทธิ์รายหอ</h1>
      {error && <div className="error banner" role="alert">{error}</div>}
      {done && <div className="okmsg banner" role="status">{done}</div>}

      {users.map((u) => {
        const ids = (u.ward_ids as string[]).map(Number);
        return (
          <article className="card stack" key={u.id}>
            <div className="inline">
              <b>{u.full_name}</b><span className="muted">@{u.username}</span><span className="pill">{ROLE[u.role as keyof typeof ROLE]}</span>
              <span className={`st ${u.is_active ? 'v' : 'r'}`}>{u.is_active ? 'ใช้งานอยู่' : 'ปิดใช้งาน'}</span>
              <span className="muted">เข้าล่าสุด {u.last_login_at ? dateTime(u.last_login_at) : '-'}</span>
            </div>
            <div className="inline">
              <form action="/api/admin/user-active" method="post" className="inline">
                <input type="hidden" name="id" value={u.id} /><input type="hidden" name="active" value={u.is_active ? '0' : '1'} />
                <button className={`sm ${u.is_active ? 'bad' : 'ok'}`} type="submit">{u.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}</button>
              </form>
              <form action="/api/admin/user-password" method="post" className="inline">
                <input type="hidden" name="id" value={u.id} />
                <input type="password" name="password" placeholder="รหัสผ่านใหม่ (≥ 8 ตัว)" minLength={8} required aria-label={`รหัสผ่านใหม่ของ ${u.username}`} autoComplete="new-password" />
                <button className="sm ghost" type="submit">รีเซ็ตรหัสผ่าน</button>
              </form>
            </div>
            {u.role === 'admin' ? <p className="muted">ผู้ดูแลระบบเห็นทุกหอ (ดูการเงินได้อย่างเดียว)</p> : (
              <form action="/api/admin/user-wards" method="post" className="inline">
                <input type="hidden" name="id" value={u.id} />
                {wards.map((w) => (
                  <label className="chk" key={w.id} style={{ alignItems: 'center' }}><input type="checkbox" name="wards" value={w.id} defaultChecked={ids.includes(Number(w.id))} /> {w.code} {w.name}</label>
                ))}
                <button className="sm" type="submit">บันทึกสิทธิ์หอ</button>
              </form>
            )}
          </article>
        );
      })}

      <details className="card" open={!!error}>
        <summary><b>+ เพิ่มผู้ใช้</b></summary>
        <form action="/api/admin/user-create" method="post" className="stack" style={{ marginTop: 10 }}>
          <div className="formgrid">
            <div className="field"><label htmlFor="username">ชื่อผู้ใช้</label><input id="username" name="username" required autoComplete="off" /></div>
            <div className="field"><label htmlFor="fullName">ชื่อ-นามสกุล</label><input id="fullName" name="fullName" required /></div>
            <div className="field"><label htmlFor="password">รหัสผ่านเริ่มต้น (≥ 8 ตัว)</label><input id="password" name="password" type="password" minLength={8} required autoComplete="new-password" /></div>
            <div className="field"><label htmlFor="role">บทบาท</label>
              <select id="role" name="role" defaultValue="staff"><option value="staff">เจ้าหน้าที่</option><option value="manager">หัวหน้าหอ</option><option value="admin">ผู้ดูแลระบบ</option></select></div>
          </div>
          <fieldset className="newp"><legend>หอที่เข้าถึงได้ (ไม่ใช้กับผู้ดูแลระบบ)</legend>
            {wards.map((w) => <label className="chk" key={w.id}><input type="checkbox" name="wards" value={w.id} /> {w.code} {w.name}</label>)}
          </fieldset>
          <button className="sm" type="submit">สร้างผู้ใช้</button>
        </form>
      </details>
    </main>
  );
}
