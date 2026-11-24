import { IBM_Plex_Mono } from 'next/font/google';
import DailyReportClient from './DailyReportClient';

// ตัวเลข / ราคา / % / ticker ของหน้านี้ใช้ IBM Plex Mono (class .num ใน DailyReport.module.css) — โหลดเฉพาะหน้านี้
const plexMono = IBM_Plex_Mono({
  variable: '--font-plex-mono',
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  display: 'swap',
});

// หน้า static (○): ข้อมูลทั้งหมดถูก import จาก data/scans/daily_report.json ตอน build
export default function DailyReportPage() {
  return (
    <div className={plexMono.variable}>
      <DailyReportClient />
    </div>
  );
}
