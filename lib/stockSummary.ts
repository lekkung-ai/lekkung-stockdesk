// ประโยคสรุป 1 บรรทัดของการ์ดสรุปเทคนิค / พื้นฐาน บนหน้า /stock/[ticker]
// กฎตายตัวล้วน (ไม่ใช้ AI) · pure — ไม่แตะ I/O ให้ vitest ทดสอบได้ตรง ๆ
// ข้อมูลท่อนไหนไม่มี (null) → ตัดท่อนนั้นทิ้ง ไม่แต่งตัวเลข

export type SummaryTone = 'good' | 'bad' | 'neutral';

export interface SummaryLine {
  text: string;
  tone: SummaryTone;
}

export interface TechSummaryInput {
  /** จำนวนข้อ SEPA ที่ผ่าน (0–8) · null = ไม่รู้ (ไม่มีทั้ง checklist และผลสแกน) */
  sepaPassCount: number | null;
  /** ผ่าน SEPA ตาม sepa.json (ป้ายหัวหน้าเชื่ออันนี้เสมอ) */
  sepaPass: boolean;
  kellPass: boolean;
  /** จำนวนข้อ Kell ที่ผ่าน (0–7) จาก kell_checklist · null/ไม่ส่ง = ไม่มีข้อมูล */
  kellPassCount?: number | null;
  stage: string | null;
}

const BAD_STAGES = new Set(['Bear', 'Distribution']);

/**
 * SEPA 8/8 และ Kell ผ่าน → "แนวโน้มขาขึ้นครบ · ผ่าน SEPA 8/8 และ Kell"
 * ไม่งั้น → "ผ่าน SEPA N/8 · Stage {stage}" (+ " · Kell ผ่าน" หรือ " · Kell N/7" เมื่อไม่ผ่านแต่มีข้อมูล)
 * สี: ผ่าน SEPA = ดี · Stage Bear/Distribution = แย่ · อื่น ๆ = กลาง
 */
export function techSummary(input: TechSummaryInput): SummaryLine | null {
  const { sepaPass, kellPass, stage } = input;
  // ป้าย ผ่าน/ไม่ผ่าน เชื่อ sepa.json → ผ่าน = 8/8 เสมอ แม้ checklist คนละรอบ
  const n = sepaPass ? 8 : input.sepaPassCount;
  if (sepaPass && kellPass) {
    return { text: 'แนวโน้มขาขึ้นครบ · ผ่าน SEPA 8/8 และ Kell', tone: 'good' };
  }
  const parts: string[] = [];
  if (n != null) parts.push(`ผ่าน SEPA ${n}/8`);
  if (stage) parts.push(`Stage ${stage}`);
  if (kellPass) parts.push('Kell ผ่าน');
  else if (input.kellPassCount != null) parts.push(`Kell ${input.kellPassCount}/7`);
  if (parts.length === 0) return null;
  const tone: SummaryTone = sepaPass ? 'good' : stage && BAD_STAGES.has(stage) ? 'bad' : 'neutral';
  return { text: parts.join(' · '), tone };
}

export const VALUE_BAND_PCT = 10;
export const PROFIT_BAND_PCT = 10;

export interface FundSummaryInput {
  /** (มูลค่าประเมิน − ราคา) ÷ ราคา × 100 — ค่าเดียวกับ % ในส่วนราคาเหมาะสม · null = ประเมินไม่ได้ */
  fairUpsidePct: number | null;
  /** กำไรสุทธิไตรมาสล่าสุด YoY % (F45) · null = ไม่มี */
  profitYoYPct: number | null;
}

/**
 * ราคาเทียบมูลค่าประเมิน: ราคาสูงกว่า > 10% "ราคาสูงกว่ามูลค่าประเมิน ~X%" · ต่ำกว่า > 10% "ราคาต่ำกว่ามูลค่าประเมิน ~X%"
 * อื่น ๆ "ราคาใกล้มูลค่าประเมิน" · ต่อด้วยกำไร YoY: ≥ +10% "กำไรโต" · ≤ −10% "กำไรลด" · อื่น ๆ "กำไรทรงตัว"
 * สี: นับท่อนดี (+1) / แย่ (−1) รวมกัน > 0 ดี · < 0 แย่ · 0 กลาง
 */
export function fundSummary(input: FundSummaryInput): SummaryLine | null {
  const parts: string[] = [];
  let score = 0;
  const u = input.fairUpsidePct;
  if (u != null && Number.isFinite(u)) {
    const x = Math.round(Math.abs(u));
    if (u < -VALUE_BAND_PCT) { parts.push(`ราคาสูงกว่ามูลค่าประเมิน ~${x}%`); score -= 1; }
    else if (u > VALUE_BAND_PCT) { parts.push(`ราคาต่ำกว่ามูลค่าประเมิน ~${x}%`); score += 1; }
    else parts.push('ราคาใกล้มูลค่าประเมิน');
  }
  const y = input.profitYoYPct;
  if (y != null && Number.isFinite(y)) {
    if (y >= PROFIT_BAND_PCT) { parts.push('กำไรโต'); score += 1; }
    else if (y <= -PROFIT_BAND_PCT) { parts.push('กำไรลด'); score -= 1; }
    else parts.push('กำไรทรงตัว');
  }
  if (parts.length === 0) return null;
  return { text: parts.join(' · '), tone: score > 0 ? 'good' : score < 0 ? 'bad' : 'neutral' };
}

/**
 * อันดับ RS ในกลุ่ม: 1 + จำนวน peer ที่ RS สูงกว่า · นับเฉพาะตัวที่มี RS
 * หุ้นตัวนี้ไม่มี RS หรือกลุ่มมีตัวเดียว → null (ไม่โชว์อันดับ)
 */
export function rsRankInGroup(ticker: string, peers: { ticker: string; rs: number | null }[]): { rank: number; n: number } | null {
  const withRs = peers.filter((p): p is { ticker: string; rs: number } => typeof p.rs === 'number' && Number.isFinite(p.rs));
  const me = withRs.find(p => p.ticker === ticker);
  if (!me || withRs.length < 2) return null;
  return { rank: 1 + withRs.filter(p => p.rs > me.rs).length, n: withRs.length };
}
