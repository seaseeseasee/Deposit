import localFont from 'next/font/local';
import type { ReactNode } from 'react';
import './globals.css';

// Self-hosted (no request to Google from patients' or staff's browsers).
const thai = localFont({ src: '../../assets/fonts/NotoSansThai.ttf', weight: '100 900', variable: '--font-th', display: 'swap' });

export const metadata = { title: 'ฝากเงินผู้ป่วย', robots: { index: false, follow: false } };
export const viewport = { themeColor: '#0b7a72', colorScheme: 'light dark' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="th" className={thai.variable}>
      <body>{children}</body>
    </html>
  );
}
