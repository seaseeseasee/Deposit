import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth.ts';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getUser()) redirect('/staff');
  const { error } = await searchParams;
  return (
    <main className="card-center">
      <span className="brandmark" aria-hidden="true">฿</span>
      <div><h1 className="h">เข้าสู่ระบบเจ้าหน้าที่</h1><p className="muted">ระบบรับฝากเงินและบริหารรายรับ-รายจ่ายประจำหอผู้ป่วย</p></div>
      <form action="/api/login" method="post" className="stack">
        <div className="field"><label htmlFor="username">ชื่อผู้ใช้</label><input id="username" name="username" autoComplete="username" required /></div>
        <div className="field"><label htmlFor="password">รหัสผ่าน</label><input id="password" name="password" type="password" autoComplete="current-password" required /></div>
        {error === 'invalid' && <div className="error" role="alert">ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง</div>}
        {error === 'locked' && <div className="error" role="alert">ลองผิดหลายครั้ง กรุณารอ 15 นาทีแล้วลองใหม่</div>}
        <button type="submit">เข้าสู่ระบบ</button>
      </form>
    </main>
  );
}
