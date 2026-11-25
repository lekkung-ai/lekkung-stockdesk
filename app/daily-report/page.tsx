import DailyReportClient from './DailyReportClient';

// หน้า static (○): ข้อมูลทั้งหมดถูก import จาก data/scans/daily_report.json ตอน build
// ฟอนต์ = ฟอนต์หลักของแอป (ไม่โหลดฟอนต์เพิ่ม) · ตัวเลขใช้ tabular-nums แบบหน้าอื่น
export default function DailyReportPage() {
  return <DailyReportClient />;
}
