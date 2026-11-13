'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type NavItem = { href: string; label: string };

export function NavLinks({ items }: { items: NavItem[] }) {
  const path = usePathname();
  // "/staff" also owns /staff/submissions/*; every other item owns its own subtree.
  const active = (href: string) =>
    href === '/staff' ? path === '/staff' || path.startsWith('/staff/submissions') : path === href || path.startsWith(`${href}/`);
  return (
    <nav aria-label="เมนูหลัก">
      {items.map((i) => (
        <Link key={i.href} href={i.href} aria-current={active(i.href) ? 'page' : undefined}>{i.label}</Link>
      ))}
    </nav>
  );
}
