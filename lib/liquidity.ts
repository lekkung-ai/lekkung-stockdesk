// ชุดสภาพคล่องตาม ADTV(MB) (ลบ./วัน) — ใช้ร่วมกันที่ /sepa /kell /breakout · เลือกได้ทีละชุด ผูกกับ ?liq= ใน URL
// ขอบเขต: สูง ≥ LIQ_HIGH_MB · กลาง LIQ_MID_MB ถึง < LIQ_HIGH_MB · ต่ำ < LIQ_MID_MB
// หุ้นที่ไม่มีค่า ADTV อยู่ในชุด "ทั้งหมด" เท่านั้น · ADTV ของแต่ละตัวแสดงเป็นตัวเลขใต้ชื่อ (AdtvCaption)
export const LIQ_HIGH_MB = 6;
export const LIQ_MID_MB = 3;
export type LiqSet = 'all' | 'high' | 'mid' | 'low';
export const LIQ_SETS: LiqSet[] = ['all', 'high', 'mid', 'low'];
export const LIQ_DEFAULT: LiqSet = 'high';
export const LIQ_LABELS: Record<LiqSet, string> = {
  all: 'ทั้งหมด',
  high: `สูง ≥${LIQ_HIGH_MB} MB`,
  mid: `กลาง ${LIQ_MID_MB}–${LIQ_HIGH_MB} MB`,
  low: `ต่ำ <${LIQ_MID_MB} MB`,
};

export function inLiqSet(adtv: number | null | undefined, set: LiqSet): boolean {
  if (set === 'all') return true;
  if (adtv == null) return false;
  if (set === 'high') return adtv >= LIQ_HIGH_MB;
  if (set === 'mid') return adtv >= LIQ_MID_MB && adtv < LIQ_HIGH_MB;
  return adtv < LIQ_MID_MB;
}

/** ?liq= → LiqSet (missing / unknown → LIQ_DEFAULT) */
export function parseLiq(raw: string | null | undefined): LiqSet {
  return raw && (LIQ_SETS as string[]).includes(raw) ? (raw as LiqSet) : LIQ_DEFAULT;
}
