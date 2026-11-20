// Oliver Kell 7 ข้อของหุ้นตัวเดียว (data/scans/kell_checklist.json จาก data_engine scan_oliver_kell.py)
// pure — ไม่แตะ I/O · ตัวโหลดไฟล์อยู่ที่ lib/kellChecklistData.ts (server เท่านั้น)
// K1..K7 เรียงตามโค้ด scan_oliver_kell_strict(): K1–K3 = ด่าน Trend Template, K4–K7 = Kell's Signal
// ผ่าน/ไม่ผ่านของแต่ละข้อเชื่อค่า K ในไฟล์ (คำนวณจากราคาเต็มความละเอียด) ไม่คำนวณซ้ำจากตัวเลขที่ปัดแล้ว

import { compareParts, NEWLINE_PART, partsText, priceLead, valLead, type DetailPart } from './checklistDisplay';

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
  /** ข้อความล้วน (รวมเครื่องหมายจริงและคำกำกับ) */
  detail: string;
  /** ชิ้นส่วนสำหรับระบายสี (ราคา = ฟ้า, เครื่องหมายที่ตก = แดง) */
  parts: DetailPart[];
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

/** ระยะห่าง % ทศนิยม 1 ตำแหน่ง · ค่าที่เกิน 3.5 แต่ปัดแล้วเป็น "3.5" → 2 ตำแหน่ง (ไม่ให้ ✗ คู่กับ 3.5%) */
export function fmtDist(v: number): string {
  const one = v.toFixed(1);
  return v > KELL_TIGHT_PCT && Number(one) <= KELL_TIGHT_PCT ? v.toFixed(2) : one;
}

const mk = (n: number, label: string, pass: boolean, parts: DetailPart[]): KellChecklistItem => ({ n, label, pass, detail: partsText(parts), parts });

/** K6: "EMA10 56.85 < 60.84 (5 วันก่อน)" — ป้ายนำหน้าเป็นข้อความธรรมดา เครื่องหมายตามค่าจริง */
const emaTrend = (name: string, now: number, ago: number, pass: boolean): DetailPart[] => [
  { text: `${name} `, kind: 'val' },
  ...compareParts(valLead(now), [ago], pass, '5 วันก่อน'),
];

/** 7 แถวของการ์ด Oliver Kell ตามลำดับโค้ด พร้อมตัวเลขจริงด้านขวา (K6 = 2 บรรทัด คั่นด้วย ขึ้นบรรทัดใหม่) */
export function kellChecklistItems(row: KellChecklistRow): KellChecklistItem[] {
  // K7: ผ่านถ้า EMA10 หรือ EMA20 ห่าง ≤ 3.5% → ตกแล้วค่าที่เกินเกณฑ์ระบายแดง + เกณฑ์กำกับ
  const dist = (name: string, v: number): DetailPart[] => [
    { text: `${name} `, kind: 'val' },
    { text: `${fmtDist(v)}%`, kind: !row.K7 && v > KELL_TIGHT_PCT ? 'fail' : 'val' },
  ];
  return [
    mk(1, 'ราคา > SMA50', row.K1, compareParts(priceLead(row.Price), [row.SMA_50], row.K1)),
    mk(2, 'SMA50 > SMA200', row.K2, compareParts(valLead(row.SMA_50), [row.SMA_200], row.K2)),
    mk(3, 'SMA200 ขาขึ้น (เทียบ 20 วันก่อน)', row.K3, compareParts(valLead(row.SMA_200), [row.SMA_200_20D_Ago], row.K3, '20 วันก่อน')),
    mk(4, 'ราคาเหนือ EMA10 และ EMA20', row.K4, compareParts(priceLead(row.Price), [row.EMA_10, row.EMA_20], row.K4)),
    mk(5, 'EMA10 > EMA20', row.K5, compareParts(valLead(row.EMA_10), [row.EMA_20], row.K5)),
    mk(6, 'EMA10 และ EMA20 ขาขึ้น (5 วัน)', row.K6, [
      ...emaTrend('EMA10', row.EMA_10, row.EMA_10_5D_Ago, row.K6),
      NEWLINE_PART,
      ...emaTrend('EMA20', row.EMA_20, row.EMA_20_5D_Ago, row.K6),
    ]),
    mk(7, `ห่าง EMA10 หรือ EMA20 ≤ ${KELL_TIGHT_PCT}%`, row.K7, [
      ...dist('EMA10', row.Dist_EMA10_Pct),
      { text: ' · ', kind: 'val' },
      ...dist('EMA20', row.Dist_EMA20_Pct),
      ...(row.K7 ? [] : [{ text: ` (เกณฑ์ ≤ ${KELL_TIGHT_PCT}%)`, kind: 'note' as const }]),
    ]),
  ];
}
