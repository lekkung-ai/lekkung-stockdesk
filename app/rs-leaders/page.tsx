import { loadRs7 } from '@/lib/rs7Data';
import RsLeadersClient from './RsLeadersClient';

// static ○: อ่าน data/scans/rs7.json ตอน build (ไม่มีไฟล์ → data = null → หน้าขึ้นข้อความรอข้อมูล)
export default function RsLeadersPage() {
  return <RsLeadersClient data={loadRs7()} />;
}
