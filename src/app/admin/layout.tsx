import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { expensesEnabled } from '@/lib/features.ts';
import { requireUser } from '@/lib/auth.ts';
import { TopNav } from '../topnav.tsx';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  if (user.role !== 'admin') redirect('/staff');
  return (
    <>
      <TopNav user={user} />
      <nav className="subnav" aria-label="จัดการระบบ">
        <Link href="/admin/wards">หอผู้ป่วยและบัญชี</Link>
        <Link href="/admin/users">ผู้ใช้และสิทธิ์</Link>
        {expensesEnabled() && <Link href="/admin/categories">หมวดค่าใช้จ่าย</Link>}
        <Link href="/admin/audit">Audit log</Link>
        <Link href="/admin/settings">ตั้งค่าระบบ</Link>
      </nav>
      {children}
    </>
  );
}
