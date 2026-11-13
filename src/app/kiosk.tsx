'use client';
import { useState } from 'react';
import type { PublicWard } from '@/lib/deposit.ts';
import { DepositForm } from './ward/deposit/[slug]/deposit-form.tsx';
import { CopyButton } from './ward/deposit/[slug]/copy-button.tsx';

type Step = 'pick' | 'account' | 'form';
const LABELS: [Step, string][] = [['pick', 'เลือกตึก'], ['account', 'โอนเงิน'], ['form', 'ส่งสลิป']];

export function Kiosk({ wards, requireHn }: { wards: PublicWard[]; requireHn: boolean }) {
  const only = wards.length === 1 ? wards[0] : null;
  const [ward, setWard] = useState<PublicWard | null>(only);
  const [step, setStep] = useState<Step>(only ? 'account' : 'pick');
  const at = LABELS.findIndex(([k]) => k === step);

  return (
    <>
      <ol className="stepper" aria-label="ขั้นตอน">
        {LABELS.map(([k, label], i) => (
          <li key={k} aria-current={i === at ? 'step' : undefined} className={i < at ? 'past' : ''}>
            <b>{i < at ? '✓' : i + 1}</b><span>{label}</span>
          </li>
        ))}
      </ol>

      {step === 'pick' && (
        <section className="stack" aria-label="เลือกตึก">
          <h2 className="kh">ผู้ป่วยพักอยู่ตึกไหน</h2>
          {wards.length === 0 && <div className="alert">ยังไม่มีตึกที่เปิดรับฝากเงิน กรุณาติดต่อเจ้าหน้าที่</div>}
          {wards.map((w) => (
            <button key={w.id} type="button" className="wardbtn" onClick={() => { setWard(w); setStep('account'); }}>
              <span>{w.name}</span><span aria-hidden="true">›</span>
            </button>
          ))}
        </section>
      )}

      {step === 'account' && ward && (
        <section className="stack" aria-label="เลขบัญชีรับโอน">
          <div className="chip">ตึก: <b>{ward.name}</b>{!only && <button type="button" className="linkbtn" onClick={() => setStep('pick')}>เปลี่ยนตึก</button>}</div>
          <div className="bank">
            <div className="step"><b>1</b> โอนเงินมาที่บัญชีนี้</div>
            <span className="bname">{ward.bank_name}</span>
            <span>ชื่อบัญชี: {ward.account_name}</span>
            <span className="acc">{ward.account_no}</span>
            <CopyButton text={ward.account_no} />
            {ward.has_qr && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/ward-qr/${ward.id}`} alt="QR Code สำหรับโอนเงิน" style={{ width: 220, maxWidth: '100%', alignSelf: 'center', borderRadius: 12, background: '#fff', padding: 6, border: '1px solid var(--line)' }} />
            )}
          </div>
          <div className="alert info">โอนเงินเสร็จแล้ว กดปุ่มด้านล่างเพื่อส่งสลิป เจ้าหน้าที่จะได้ตรวจสอบและบันทึกยอดให้ผู้ป่วย</div>
          <button type="button" onClick={() => { setStep('form'); window.scrollTo({ top: 0 }); }}>โอนแล้ว ส่งสลิป ›</button>
        </section>
      )}

      {step === 'form' && ward && (
        <section className="stack" aria-label="ส่งสลิป">
          <div className="chip">ตึก: <b>{ward.name}</b>
            <button type="button" className="linkbtn" onClick={() => setStep('account')}>ดูเลขบัญชีอีกครั้ง</button></div>
          <DepositForm ward={ward.slug} requireHn={requireHn} stepNo={2} />
        </section>
      )}
    </>
  );
}
