import Link from 'next/link';
import { requireUser } from '@/lib/auth.ts';
import { withTx } from '@/lib/db.ts';
import { baht, dateTime } from '@/lib/format.ts';
import { reportParams } from '@/lib/report-params.ts';
import { allowedWards } from '@/lib/wards.ts';

export const dynamic = 'force-dynamic';
const DAY = `(t.occurred_at AT TIME ZONE 'Asia/Bangkok')::date`;

export default async function Confirmed({ searchParams }: { searchParams: Promise<{ ward?: string; from?: string; to?: string; q?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = (sp.q ?? '').slice(0, 60);
  const wards = await allowedWards(user);
  const p = reportParams(sp, wards);

  const { rows, byWard } = await withTx(user.scope, async (c) => {
    const where = `t.ward_id = ANY($1) AND t.type = 'deposit' AND ${DAY} BETWEEN $2 AND $3
        AND ($4 = '' OR p.full_name ILIKE '%' || $4 || '%' OR s.ref_no ILIKE '%' || $4 || '%' OR s.payer_name ILIKE '%' || $4 || '%')`;
    const from = `FROM financial_transactions t
         JOIN patient_admissions a ON a.id = t.admission_id JOIN patients p ON p.id = a.patient_id
         JOIN wards w ON w.id = t.ward_id LEFT JOIN deposit_submissions s ON s.id = t.source_submission_id
         LEFT JOIN users u ON u.id = s.reviewed_by`;
    const args = [p.wardIds, p.from, p.to, q];
    return {
      rows: (await c.query(
        `SELECT t.occurred_at, t.txn_no, t.admission_id, s.ref_no, s.payer_name, w.name AS ward, p.full_name, p.hn,
                t.amount, u.full_name AS verifier ${from} WHERE ${where} ORDER BY t.occurred_at DESC, t.id DESC LIMIT 500`, args)).rows,
      byWard: (await c.query(
        `SELECT w.name AS ward, COUNT(*) AS n, SUM(t.amount) AS total ${from} WHERE ${where} GROUP BY w.name ORDER BY w.name`, args)).rows,
    };
  });
  const grand = byWard.reduce((a, r) => a + Number(r.total), 0);
  const count = byWard.reduce((a, r) => a + Number(r.n), 0);

  return (
    <main className="staff">
      <h1 className="h">ยอดเงินที่ยืนยันแล้ว</h1>
      <form className="filters" method="get">
        <input name="q" defaultValue={q} placeholder="ค้นหาชื่อผู้ป่วย / ผู้โอน / เลขอ้างอิง" aria-label="ค้นหา" />
        <select name="ward" defaultValue={sp.ward ?? ''} aria-label="ตึก/หอผู้ป่วย">
          <option value="">ทุกตึกที่มีสิทธิ์</option>
          {wards.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <input type="date" name="from" defaultValue={p.from} aria-label="ตั้งแต่วันที่" />
        <input type="date" name="to" defaultValue={p.to} aria-label="ถึงวันที่" />
        <button className="sm" type="submit">แสดง</button>
      </form>

      <section className="cards" aria-label="สรุปตามตึก">
        <div className="card"><div className="k">ยอดที่ยืนยันแล้วรวม ({count} รายการ)</div><div className="v in">{baht(grand)}</div></div>
        {byWard.map((w) => (
          <div className="card" key={w.ward}><div className="k">{w.ward} · {w.n} รายการ</div><div className="v">{baht(w.total)}</div></div>
        ))}
      </section>

      <div className="tw"><table>
        <thead><tr><th>ยืนยันเมื่อ</th><th>ตึก/หอ</th><th>ผู้ป่วย</th><th>ผู้โอน</th><th>เลขอ้างอิง</th><th className="n">จำนวนเงิน</th><th>ผู้ยืนยัน</th><th /></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.txn_no}>
              <td>{dateTime(r.occurred_at)}</td><td>{r.ward}</td><td>{r.full_name}{r.hn ? ` · HN ${r.hn}` : ''}</td>
              <td>{r.payer_name ?? '-'}</td><td>{r.ref_no ?? r.txn_no}</td>
              <td className="n in"><b>{baht(r.amount)}</b></td><td>{r.verifier ?? '-'}</td>
              <td><Link className="lnk" href={`/staff/patients/${r.admission_id}`}>บัญชีผู้ป่วย</Link></td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={8} className="muted">ยังไม่มียอดที่ยืนยันในช่วงที่เลือก</td></tr>}
        </tbody>
      </table></div>
      <p className="muted">แสดงเฉพาะสลิปที่เจ้าหน้าที่กดยืนยันแล้ว (ไม่นับสลิปที่ยังรอตรวจ) · ส่งออก Excel/PDF ได้ที่เมนูรายงาน &gt; เงินฝากรายบุคคล</p>
    </main>
  );
}
