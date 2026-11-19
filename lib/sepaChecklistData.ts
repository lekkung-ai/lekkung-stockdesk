// ตัวโหลด data/scans/sepa_checklist.json (server เท่านั้น — อ่านไฟล์ตอน request ผ่าน fs ไม่ import ตรง
// เพราะไฟล์อาจยังไม่มีใน deploy: ไม่มีไฟล์ / อ่านไม่ได้ → loaded=false แล้วหน้าใช้การ์ด SEPA แบบเดิมทุกอย่าง)
// ไฟล์อยู่ใน outputFileTracingIncludes ของ next.config.ts · cache ตาม mtime (ไฟล์ ~200 KB ไม่ parse ทุก request)
import fs from 'fs';
import path from 'path';
import { parseSepaChecklistRow, type SepaChecklistRow } from '@/lib/sepaChecklist';

const FILE = path.join(process.cwd(), 'data', 'scans', 'sepa_checklist.json');

let cache: { mtimeMs: number; byTicker: Map<string, unknown> } | null = null;

function load(): Map<string, unknown> | null {
  try {
    const { mtimeMs } = fs.statSync(FILE);
    if (cache && cache.mtimeMs === mtimeMs) return cache.byTicker;
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf-8')) as unknown;
    if (!Array.isArray(raw)) return null;
    const byTicker = new Map<string, unknown>();
    for (const r of raw) {
      const t = (r as { Ticker?: unknown } | null)?.Ticker;
      if (typeof t === 'string') byTicker.set(t.toUpperCase(), r);
    }
    cache = { mtimeMs, byTicker };
    return byTicker;
  } catch {
    return null;
  }
}

/** loaded = อ่านไฟล์ได้ · row = แถวของหุ้นนี้ (ไม่มี/รูปผิด → null) */
export function sepaChecklistFor(ticker: string): { loaded: boolean; row: SepaChecklistRow | null } {
  const byTicker = load();
  if (!byTicker) return { loaded: false, row: null };
  return { loaded: true, row: parseSepaChecklistRow(byTicker.get(ticker.toUpperCase())) };
}
