// ตัวโหลด data/scans/report_card_events.json (server เท่านั้น — อ่านด้วย fs ตอน build ของหน้า /report-card,
// /report-card/rs7, /report-card/luk ซึ่งเป็น static) · ไม่ import ตรง เพราะไฟล์อาจยังไม่มี (data-engine step
// "Report card events" เพิ่งเริ่ม): ไม่มีไฟล์ / อ่านไม่ได้ / รูปผิด → null แล้วหน้าขึ้นข้อความรอข้อมูลแทนการทำให้ build ล้ม
// ไม่ใช่ route handler จึงไม่ต้องอยู่ใน outputFileTracingIncludes
import fs from 'fs';
import path from 'path';
import { parseRcEvents, type RcEventsData } from '@/lib/rcEvents';

const FILE = path.join(process.cwd(), 'data', 'scans', 'report_card_events.json');

export function loadRcEvents(): RcEventsData | null {
  try {
    return parseRcEvents(JSON.parse(fs.readFileSync(FILE, 'utf-8')) as unknown);
  } catch {
    return null;
  }
}
