import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans_Thai, Geist_Mono } from 'next/font/google';
import './globals.css';
import { StockProvider } from '@/context/stock';
import Shell from '@/components/Shell';

// IBM Plex Sans Thai: Thai + Latin in one family, self-hosted by next/font at build time
// (no request to Google when a page opens). 400/500/600/700 cover font-normal..font-bold.
const plexSansThai = IBM_Plex_Sans_Thai({
  variable: '--font-plex-sans-thai',
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: {
    template: '%s · StockDesk',
    default: 'StockDesk — Personal Stock Dashboard',
  },
  description: 'ดูข้อมูลหุ้น SET ส่วนตัว',
};

// viewport-fit=cover is required for env(safe-area-inset-*) to resolve to a
// real value on iPhones with a Dynamic Island/notch instead of always 0.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${plexSansThai.variable} ${geistMono.variable} h-full`}>
      <body className="h-full antialiased">
        <StockProvider>
          <Shell>{children}</Shell>
        </StockProvider>
      </body>
    </html>
  );
}
