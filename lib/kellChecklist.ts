// Oliver Kell 7 ข้อของหุ้นตัวเดียว (data/scans/kell_checklist.json จาก data_engine scan_oliver_kell.py)
// pure — ไม่แตะ I/O · ตัวโหลดไฟล์อยู่ที่ lib/kellChecklistData.ts (server เท่านั้น)
// K1..K7 เรียงตามโค้ด scan_oliver_kell_strict(): K1–K3 = ด่าน Trend Template, K4–K7 = Kell's Signal
// ผ่าน/ไม่ผ่านของแต่ละข้อเชื่อค่า K ในไฟล์ (คำนวณจากราคาเต็มความละเอียด) ไม่คำนวณซ้ำจากตัวเลขที่ปัดแล้ว

export interface KellChecklistRow {
  Ticker: string;
  Price: number;
  SMA_50: number;
  SMA_200: number;
  SMA_200_20D_Ago: number;
  EMA_10: number;
  EMA_20: number;
  EMA_10_5D_Ago: number;
  EMA_20_5D_Ago: number;
  Dist_EMA10_Pct: number;
  Dist_EMA20_Pct: number;
  K1: boolean;
  K2: boolean;
  K3: boolean;
  K4: boolean;
  K5: boolean;
  K6: boolean;
  K7: boolean;
  Pass_Count: number;
  All_Pass: boolean;
}

export interface KellChecklistItem {
  n: number;
  label: string;
  pass: boolean;
  detail: string;
}

/** เกณฑ์ความแน่น K7 ของ scan_oliver_kell.py (ห้ามเปลี่ยนที่นี่ — ใช้แสดงผลเท่านั้น) */
export const KELL_TIGHT_PCT = 3.5;

const NUM_FIELDS = [
  'Price', 'SMA_50', 'SMA_200', 'SMA_200_20D_Ago', 'EMA_10', 'EMA_20', 'EMA_10_5D_Ago', 'EMA_20_5D_Ago',
  'Dist_EMA10_Pct', 'Dist_EMA20_Pct', 'Pass_Count',
] as const;
const BOOL_FIELDS = ['K1', 'K2', 'K3', 'K4', 'K5', 'K6', 'K7', 'All_Pass'] as const;

/** แถวจากไฟล์ → KellChecklistRow · รูปไม่ครบ/ชนิดผิด → null (หน้าใช้การ์ดแบบเดิม) */
export function parseKellChecklistRow(raw: unknown): KellChecklistRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.Ticker !== 'string') return null;
  for (const f of NUM_FIELDS) if (typeof r[f] !== 'number' || !Number.isFinite(r[f])) return null;
  for (const f of BOOL_FIELDS) if (typeof r[f] !== 'boolean') return null;
  return r as unknown as KellChecklistRow;
}

const f2 = (v: number) => v.toFixed(2);
/** ระยะห่าง % ทศนิยม 1 ตำแหน่ง · ค่าที่เกิน 3.5 แต่ปัดแล้วเป็น "3.5" → 2 ตำแหน่ง (ไม่ให้ ✗ คู่กับ 3.5%) */
export function fmtDist(v: number): string {
  const one = v.toFixed(1);
  return v > KELL_TIGHT_PCT && Number(one) <= KELL_TIGHT_PCT ? v.toFixed(2) : one;
}

/** 7 แถวของการ์ด Oliver Kell ตามลำดับโค้ด พร้อมตัวเลขจริงด้านขวา (K6 = 2 บรรทัด คั่นด้วย \n) */
export function kellChecklistItems(row: KellChecklistRow): KellChecklistItem[] {
  return [
    { n: 1, label: 'ราคา > SMA50', pass: row.K1, detail: `${f2(row.Price)} > ${f2(row.SMA_50)}` },
    { n: 2, label: 'SMA50 > SMA200', pass: row.K2, detail: `${f2(row.SMA_50)} > ${f2(row.SMA_200)}` },
    { n: 3, label: 'SMA200 ขาขึ้น (เทียบ 20 วันก่อน)', pass: row.K3, detail: `${f2(row.SMA_200)} > ${f2(row.SMA_200_20D_Ago)}` },
    { n: 4, label: 'ราคาเหนือ EMA10 และ EMA20', pass: row.K4, detail: `${f2(row.Price)} > ${f2(row.EMA_10)} / ${f2(row.EMA_20)}` },
    { n: 5, label: 'EMA10 > EMA20', pass: row.K5, detail: `${f2(row.EMA_10)} > ${f2(row.EMA_20)}` },
    {
      n: 6,
      label: 'EMA10 และ EMA20 ขาขึ้น (5 วัน)',
      pass: row.K6,
      detail: `EMA10 ${f2(row.EMA_10)} > ${f2(row.EMA_10_5D_Ago)}\nEMA20 ${f2(row.EMA_20)} > ${f2(row.EMA_20_5D_Ago)}`,
    },
    {
      n: 7,
      label: `ห่าง EMA10 หรือ EMA20 ≤ ${KELL_TIGHT_PCT}%`,
      pass: row.K7,
      detail: `EMA10 ${fmtDist(row.Dist_EMA10_Pct)}% · EMA20 ${fmtDist(row.Dist_EMA20_Pct)}%`,
    },
  ];
}
