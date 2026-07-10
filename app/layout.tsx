import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { StockProvider } from '@/context/stock';
import Shell from '@/components/Shell';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: {
    template: '%s · StockDesk',
    default: 'StockDesk — Personal Stock Dashboard',
  },
  description: 'ดูข้อมูลหุ้น SET ส่วนตัว',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="h-full antialiased">
        <StockProvider>
          <Shell>{children}</Shell>
        </StockProvider>
      </body>
    </html>
  );
}
