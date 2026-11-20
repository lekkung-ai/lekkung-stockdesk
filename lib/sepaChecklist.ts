// SEPA Trend Template 8 ข้อของหุ้นตัวเดียว (data/scans/sepa_checklist.json จาก data_engine scan_sepa.py)
// pure — ไม่แตะ I/O · ตัวโหลดไฟล์อยู่ที่ lib/sepaChecklistData.ts (server เท่านั้น)
// T1..T8 เรียงตาม Minervini: T1–T7 = cond_1..cond_7 ของ scan_sepa.py, T8 = RS ≥ 70 (RS ไม่มี = ไม่ผ่าน)
// ผ่าน/ไม่ผ่านของแต่ละข้อเชื่อค่า T ในไฟล์ (คำนวณจากราคาเต็มความละเอียด) ไม่คำนวณซ้ำจากตัวเลขที่ปัดแล้ว

import { compareParts, partsText, priceLead, signedPct1, valLead, type DetailPart } from './checklistDisplay';

export interface SepaChecklistRow {
  Ticker: string;
  Price: number;
  SMA_50: number;
  SMA_150: number;
  SMA_200: number;
  SMA_200_1M_Ago: number;
  '52W_Low': number;
  '52W_High': number;
  RS_Rating: number | null;
  T1: boolean;
  T2: boolean;
  T3: boolean;
  T4: boolean;
  T5: boolean;
  T6: boolean;
  T7: boolean;
  T8: boolean;
  Pass_Count: number;
  All_Pass: boolean;
}

export interface SepaChecklistItem {
  n: number;
  label: string;
  pass: boolean;
  /** ข้อความล้วน (รวมเครื่องหมายจริงและคำกำกับ) */
  detail: string;
  /** ชิ้นส่วนสำหรับระบายสี (ราคา = ฟ้า, เครื่องหมายที่ตก = แดง) */
  parts: DetailPart[];
}

const NUM_FIELDS = ['Price', 'SMA_50', 'SMA_150', 'SMA_200', 'SMA_200_1M_Ago', '52W_Low', '52W_High', 'Pass_Count'] as const;
const BOOL_FIELDS = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'All_Pass'] as const;

/** แถวจากไฟล์ → SepaChecklistRow · รูปไม่ครบ/ชนิดผิด → null (หน้าใช้การ์ดแบบเดิม) */
export function parseSepaChecklistRow(raw: unknown): SepaChecklistRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.Ticker !== 'string') return null;
  for (const f of NUM_FIELDS) if (typeof r[f] !== 'number' || !Number.isFinite(r[f])) return null;
  for (const f of BOOL_FIELDS) if (typeof r[f] !== 'boolean') return null;
  if (r.RS_Rating !== null && (typeof r.RS_Rating !== 'number' || !Number.isFinite(r.RS_Rating))) return null;
  return r as unknown as SepaChecklistRow;
}

const mk = (n: number, label: string, pass: boolean, parts: DetailPart[]): SepaChecklistItem => ({ n, label, pass, detail: partsText(parts), parts });

/** ข้อที่เทียบ % กับเกณฑ์: ผ่าน = ค่าปกติ · ไม่ผ่าน = ค่าแดงหนา + เกณฑ์กำกับสีจาง */
const pctParts = (text: string, pass: boolean, rule: string): DetailPart[] => [
  { text, kind: pass ? 'val' : 'fail' },
  ...(pass ? [] : [{ text: ` (เกณฑ์ ${rule})`, kind: 'note' as const }]),
];

/** 8 แถวของการ์ด SEPA ตามลำดับ Minervini พร้อมตัวเลขจริงด้านขวา (เครื่องหมาย > < = ตามค่าจริง) */
export function sepaChecklistItems(row: SepaChecklistRow): SepaChecklistItem[] {
  const fromLow = row['52W_Low'] > 0 ? (row.Price / row['52W_Low'] - 1) * 100 : NaN;
  const fromHigh = row['52W_High'] > 0 ? (row.Price / row['52W_High'] - 1) * 100 : NaN;
  const dash: DetailPart[] = [{ text: '—', kind: 'val' }];
  return [
    mk(1, 'ราคา > SMA150 และ SMA200', row.T1, compareParts(priceLead(row.Price), [row.SMA_150, row.SMA_200], row.T1)),
    mk(2, 'SMA150 > SMA200', row.T2, compareParts(valLead(row.SMA_150), [row.SMA_200], row.T2)),
    mk(3, 'SMA200 ขาขึ้น (เทียบ 1 เดือน)', row.T3, compareParts(valLead(row.SMA_200), [row.SMA_200_1M_Ago], row.T3, '1 เดือนก่อน')),
    mk(4, 'SMA50 > SMA150 และ SMA200', row.T4, compareParts(valLead(row.SMA_50), [row.SMA_150, row.SMA_200], row.T4)),
    mk(5, 'ราคา > SMA50', row.T5, compareParts(priceLead(row.Price), [row.SMA_50], row.T5)),
    mk(6, 'ราคาเหนือจุดต่ำ 52 สัปดาห์ ≥ 30%', row.T6, Number.isFinite(fromLow) ? pctParts(`${signedPct1(fromLow)} จากจุดต่ำ`, row.T6, '≥ 30%') : dash),
    mk(7, 'ห่างจุดสูง 52 สัปดาห์ ≤ 25%', row.T7, Number.isFinite(fromHigh) ? pctParts(`${signedPct1(fromHigh)} จากจุดสูง`, row.T7, '≤ 25%') : dash),
    mk(8, 'RS ≥ 70', row.T8, pctParts(row.RS_Rating == null ? 'RS —' : `RS ${Math.round(row.RS_Rating)}`, row.T8, '≥ 70')),
  ];
}
