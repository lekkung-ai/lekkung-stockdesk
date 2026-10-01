// Pure logic for the /sepa shortlist tiers (🎯 พร้อมยิง / 👀 เฝ้าดู), the VCP columns and the
// market-stage strip. No React, no JSON import — the page passes rows / breadth.json in.

/** ready: VCP contraction count at least this. */
export const READY_MIN_T = 2;
/** ready: price at most this % below the VCP pivot (VCP_ToPivot, + = below pivot). */
export const READY_MAX_TO_PIVOT = 5;
/** watch: RS Rating at least this. */
export const WATCH_MIN_RS = 80;
/** watch: price at most this % below the 52-week high. */
export const WATCH_MAX_FROM_HIGH = 15;

export type Tier = 'ready' | 'watch' | 'rest';
export type TierFilter = 'all' | 'ready' | 'watch';
export const TIER_FILTERS: TierFilter[] = ['all', 'ready', 'watch'];

/** The scan fields tierOf / the VCP columns read. Values come straight from sepa.json, so any may be null. */
export interface SepaTierFields {
  RS_Rating?: unknown;
  '%_From_High'?: unknown;
  VCP_Contracting?: unknown;
  VCP_T?: unknown;
  VCP_ToPivot?: unknown;
  VCP_Weeks?: unknown;
  VCP_MaxDepth?: unknown;
  VCP_FinalDepth?: unknown;
  VCP_VolRatio?: unknown;
  VCP_Footprint?: unknown;
}

/** number, or a numeric string such as "-6.36%" → number; anything else (null, "", "abc", NaN, ∞) → null. */
export function toNum(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const s = v.trim().replace(/%$/, '').trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function isReady(r: SepaTierFields): boolean {
  const t = toNum(r.VCP_T);
  const toPivot = toNum(r.VCP_ToPivot);
  return r.VCP_Contracting === true
    && t != null && t >= READY_MIN_T
    && toPivot != null && toPivot >= 0 && toPivot <= READY_MAX_TO_PIVOT;
}

export function isWatchCandidate(r: SepaTierFields): boolean {
  const rs = toNum(r.RS_Rating);
  const fromHigh = toNum(r['%_From_High']);
  return rs != null && rs >= WATCH_MIN_RS && fromHigh != null && fromHigh >= -WATCH_MAX_FROM_HIGH;
}

/** ready = contracting VCP with ≥2T and price 0–5% under the pivot · watch = not ready, RS ≥ 80 and ≤15% off the high · rest = everything else. */
export function tierOf(r: SepaTierFields): Tier {
  if (isReady(r)) return 'ready';
  if (isWatchCandidate(r)) return 'watch';
  return 'rest';
}

export function parseTierFilter(v: string | null | undefined): TierFilter {
  return v === 'ready' || v === 'watch' ? v : 'all';
}

export function inTier(r: SepaTierFields, f: TierFilter): boolean {
  return f === 'all' || tierOf(r) === f;
}

/** "9W 13/4 2T" for the VCP column; "no base" / missing → null (shown as —). */
export function vcpFootprint(r: SepaTierFields): string | null {
  const f = r.VCP_Footprint;
  if (typeof f !== 'string' || f.trim() === '' || f === 'no base') return null;
  return f;
}

/** Final-leg volume below its average (VolRatio < 1.0) = volume drying up. */
export function isVolumeDry(r: SepaTierFields): boolean {
  const v = toNum(r.VCP_VolRatio);
  return v != null && v < 1;
}

/** Plain-language tooltip: "ฐาน 9 สัปดาห์ · ย่อลึกสุด 13% · ย่อรอบสุดท้าย 4% · หดตัว 2 ครั้ง · วอลุ่มรอบสุดท้าย 0.45× ของปกติ (แห้ง)". */
export function vcpTooltip(r: SepaTierFields): string | null {
  if (vcpFootprint(r) == null) return null;
  const parts: string[] = [];
  const weeks = toNum(r.VCP_Weeks);
  const maxD = toNum(r.VCP_MaxDepth);
  const finD = toNum(r.VCP_FinalDepth);
  const t = toNum(r.VCP_T);
  const vol = toNum(r.VCP_VolRatio);
  if (weeks != null) parts.push(`ฐาน ${weeks} สัปดาห์`);
  if (maxD != null) parts.push(`ย่อลึกสุด ${Math.round(maxD)}%`);
  if (finD != null) parts.push(`ย่อรอบสุดท้าย ${Math.round(finD)}%`);
  if (t != null) parts.push(`หดตัว ${t} ครั้ง`);
  if (vol != null) parts.push(`วอลุ่มรอบสุดท้าย ${vol.toFixed(2)}× ของปกติ${vol < 1 ? ' (แห้ง)' : ''}`);
  if (r.VCP_Contracting === false) parts.push('ยังไม่หดตัวเป็นขั้น');
  return parts.join(' · ');
}

/** Sort comparator with null / non-numeric values always last, in both directions. */
export function compareNullLast(a: unknown, b: unknown, dir: 'asc' | 'desc'): number {
  const x = toNum(a);
  const y = toNum(b);
  if (x == null && y == null) return 0;
  if (x == null) return 1;
  if (y == null) return -1;
  return dir === 'asc' ? x - y : y - x;
}

export interface SepaMarketStage {
  stage: string;
  ddCount: number | null;
  caution: boolean;
}

/** Stages where the strip turns orange and advises smaller / fewer buys. */
export const CAUTION_STAGES = ['Correction', 'Under Pressure'];

/** market_stage from breadth.json (`{ market_stage: { stage, dd_count_25d } }`); no stage → null (strip hidden). */
export function readMarketStage(breadth: unknown): SepaMarketStage | null {
  const ms = (breadth as { market_stage?: { stage?: unknown; dd_count_25d?: unknown } } | null | undefined)?.market_stage;
  if (!ms || typeof ms.stage !== 'string' || ms.stage.trim() === '') return null;
  return { stage: ms.stage, ddCount: toNum(ms.dd_count_25d), caution: CAUTION_STAGES.includes(ms.stage) };
}
