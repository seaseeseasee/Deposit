import Link from 'next/link';
import { requireUser } from '@/lib/auth.ts';
import { withTx } from '@/lib/db.ts';

export const dynamic = 'force-dynamic';

const STATUS: Record<string, [string, string]> = {
  pending: ['รอตรวจ', 'p'], verified: ['ยืนยันแล้ว', 'v'], rejected: ['ปฏิเสธ', 'r'], duplicate: ['อาจซ้ำ', 'd'],
};

type Q = { status?: string; q?: string; from?: string; to?: string };

export default async function Queue({ searchParams }: { searchParams: Promise<Q> }) {
  const user = await requireUser();
  const { status = '', q = '', from = '', to = '' } = await searchParams;

  const rows = await withTx(user.scope, async (c) =>
    (await c.query(
      `SELECT s.id, s.ref_no, s.created_at, s.patient_name_input, s.payer_name, s.amount, s.status,
              w.name AS ward_name, u.full_name AS reviewer, s.reviewed_at
         FROM deposit_submissions s
         JOIN wards w ON w.id = s.ward_id
         LEFT JOIN users u ON u.id = s.reviewed_by
        WHERE ($1 = '' OR s.status::text = $1)
          AND ($2 = '' OR s.ref_no ILIKE '%' || $2 || '%' OR s.patient_name_input ILIKE '%' || $2 || '%')
          AND ($3 = '' OR s.created_at >= $3::date)
          AND ($4 = '' OR s.created_at < ($4::date + 1))
        ORDER BY s.created_at DESC LIMIT 200`, [status, q, from, to])).rows);

  const pending = rows.filter((r) => r.status === 'pending' || r.status === 'duplicate').length;
  const fmt = (d: Date) => new Date(d).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });

  return (
    <main className="staff">
      <h1 className="h">คิวตรวจสลิป</h1>
      <form className="filters" method="get">
        <input name="q" defaultValue={q} placeholder="ค้นหาชื่อผู้ป่วย / เลขอ้างอิง" aria-label="ค้นหา" />
        <select name="status" defaultValue={status} aria-label="สถานะ">
          <option value="">ทุกสถานะ</option><option value="pending">รอตรวจ</option><option value="duplicate">อาจซ้ำ</option>
          <option value="verified">ยืนยันแล้ว</option><option value="rejected">ปฏิเสธ</option>
        </select>
        <input name="from" type="date" defaultValue={from} aria-label="ตั้งแต่วันที่" />
        <input name="to" type="date" defaultValue={to} aria-label="ถึงวันที่" />
        <button className="sm" type="submit">ค้นหา</button>
      </form>
      <p className="muted">แสดง {rows.length} รายการ · รอดำเนินการ {pending}</p>
      <div className="tw">
        <table>
          <thead><tr><th>ส่งเมื่อ</th><th>เลขอ้างอิง</th><th>ตึก/หอ</th><th>ผู้ป่วย</th><th>ผู้โอน</th><th className="n">จำนวนเงิน</th><th>สถานะ</th><th>ผู้ตรวจ</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => {
              const [label, cls] = STATUS[r.status];
              return (
                <tr key={r.id}>
                  <td>{fmt(r.created_at)}</td><td>{r.ref_no}</td><td>{r.ward_name}</td>
                  <td>{r.patient_name_input}</td><td>{r.payer_name}</td>
                  <td className="n">{Number(r.amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                  <td><span className={`st ${cls}`}>{label}</span></td>
                  <td>{r.reviewer ? `${r.reviewer} ${fmt(r.reviewed_at)}` : '-'}</td>
                  <td><Link className="lnk" href={`/staff/submissions/${r.id}`}>{r.status === 'pending' || r.status === 'duplicate' ? 'ตรวจสอบ' : 'ดู'}</Link></td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={9} className="muted">ไม่พบรายการ</td></tr>}
          </tbody>
        </table>
      </div>
    </main>
  );
}
