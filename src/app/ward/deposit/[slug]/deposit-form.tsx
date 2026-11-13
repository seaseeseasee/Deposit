'use client';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

export function DepositForm({ ward, requireHn, stepNo = 2 }: { ward: string; requireHn: boolean; stepNo?: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/deposit', { method: 'POST', body: new FormData(e.currentTarget) });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      router.push(`/ward/deposit/success?ref=${encodeURIComponent(data.ref)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ส่งข้อมูลไม่สำเร็จ กรุณาลองใหม่');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="step"><b>{stepNo}</b> โอนแล้ว ส่งหลักฐานการโอนเงิน</div>
      <input type="hidden" name="ward" value={ward} />
      <input className="hp" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      <div className="field"><label htmlFor="patientName">ชื่อผู้ป่วย *</label><input id="patientName" name="patientName" required maxLength={120} /></div>
      <div className="field"><label htmlFor="hn">{requireHn ? "HN *" : "HN (ถ้ามี)"}</label><input id="hn" name="hn" inputMode="numeric" maxLength={30} required={requireHn} /></div>
      <div className="field"><label htmlFor="amount">จำนวนเงิน (บาท) *</label><input id="amount" name="amount" inputMode="decimal" required /></div>
      <div className="field"><label htmlFor="transferAt">วันที่และเวลาที่โอน *</label><input id="transferAt" name="transferAt" type="datetime-local" required /></div>
      <div className="field"><label htmlFor="payerName">ชื่อผู้โอน *</label><input id="payerName" name="payerName" required maxLength={120} /></div>
      <div className="field"><label htmlFor="phone">เบอร์โทรติดต่อ (ไม่บังคับ)</label><input id="phone" name="phone" inputMode="tel" /></div>
      <div className="field"><label htmlFor="slip">รูปสลิป *</label><input id="slip" name="slip" type="file" accept="image/jpeg,image/png,image/webp" required /></div>
      <div className="field"><label htmlFor="note">หมายเหตุ</label><textarea id="note" name="note" rows={2} maxLength={500} /></div>
      {error && <div className="error" role="alert">{error}</div>}
      <button type="submit" disabled={busy}>{busy ? 'กำลังส่ง...' : 'ส่งหลักฐานการโอนเงิน'}</button>
    </form>
  );
}
