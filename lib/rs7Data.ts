// ตัวโหลด data/scans/rs7.json (server เท่านั้น — อ่านด้วย fs ตอน build ของหน้า /rs-leaders ซึ่งเป็น static ○)
// ไม่ import ตรง เพราะไฟล์อาจยังไม่มี (data-engine step "RS-7 scan" เพิ่งเริ่ม): ไม่มีไฟล์ / อ่านไม่ได้ / รูปผิด → null
// แล้วหน้าขึ้น "ยังไม่มีข้อมูล RS-7" แทนการทำให้ build ล้ม · ไม่ใช่ route handler จึงไม่ต้องอยู่ใน outputFileTracingIncludes
import fs from 'fs';
import path from 'path';
import { parseRs7, type Rs7Data } from '@/lib/rs7';

const FILE = path.join(process.cwd(), 'data', 'scans', 'rs7.json');

export function loadRs7(): Rs7Data | null {
  try {
    return parseRs7(JSON.parse(fs.readFileSync(FILE, 'utf-8')) as unknown);
  } catch {
    return null;
  }
}
