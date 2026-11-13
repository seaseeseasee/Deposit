import { withTx } from '@/lib/db.ts';
import { pool } from '@/lib/db.ts';
import { dateTime } from '@/lib/format.ts';
import { requireUser } from '@/lib/auth.ts';

export const dynamic = 'force-dynamic';

export default async function Audit({ searchParams }: { searchParams: Promise<{ ward?: string; action?: string; user?: string; from?: string; to?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const wards = (await pool.query(`SELECT id, name FROM wards ORDER BY name`)).rows;
  const ok = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '');
  const rows = await withTx(user.scope, async (c) =>
    (await c.query(
      `SELECT l.id, l.created_at, l.action, l.entity_type, l.entity_id, l.before_json, l.after_json, l.ip,
              u.full_name AS who, w.name AS ward
         FROM audit_logs l LEFT JOIN users u ON u.id = l.user_id LEFT JOIN wards w ON w.id = l.ward_id
        WHERE ($1 = '' OR l.ward_id = $1::bigint)
          AND ($2 = '' OR l.action ILIKE $2 || '%')
          AND ($3 = '' OR u.username ILIKE '%' || $3 || '%' OR u.full_name ILIKE '%' || $3 || '%')
          AND ($4 = '' OR (l.created_at AT TIME ZONE 'Asia/Bangkok')::date >= $4::date)
          AND ($5 = '' OR (l.created_at AT TIME ZONE 'Asia/Bangkok')::date <= $5::date)
        ORDER BY l.id DESC LIMIT 200`,
      [/^\d+$/.test(sp.ward ?? '') ? sp.ward : '', (sp.action ?? '').slice(0, 40), (sp.user ?? '').slice(0, 40), ok(sp.from), ok(sp.to)])).rows);

  const show = (j: unknown) => (j ? <pre className="json">{JSON.stringify(j)}</pre> : '');
  return (
    <main className="staff">
      <h1 className="h">Audit log</h1>
      <form className="filters" method="get">
        <input name="action" defaultValue={sp.action ?? ''} placeholder="การกระทำ เช่น submission, admin, report" aria-label="การกระทำ" />
        <input name="user" defaultValue={sp.user ?? ''} placeholder="ผู้ดำเนินการ" aria-label="ผู้ดำเนินการ" />
        <select name="ward" defaultValue={sp.ward ?? ''} aria-label="หอ"><option value="">ทุกหอ</option>{wards.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
        <input type="date" name="from" defaultValue={sp.from ?? ''} aria-label="ตั้งแต่" /><input type="date" name="to" defaultValue={sp.to ?? ''} aria-label="ถึง" />
        <button className="sm" type="submit">ค้นหา</button>
      </form>
      <p className="muted">แสดงล่าสุด {rows.length} รายการ · Audit log เพิ่มได้อย่างเดียว แก้ไขหรือลบไม่ได้</p>
      <div className="tw"><table>
        <thead><tr><th>เวลา</th><th>ผู้ดำเนินการ</th><th>หอ</th><th>การกระทำ</th><th>รายการ</th><th>ก่อน</th><th>หลัง</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.id} style={{ verticalAlign: 'top' }}>
            <td>{dateTime(r.created_at)}</td><td>{r.who ?? 'ญาติ/ระบบ'}</td><td>{r.ward ?? '-'}</td><td>{r.action}</td>
            <td>{r.entity_type}{r.entity_id ? ` #${r.entity_id}` : ''}</td>
            <td style={{ whiteSpace: 'normal' }}>{show(r.before_json)}</td><td style={{ whiteSpace: 'normal' }}>{show(r.after_json)}</td>
          </tr>
        ))}</tbody>
      </table></div>
    </main>
  );
}
