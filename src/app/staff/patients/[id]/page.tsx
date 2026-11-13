import Link from 'next/link';
import { notFound } from 'next/navigation';
import { expensesEnabled } from '@/lib/features.ts';
import { requireUser } from '@/lib/auth.ts';
import { withTx } from '@/lib/db.ts';
import { baht, dateOnly, dateTime } from '@/lib/format.ts';

export const dynamic = 'force-dynamic';

const TYPE: Record<string, string> = {
  deposit: 'ฝากเงิน', expense: 'รายจ่าย', deduction: 'หักค่าเสียหาย', adjustment: 'ปรับปรุงยอด',
  reversal: 'ยกเลิกรายการ', refund: 'คืนเงิน', transfer_in: 'ย้ายเข้า', transfer_out: 'ย้ายออก',
};

export default async function Account({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; done?: string }> }) {
  const user = await requireUser();
  const ex = expensesEnabled();
  const { id } = await params;
  const { error, done } = await searchParams;
  if (!/^\d+$/.test(id)) notFound();

  const data = await withTx(user.scope, async (c) => {
    const head = (await c.query(
      `SELECT a.id, a.status, a.bed_no, a.admitted_at, p.full_name, p.hn, w.name AS ward_name,
              b.total_deposited, b.total_spent, b.total_deducted, b.balance
         FROM patient_admissions a JOIN patients p ON p.id = a.patient_id JOIN wards w ON w.id = a.ward_id
         JOIN v_admission_balance b ON b.admission_id = a.id WHERE a.id = $1`, [id])).rows[0];
    if (!head) return null;
    const history = (await c.query(
      `SELECT t.id, t.txn_no, t.occurred_at, t.type, t.direction, t.amount, t.note, e.id AS expense_id,
              e.description, e.evidence_path, s.ref_no, u.full_name AS by_name,
              SUM(CASE t.direction WHEN 'credit' THEN t.amount ELSE -t.amount END)
                OVER (ORDER BY t.occurred_at, t.id) AS running
         FROM financial_transactions t
         LEFT JOIN expense_records e ON e.id = t.source_expense_id
         LEFT JOIN deposit_submissions s ON s.id = t.source_submission_id
         LEFT JOIN users u ON u.id = t.created_by
        WHERE t.admission_id = $1 ORDER BY t.occurred_at DESC, t.id DESC`, [id])).rows;
    const pending = (await c.query(
      `SELECT e.id, e.spent_at, e.description, e.amount, e.status, cat.name AS category
         FROM expense_records e JOIN expense_categories cat ON cat.id = e.category_id
        WHERE e.admission_id = $1 AND e.status IN ('pending_approval','rejected') ORDER BY e.id DESC`, [id])).rows;
    const cats = (await c.query(`SELECT id, name, requires_approval FROM expense_categories WHERE is_active ORDER BY id`)).rows;
    return { head, history, pending, cats };
  });
  if (!data) notFound();
  const { head, history, pending, cats } = data;
  const canRecord = ex && head.status === 'active' && user.role !== 'admin';
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });

  return (
    <main className="staff">
      <h1 className="h">{head.full_name}{head.hn ? ` · HN ${head.hn}` : ''}</h1>
      <p className="muted">{head.ward_name}{head.bed_no ? ` · เตียง ${head.bed_no}` : ''} · {head.status === 'active' ? 'Admit' : 'ไม่ได้อยู่ในหอ'} · รับเข้า {dateOnly(head.admitted_at)} · <Link className="lnk" href="/staff/patients">← รายชื่อผู้ป่วย</Link></p>
      {error && <div className="error banner" role="alert">{error}</div>}
      {done && <div className="okmsg banner" role="status">{done}</div>}

      <section className="cards">
        <div className="card"><div className="k">ฝากสะสม</div><div className="v in">{baht(head.total_deposited)}</div></div>
        {ex && <div className="card"><div className="k">ใช้ไป</div><div className="v out">{baht(head.total_spent)}</div></div>}
        {ex && <div className="card"><div className="k">ถูกหัก</div><div className="v out">{baht(head.total_deducted)}</div></div>}
        <div className="card"><div className="k">คงเหลือ</div><div className="v">{baht(head.balance)}</div></div>
      </section>

      {canRecord && (
        <details className="card" open={!!error}>
          <summary><b>+ บันทึกรายจ่าย</b></summary>
          <form action="/api/staff/expense" method="post" encType="multipart/form-data" className="stack" style={{ marginTop: 10 }}>
            <input type="hidden" name="admission" value={head.id} />
            <div className="formgrid">
              <div className="field"><label htmlFor="category">หมวด</label>
                <select id="category" name="category" required defaultValue="">
                  <option value="" disabled>— เลือกหมวด —</option>
                  {cats.map((c) => <option key={c.id} value={c.id}>{c.name}{c.requires_approval ? ' (ต้องให้หัวหน้าหออนุมัติ)' : ''}</option>)}
                </select></div>
              <div className="field"><label htmlFor="spentAt">วันที่จ่าย</label><input id="spentAt" name="spentAt" type="date" defaultValue={today} required /></div>
              <div className="field"><label htmlFor="amount">จำนวนเงิน (บาท)</label><input id="amount" name="amount" inputMode="decimal" required /></div>
              <div className="field"><label htmlFor="description">รายละเอียด</label><input id="description" name="description" required maxLength={200} /></div>
            </div>
            <div className="field"><label htmlFor="incidentDetail">รายละเอียดเหตุการณ์ (จำเป็นสำหรับค่าเสียหายทรัพย์สิน)</label><textarea id="incidentDetail" name="incidentDetail" rows={2} maxLength={1000} /></div>
            <div className="formgrid">
              <div className="field"><label htmlFor="evidence">หลักฐาน (รูปภาพ)</label><input id="evidence" name="evidence" type="file" accept="image/jpeg,image/png,image/webp" /></div>
              <div className="field"><label htmlFor="note">หมายเหตุ</label><input id="note" name="note" maxLength={300} /></div>
            </div>
            <button className="sm" type="submit">บันทึก</button>
            <p className="muted">จ่ายเกินยอดคงเหลือไม่ได้ · หมวดค่าเสียหายจะส่งให้หัวหน้าหออนุมัติก่อน แล้วจึงหักเงิน</p>
          </form>
        </details>
      )}

      {ex && pending.length > 0 && (
        <section>
          <h2 className="h" style={{ marginBottom: 8 }}>คำขอหักเงินที่ยังไม่เสร็จสิ้น</h2>
          <div className="tw"><table>
            <thead><tr><th>วันที่</th><th>หมวด</th><th>รายละเอียด</th><th className="n">จำนวนเงิน</th><th>สถานะ</th></tr></thead>
            <tbody>{pending.map((e) => (
              <tr key={e.id}><td>{dateOnly(e.spent_at)}</td><td>{e.category}</td><td>{e.description}</td><td className="n">{baht(e.amount)}</td>
                <td><span className={`st ${e.status === 'rejected' ? 'r' : 'p'}`}>{e.status === 'rejected' ? 'ไม่อนุมัติ' : 'รออนุมัติ'}</span></td></tr>
            ))}</tbody>
          </table></div>
        </section>
      )}

      <section>
        <h2 className="h" style={{ marginBottom: 8 }}>ประวัติรับ-จ่าย</h2>
        <div className="tw"><table>
          <thead><tr><th>วันที่</th><th>ประเภท</th><th>รายละเอียด</th><th className="n">รับ</th><th className="n">จ่าย</th><th className="n">คงเหลือสะสม</th><th>ผู้บันทึก</th></tr></thead>
          <tbody>
            {history.map((t) => (
              <tr key={t.id}>
                <td>{dateTime(t.occurred_at)}</td><td>{TYPE[t.type] ?? t.type}</td>
                <td>{t.ref_no ?? t.description ?? t.note ?? ''}{t.evidence_path && <> · <a className="lnk" href={`/api/evidence/${t.expense_id}`} target="_blank" rel="noreferrer">หลักฐาน</a></>}</td>
                <td className="n in">{t.direction === 'credit' ? baht(t.amount) : ''}</td>
                <td className="n out">{t.direction === 'debit' ? baht(t.amount) : ''}</td>
                <td className="n">{baht(t.running)}</td><td>{t.by_name}</td>
              </tr>
            ))}
            {history.length === 0 && <tr><td colSpan={7} className="muted">ยังไม่มีรายการ</td></tr>}
          </tbody>
        </table></div>
        <p className="muted" style={{ marginTop: 8 }}>รายการที่ยืนยันแล้วแก้ไขหรือลบไม่ได้ หากผิดพลาดให้ขอยกเลิกหรือปรับปรุงพร้อมผู้อนุมัติ</p>
      </section>
    </main>
  );
}
