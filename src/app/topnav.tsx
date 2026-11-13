import Link from 'next/link';
import type { AuthUser } from '@/lib/auth.ts';
import { expensesEnabled } from '@/lib/features.ts';
import { NavLinks, type NavItem } from './nav-links.tsx';

const ROLE = { admin: 'ผู้ดูแลระบบ', manager: 'หัวหน้าหอ', staff: 'เจ้าหน้าที่' } as const;

export function TopNav({ user }: { user: AuthUser }) {
  const items: NavItem[] = [
    { href: '/staff', label: 'คิวสลิป' },
    { href: '/staff/confirmed', label: 'ยอดที่ยืนยันแล้ว' },
    { href: '/staff/dashboard', label: 'Dashboard' },
    { href: '/staff/patients', label: 'ผู้ป่วย' },
    ...(expensesEnabled() ? [{ href: '/staff/approvals', label: 'รออนุมัติ' }] : []),
    { href: '/staff/reports', label: 'รายงาน' },
    ...(user.role === 'admin' ? [{ href: '/admin', label: 'จัดการระบบ' }] : []),
  ];
  return (
    <header className="topnav">
      <Link href="/staff" className="brand"><span className="brandmark" aria-hidden="true">฿</span>ฝากเงินผู้ป่วย</Link>
      <NavLinks items={items} />
      <div className="who">
        <span>{user.fullName} · {ROLE[user.role]}{user.role === 'admin' ? ' (ดูการเงินได้อย่างเดียว)' : ''}</span>
        <form action="/api/logout" method="post"><button className="sm ghost" type="submit">ออกจากระบบ</button></form>
      </div>
    </header>
  );
}
