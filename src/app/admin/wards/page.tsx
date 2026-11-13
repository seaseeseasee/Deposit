import { headers } from 'next/headers';
import QRCode from 'qrcode';
import { pool } from '@/lib/db.ts';

export const dynamic = 'force-dynamic';

export default async function Wards({ searchParams }: { searchParams: Promise<{ error?: string; done?: string }> }) {
  const { error, done } = await searchParams;
  const h = await headers();
  const base = process.env.PUBLIC_BASE_URL ?? `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}`;
  const wards = (await pool.query(
    `SELECT w.id, w.code, w.slug, w.name, w.hospital_name, w.is_active, b.bank_name, b.account_name, b.account_no, b.qr_image_path
       FROM wards w LEFT JOIN ward_bank_accounts b ON b.ward_id = w.id AND b.is_active ORDER BY w.code`)).rows;
  const qrs = await Promise.all(wards.map((w) => QRCode.toDataURL(`${base}/ward/deposit/${w.slug}`, { margin: 1, width: 280 })));

  return (
    <main className="staff">
      <h1 className="h">หอผู้ป่วยและบัญชีรับโอน</h1>
      {error && <div className="error banner" role="alert">{error}</div>}
      {done && <div className="okmsg banner" role="status">{done}</div>}

      {wards.map((w, i) => (
        <article className="card stack" key={w.id}>
          <div className="inline"><b>{w.code} · {w.name}</b><span className={`st ${w.is_active ? 'v' : 'r'}`}>{w.is_active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}</span></div>
          <div className="grid2">
            <div className="stack">
              <form action="/api/admin/ward-update" method="post" className="stack">
                <input type="hidden" name="id" value={w.id} />
                <div className="field"><label htmlFor={`n${w.id}`}>ชื่อหอ</label><input id={`n${w.id}`} name="name" defaultValue={w.name} required /></div>
                <div className="field"><label htmlFor={`h${w.id}`}>ชื่อโรงพยาบาล</label><input id={`h${w.id}`} name="hospital" defaultValue={w.hospital_name} required /></div>
                <label className="chk"><input type="checkbox" name="active" defaultChecked={w.is_active} /> เปิดใช้งาน (ปิดแล้วลิงก์ฝากเงินจะใช้ไม่ได้ ข้อมูลเดิมยังอยู่)</label>
                <button className="sm" type="submit">บันทึกข้อมูลหอ</button>
              </form>
              <form action="/api/admin/bank-save" method="post" encType="multipart/form-data" className="stack">
                <input type="hidden" name="id" value={w.id} />
                <b>บัญชีรับโอน</b>
                <div className="field"><label htmlFor={`b${w.id}`}>ธนาคาร</label><input id={`b${w.id}`} name="bank" defaultValue={w.bank_name ?? ''} required /></div>
                <div className="field"><label htmlFor={`a${w.id}`}>ชื่อบัญชี</label><input id={`a${w.id}`} name="accountName" defaultValue={w.account_name ?? ''} required /></div>
                <div className="field"><label htmlFor={`c${w.id}`}>เลขที่บัญชี</label><input id={`c${w.id}`} name="accountNo" defaultValue={w.account_no ?? ''} required /></div>
                <div className="field"><label htmlFor={`q${w.id}`}>QR สำหรับโอนเงิน (รูปภาพ ถ้ามี)</label><input id={`q${w.id}`} name="qr" type="file" accept="image/jpeg,image/png,image/webp" /></div>
                <button className="sm" type="submit">บันทึกบัญชี</button>
                <p className="muted">การเปลี่ยนบัญชีรับโอนถูกบันทึกใน Audit log (ค่าเดิม/ค่าใหม่)</p>
              </form>
            </div>
            <div className="stack">
              <b>ลิงก์และ QR สำหรับญาติ</b>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="qrimg" src={qrs[i]} alt={`QR Code ลิงก์ฝากเงิน ${w.name}`} />
              <code style={{ wordBreak: 'break-all' }}>{base}/ward/deposit/{w.slug}</code>
              <p className="muted">พิมพ์ QR นี้ติดที่หอผู้ป่วย ญาติสแกนแล้วเปิดหน้าฝากเงินได้ทันที ไม่ต้องสมัครสมาชิก</p>
            </div>
          </div>
        </article>
      ))}

      <details className="card" open={!!error}>
        <summary><b>+ เพิ่มหอผู้ป่วยใหม่</b></summary>
        <form action="/api/admin/ward-create" method="post" className="stack" style={{ marginTop: 10 }}>
          <div className="formgrid">
            <div className="field"><label htmlFor="code">รหัสหอ (เช่น WC)</label><input id="code" name="code" required maxLength={10} /></div>
            <div className="field"><label htmlFor="slug">slug ของลิงก์ (เช่น ward-c)</label><input id="slug" name="slug" required maxLength={40} /></div>
            <div className="field"><label htmlFor="name">ชื่อหอ</label><input id="name" name="name" required /></div>
            <div className="field"><label htmlFor="hospital">ชื่อโรงพยาบาล</label><input id="hospital" name="hospital" required /></div>
            <div className="field"><label htmlFor="bank">ธนาคาร</label><input id="bank" name="bank" required /></div>
            <div className="field"><label htmlFor="accountName">ชื่อบัญชี</label><input id="accountName" name="accountName" required /></div>
            <div className="field"><label htmlFor="accountNo">เลขที่บัญชี</label><input id="accountNo" name="accountNo" required /></div>
          </div>
          <button className="sm" type="submit">เพิ่มหอ</button>
        </form>
      </details>
    </main>
  );
}
