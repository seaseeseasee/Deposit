import type { ReactNode } from 'react';
import { requireUser } from '@/lib/auth.ts';
import { TopNav } from '../topnav.tsx';

export const dynamic = 'force-dynamic';

export default async function StaffLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  return (
    <>
      <TopNav user={user} />
      {children}
    </>
  );
}
