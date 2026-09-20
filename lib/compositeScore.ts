// Composite score (เฟส 1) — คำนวณฝั่งเบราว์เซอร์จาก field ที่มีจริงใน sepa.json เท่านั้น
// ไม่แตะ scan generator / ไม่ persist ลง JSON · สภาพคล่อง (ADTV) "ไม่อยู่ในคะแนน" — แยกเป็น
// slider ต่างหาก (ไม่ให้ 2 แกนปนกัน) · VCP/pivot proximity = เฟส 2
//
// สูตรเต็ม: Score = 50% RS + 20% Fundamental + 30% ความใกล้ 52W High (ทุกส่วน normalize เป็น 0-100)
// แถวที่ไม่มีข้อมูล Fundamental (null) ใช้สูตรตัด Fundamental — ดู sepaCompositeScore ด้านล่าง

export const SEPA_SCORE_WEIGHTS = { rs: 0.5, fundamental: 0.2, proximity: 0.3 } as const;

// ขอบของสเกล proximity = เงื่อนไข T7 ของ scan เอง (ราคา ≥ 52W High × 0.75 → ห่างได้ไม่เกิน 25%)
const PROXIMITY_BAND_PCT = 25;

const clamp = (v: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v));

// RS Rating 1-99 → 0-100 (แถวใน SEPA ผ่าน RS ≥ 70 ทุกตัว จึงอยู่ช่วง ~70-100 ในทางปฏิบัติ)
export function rsComponent(rs: number): number {
  return Number.isFinite(rs) ? clamp(((rs - 1) / 98) * 100) : 0;
}

// Fundamental_Pass เป็น 3 สถานะ: true=ผ่าน(100) · false=ไม่ผ่าน(0) · null/undefined=ไม่มีข้อมูลงบ
// null คืน null (ไม่ใช่ค่าเดา) — ให้ sepaCompositeScore ตัดส่วนนี้ออกจากสูตรของแถวนั้น
export function fundamentalComponent(pass: boolean | null | undefined): number | null {
  if (pass === true) return 100;
  if (pass === false) return 0;
  return null;
}

// %_From_High เป็นค่า ≤ 0 (เช่น -5.6): 0 = อยู่ที่ High = 100 · -25 = ขอบ T7 = 0
export function proximityComponent(pctFromHigh: number): number {
  if (!Number.isFinite(pctFromHigh)) return 0;
  return clamp(100 * (1 + pctFromHigh / PROXIMITY_BAND_PCT));
}

export interface SepaScoreParts {
  rs: number;
  /** null = ไม่มีข้อมูลงบ (ไม่ถูกนับในคะแนนแถวนี้) */
  fundamental: number | null;
  proximity: number;
  total: number;
  /** true = แถวนี้ตัด Fundamental ออกแล้วเกลี่ย weight (RS 62.5% / Proximity 37.5%) */
  renormalized: boolean;
}

export function sepaCompositeScore(e: {
  RS_Rating: number;
  Fundamental_Pass?: boolean | null;
  '%_From_High': number;
}): SepaScoreParts {
  const w = SEPA_SCORE_WEIGHTS;
  const rs = rsComponent(e.RS_Rating);
  const fundamental = fundamentalComponent(e.Fundamental_Pass);
  const proximity = proximityComponent(e['%_From_High']);

  if (fundamental == null) {
    // ไม่มีข้อมูลงบ ≠ ไม่ผ่านงบ: ไม่เดาค่า (ไม่ใช่ 0 และไม่ใช่ 50) — ตัด Fundamental ออกจากสูตร
    // แล้วเกลี่ย weight ที่เหลือให้รวมเป็น 100% (RS 50 + Proximity 30 → 62.5 / 37.5)
    // คะแนนแถวนี้จึงสะท้อนเฉพาะ RS + proximity จริง ·
    // ข้อสังเกต: แถว null ไม่โดนหักแบบ false (0) จึงเทียบกับแถวที่งบไม่ผ่านแล้วได้เปรียบเสมอ
    const total = (w.rs * rs + w.proximity * proximity) / (w.rs + w.proximity);
    return { rs, fundamental: null, proximity, total, renormalized: true };
  }

  // มีข้อมูลงบ (true/false): สูตรเต็ม 50 / 20 / 30
  const total = w.rs * rs + w.fundamental * fundamental + w.proximity * proximity;
  return { rs, fundamental, proximity, total, renormalized: false };
}
