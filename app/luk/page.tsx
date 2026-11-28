import { loadLuk } from '@/lib/lukData';
import LukClient from './LukClient';

// static ○: อ่าน data/scans/luk.json ตอน build (ไม่มีไฟล์ → data = null → หน้าขึ้นข้อความรอข้อมูล)
export default function LukPage() {
  return <LukClient data={loadLuk()} />;
}
