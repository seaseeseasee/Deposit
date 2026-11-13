import Link from 'next/link';
import { expensesEnabled } from '@/lib/features.ts';
import { requireUser } from '@/lib/auth.ts';
import { withTx } from '@/lib/db.ts';
import { baht } from '@/lib/format.ts';
import { allowedWards, pickWardIds } from '@/lib/wards.ts';

export const dynamic = 'force-dynamic';

export default async function Patients({ searchParams }: { searchParams: Promise<{ q?: string; ward?: string; all?: string }> }) {
  const user = await requireUser();
  const ex = expensesEnabled();
  const { q = '', ward, all } = await searchParams;
  const wards = await allowedWards(user);
  const wardIds = pickWardIds(wards, ward);

  const rows = await withTx(user.scope, async (c) =>
    (await c.query(
      `SELECT a.id, p.full_name, p.hn, a.bed_no, a.status, w.name AS ward_name,
              b.total_deposited, b.total_spent, b.total_deducted, b.balance
         FROM patient_admissions a
         JOIN patients p ON p.id = a.patient_id JOIN wards w ON w.id = a.ward_id
         JOIN v_admission_balance b ON b.admission_id = a.id
        WHERE a.ward_id = ANY($1)
          AND ($2 = '' OR p.full_name ILIKE '%' || $2 || '%' OR p.hn ILIKE '%' || $2 || '%')
          AND ($3 = '1' OR a.status = 'active')
        ORDER BY a.status, p.full_name LIMIT 300`, [wardIds, q, all ?? ''])).rows);

  return (
    <main className="staff">
      <h1 className="h">บัญชีเงินฝากผู้ป่วย</h1>
      <form className="filters" method="get">
        <input name="q" defaultValue={q} placeholder="ค้นหาชื่อ / HN" aria-label="ค้นหา" />
        <select name="ward" defaultValue={ward ?? ''} aria-label="หอผู้ป่วย">
          <option value="">ทุกหอที่มีสิทธิ์</option>
          {wards.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <label className="chk" style={{ alignItems: 'center' }}><input type="checkbox" name="all" value="1" defaultChecked={all === '1'} /> รวมที่จำหน่ายแล้ว</label>
        <button className="sm" type="submit">ค้นหา</button>
      </form>
      <div className="tw"><table>
        <thead><tr><th>ผู้ป่วย</th><th>HN</th><th>หอ / เตียง</th><th>สถานะ</th><th className="n">ฝากสะสม</th>{ex && <th className="n">ใช้ไป</th>}{ex && <th className="n">ถูกหัก</th>}<th className="n">คงเหลือ</th><th /></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.full_name}</td><td>{r.hn ?? '-'}</td><td>{r.ward_name}{r.bed_no ? ` / ${r.bed_no}` : ''}</td>
              <td>{r.status === 'active' ? 'Admit' : r.status === 'discharged' ? 'จำหน่ายแล้ว' : 'ย้ายหอ'}</td>
              <td className="n">{baht(r.total_deposited)}</td>{ex && <td className="n">{baht(r.total_spent)}</td>}
              {ex && <td className="n">{baht(r.total_deducted)}</td>}<td className="n"><b>{baht(r.balance)}</b></td>
              <td><Link className="lnk" href={`/staff/patients/${r.id}`}>เปิดบัญชี</Link></td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={ex ? 9 : 7} className="muted">ไม่พบผู้ป่วย</td></tr>}
        </tbody>
      </table></div>
    </main>
  );
}
