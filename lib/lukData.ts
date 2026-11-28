// ตัวโหลด data/scans/luk.json (server เท่านั้น — อ่านด้วย fs ตอน build ของหน้า /luk ซึ่งเป็น static ○)
// ไม่ import ตรง เพราะไฟล์อาจยังไม่มี (data-engine step "Martin Luk scan" เพิ่งเริ่ม): ไม่มีไฟล์ / อ่านไม่ได้ / รูปผิด → null
// แล้วหน้าขึ้น "ยังไม่มีข้อมูล Martin Luk" แทนการทำให้ build ล้ม · ไม่ใช่ route handler จึงไม่ต้องอยู่ใน outputFileTracingIncludes
import fs from 'fs';
import path from 'path';
import { parseLuk, type LukData } from '@/lib/luk';

const FILE = path.join(process.cwd(), 'data', 'scans', 'luk.json');

export function loadLuk(): LukData | null {
  try {
    return parseLuk(JSON.parse(fs.readFileSync(FILE, 'utf-8')) as unknown);
  } catch {
    return null;
  }
}
