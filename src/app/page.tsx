import Link from 'next/link';
import { listPublicWards } from '@/lib/deposit.ts';
import { getSetting } from '@/lib/settings.ts';
import { Kiosk } from './kiosk.tsx';

export const dynamic = 'force-dynamic';

// Public entry for relatives: pick the building, see the account number first, then send the slip.
export default async function Home() {
  const wards = await listPublicWards();
  const requireHn = await getSetting<boolean>('require_hn', false);
  return (
    <main className="page">
      <header className="hero">
        <div className="hosp">{wards[0]?.hospital_name ?? 'โรงพยาบาล'}</div>
        <h1>ฝากเงินให้ผู้ป่วย</h1>
      </header>
      <div className="lift stack">
        <Kiosk wards={wards} requireHn={requireHn} />
      </div>
      <p className="muted" style={{ textAlign: 'center' }}>
        ไม่ต้องสมัครสมาชิก · ข้อมูลของท่านใช้เพื่อการตรวจสอบการโอนเงินเท่านั้น · <Link className="lnk" href="/login">เจ้าหน้าที่เข้าสู่ระบบ</Link>
      </p>
    </main>
  );
}
