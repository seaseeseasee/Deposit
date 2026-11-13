import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth.ts';
import { withTx } from '@/lib/db.ts';

export const dynamic = 'force-dynamic';

const ST: Record<string, [string, string]> = {
  pending: ['รอตรวจ', 'p'], verified: ['ยืนยันแล้ว', 'v'], rejected: ['ปฏิเสธ', 'r'], duplicate: ['อาจซ้ำ', 'd'],
};

export default async function Review({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; done?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { error, done } = await searchParams;
  if (!/^\d+$/.test(id)) notFound();

  const data = await withTx(user.scope, async (c) => {
    const s = (await c.query(
      `SELECT s.*, w.name AS ward_name, d.ref_no AS dup_ref, u.full_name AS reviewer,
              (SELECT id FROM deposit_slips WHERE submission_id = s.id LIMIT 1) AS slip_id
         FROM deposit_submissions s JOIN wards w ON w.id = s.ward_id
         LEFT JOIN deposit_submissions d ON d.id = s.duplicate_of_id
         LEFT JOIN users u ON u.id = s.reviewed_by
        WHERE s.id = $1`, [id])).rows[0];
    if (!s) return null;
    const admissions = (await c.query(
      `SELECT a.id, p.full_name, p.hn, a.bed_no
         FROM patient_admissions a JOIN patients p ON p.id = a.patient_id
        WHERE a.ward_id = $1 AND a.status = 'active' ORDER BY p.full_name`, [s.ward_id])).rows;
    return { s, admissions };
  });
  if (!data) notFound();
  const { s, admissions } = data;
  const norm = (x: string) => x.replace(/s+/g, ' ').trim().toLowerCase();
  const match = admissions.find((a) => norm(a.full_name) === norm(s.patient_name_input));
  const defaultChoice = String(match?.id ?? 'new');
  const open = s.status === 'pending' || s.status === 'duplicate';
  const canAct = open && user.role !== 'admin';
  const fmt = (d: Date) => new Date(d).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <main className="staff">
      <header className="bar">
        <b>ตรวจสลิป {s.ref_no}</b>
        <Link className="lnk" href="/staff">← กลับคิว</Link>
      </header>
      {error && <div className="error banner" role="alert">{error}</div>}
      {done && <div className="okmsg banner" role="status">{done} · <Link className="lnk" href="/staff/confirmed">ดูในตารางยอดที่ยืนยันแล้ว</Link></div>}
      <div className="grid2">
        <div>
          {s.slip_id
            // eslint-disable-next-line @next/next/no-img-element
            ? <a href={`/api/slips/${s.slip_id}`} target="_blank" rel="noreferrer"><img className="slipimg" src={`/api/slips/${s.slip_id}`} alt="รูปสลิปที่ญาติส่งมา" /></a>
            : <div className="muted">ไม่มีรูปสลิป</div>}
        </div>
        <div className="stack">
          <dl className="kv">
            <dt>หอ</dt><dd>{s.ward_name}</dd>
            <dt>จำนวนเงิน</dt><dd><b>{Number(s.amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท</b></dd>
            <dt>เวลาที่โอน</dt><dd>{fmt(s.transfer_at)}</dd>
            <dt>ผู้โอน</dt><dd>{s.payer_name}</dd>
            <dt>ผู้ป่วย (ญาติกรอก)</dt><dd>{s.patient_name_input}{s.hn_input ? ` · HN ${s.hn_input}` : ''}</dd>
            <dt>เบอร์โทร</dt><dd>{s.phone ?? '-'}</dd>
            <dt>หมายเหตุ</dt><dd>{s.note ?? '-'}</dd>
            <dt>สถานะ</dt><dd><span className={`st ${ST[s.status][1]}`}>{ST[s.status][0]}</span>{s.reviewer ? ` · ${s.reviewer} ${fmt(s.reviewed_at)}` : ''}</dd>
            {s.reject_reason && (<><dt>เหตุผลที่ปฏิเสธ</dt><dd>{s.reject_reason}</dd></>)}
          </dl>
          {s.dup_ref && <div className="alert">พบรายการที่อาจซ้ำ: {s.dup_ref} (สลิปเดียวกัน หรือยอดและผู้โอนเดียวกันในช่วง 1 ชั่วโมง)</div>}

          {canAct && (
            <>
              <form action="/api/staff/verify" method="post" className="stack">
                <input type="hidden" name="id" value={s.id} />
                <div className="field">
                  <label htmlFor="admission">ผู้ป่วยที่จะบันทึกยอดให้ *</label>
                  <select id="admission" name="admission" defaultValue={defaultChoice}>
                    <option value="" disabled>— เลือกผู้ป่วย —</option>
                    {admissions.map((a) => (
                      <option key={a.id} value={a.id}>{a.full_name}{a.bed_no ? ` · เตียง ${a.bed_no}` : ''}{a.hn ? ` · HN ${a.hn}` : ''}</option>
                    ))}
                    <option value="new">+ ผู้ป่วยใหม่ (ใช้ชื่อที่ญาติกรอก)</option>
                  </select>
                </div>
                <fieldset className="newp">
                  <legend>ผู้ป่วยใหม่ (ใช้เมื่อเลือก “ผู้ป่วยใหม่”)</legend>
                  <input name="newName" placeholder="ชื่อ-นามสกุล" defaultValue={s.patient_name_input} aria-label="ชื่อผู้ป่วยใหม่" />
                  <input name="newHn" placeholder="HN (ถ้ามี)" defaultValue={s.hn_input ?? ''} aria-label="HN" />
                  <input name="newBed" placeholder="เตียง (ถ้ามี)" aria-label="เตียง" />
                </fieldset>
                <label className="chk"><input type="checkbox" name="checked" required /> ฉันตรวจกับรายการเดินบัญชีของธนาคารแล้วว่าเงินเข้าจริง</label>
                <button type="submit" className="sm ok">ยืนยันรับเงิน</button>
              </form>
              <form action="/api/staff/reject" method="post" className="stack">
                <input type="hidden" name="id" value={s.id} />
                <div className="field"><label htmlFor="reason">เหตุผลที่ปฏิเสธ</label><input id="reason" name="reason" required /></div>
                <button type="submit" className="sm bad">ปฏิเสธรายการ</button>
              </form>
              <p className="muted">ระบบไม่เพิ่มยอดเงินอัตโนมัติ ยอดจะเข้าบัญชีผู้ป่วยเมื่อกดยืนยันเท่านั้น</p>
            </>
          )}
          {open && user.role === 'admin' && <p className="muted">ผู้ดูแลระบบดูได้อย่างเดียว ไม่สามารถยืนยันหรือปฏิเสธ</p>}
        </div>
      </div>
    </main>
  );
}
