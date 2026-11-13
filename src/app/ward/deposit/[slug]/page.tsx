import { notFound } from 'next/navigation';
import { getPublicWard } from '@/lib/deposit.ts';
import { getSetting } from '@/lib/settings.ts';
import { CopyButton } from './copy-button.tsx';
import { DepositForm } from './deposit-form.tsx';

export const dynamic = 'force-dynamic';

export default async function DepositPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ward = await getPublicWard(slug);
  if (!ward) notFound();
  const requireHn = await getSetting<boolean>('require_hn', false);

  return (
    <main className="page">
      <header className="hero">
        <div className="hosp">{ward.hospital_name}</div>
        <h1>{ward.name}</h1>
      </header>

      <section className="bank lift" aria-label="บัญชีรับโอน">
        <div className="step"><b>1</b> โอนเงินมาที่บัญชีนี้</div>
        <span className="bname">{ward.bank_name}</span>
        <span>ชื่อบัญชี: {ward.account_name}</span>
        <span className="acc">{ward.account_no}</span>
        <CopyButton text={ward.account_no} />
        {ward.qr_image_path && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/ward-qr/${ward.id}`} alt="QR Code สำหรับโอนเงิน" style={{ width: 200, maxWidth: '100%', alignSelf: 'center', borderRadius: 12, background: '#fff', padding: 6, border: '1px solid var(--line)' }} />
        )}
      </section>

      <DepositForm ward={slug} requireHn={requireHn} />
      <p className="muted" style={{ textAlign: 'center' }}>ไม่ต้องสมัครสมาชิก · ข้อมูลของท่านใช้เพื่อการตรวจสอบการโอนเงินเท่านั้น</p>
    </main>
  );
}
