import Link from 'next/link';
import { requireUser } from '@/lib/auth.ts';
import { withTx } from '@/lib/db.ts';
import { baht, dateOnly, dateTime } from '@/lib/format.ts';

export const dynamic = 'force-dynamic';

export default async function Approvals({ searchParams }: { searchParams: Promise<{ error?: string; done?: string }> }) {
  const user = await requireUser();
  const { error, done } = await searchParams;

  const rows = await withTx(user.scope, async (c) =>
    (await c.query(
      `SELECT ap.id, ap.status, ap.created_at, ap.requested_by, ap.decided_at, ap.comment,
              e.id AS expense_id, e.amount, e.description, e.incident_detail, e.spent_at, e.evidence_path, e.admission_id,
              cat.name AS category, p.full_name AS patient, w.name AS ward_name,
              ru.full_name AS requester, du.full_name AS decider
         FROM approvals ap
         JOIN expense_records e ON ap.target_type = 'expense_record' AND e.id = ap.target_id
         JOIN expense_categories cat ON cat.id = e.category_id
         JOIN patient_admissions a ON a.id = e.admission_id JOIN patients p ON p.id = a.patient_id
         JOIN wards w ON w.id = ap.ward_id
         JOIN users ru ON ru.id = ap.requested_by LEFT JOIN users du ON du.id = ap.decided_by
        ORDER BY (ap.status = 'pending') DESC, ap.created_at DESC LIMIT 100`)).rows);

  const open = rows.filter((r) => r.status === 'pending');
  const history = rows.filter((r) => r.status !== 'pending');

  return (
    <main className="staff">
      <h1 className="h">รออนุมัติ</h1>
      {error && <div className="error banner" role="alert">{error}</div>}
      {done && <div className="okmsg banner" role="status">{done}</div>}
      {user.role !== 'manager' && <p className="muted">เฉพาะหัวหน้าหอเท่านั้นที่อนุมัติได้ หน้านี้ใช้ติดตามสถานะคำขอ</p>}

      {open.length === 0 && <p className="muted">ไม่มีรายการรออนุมัติ</p>}
      {open.map((r) => {
        const own = Number(r.requested_by) === user.id;
        return (
          <article className="card stack" key={r.id}>
            <div><b>{r.category}</b> · {r.patient} · {r.ward_name} · <b className="out">{baht(r.amount)} บาท</b></div>
            <dl className="kv">
              <dt>วันที่เกิดเหตุ/จ่าย</dt><dd>{dateOnly(r.spent_at)}</dd>
              <dt>รายละเอียด</dt><dd>{r.description}</dd>
              <dt>เหตุการณ์</dt><dd>{r.incident_detail ?? '-'}</dd>
              <dt>ผู้ขอ</dt><dd>{r.requester} · {dateTime(r.created_at)}</dd>
              <dt>หลักฐาน</dt><dd>{r.evidence_path ? <a className="lnk" href={`/api/evidence/${r.expense_id}`} target="_blank" rel="noreferrer">เปิดรูป</a> : 'ไม่มี'}</dd>
            </dl>
            {user.role === 'manager' && !own && (
              <form action="/api/staff/approval" method="post" className="stack">
                <input type="hidden" name="id" value={r.id} />
                <div className="field"><label htmlFor={`c${r.id}`}>หมายเหตุ (จำเป็นเมื่อไม่อนุมัติ)</label><input id={`c${r.id}`} name="comment" /></div>
                <div className="row" style={{ display: 'flex', gap: 8 }}>
                  <button className="sm ok" name="decision" value="approve" type="submit">อนุมัติและหักเงิน</button>
                  <button className="sm bad" name="decision" value="reject" type="submit">ไม่อนุมัติ</button>
                </div>
              </form>
            )}
            {own && <p className="muted">คุณเป็นผู้ขอรายการนี้ จึงอนุมัติเองไม่ได้</p>}
            <Link className="lnk" href={`/staff/patients/${r.admission_id}`}>เปิดบัญชีผู้ป่วย</Link>
          </article>
        );
      })}

      {history.length > 0 && (
        <section>
          <h2 className="h" style={{ marginBottom: 8 }}>ประวัติการตัดสิน</h2>
          <div className="tw"><table>
            <thead><tr><th>ผู้ป่วย</th><th>หมวด</th><th className="n">จำนวนเงิน</th><th>ผล</th><th>ผู้ตัดสิน</th><th>หมายเหตุ</th></tr></thead>
            <tbody>{history.map((r) => (
              <tr key={r.id}><td>{r.patient}</td><td>{r.category}</td><td className="n">{baht(r.amount)}</td>
                <td><span className={`st ${r.status === 'approved' ? 'v' : 'r'}`}>{r.status === 'approved' ? 'อนุมัติ' : 'ไม่อนุมัติ'}</span></td>
                <td>{r.decider} {r.decided_at && dateTime(r.decided_at)}</td><td>{r.comment ?? ''}</td></tr>
            ))}</tbody>
          </table></div>
        </section>
      )}
    </main>
  );
}
