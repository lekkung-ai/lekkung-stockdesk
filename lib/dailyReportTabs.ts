// /daily-report — แท็บ Lekkung Growth · SEPA · Market Stage: types ของ daily_report.json + logic ล้วน
// อันดับ / Score / กลุ่ม SEPA ใช้ lib ตัวเดียวกับหน้า /sepa (compositeScore · sepaTier · liquidity) — ห้ามคิดสูตรเอง

import { sepaCompositeScore } from './compositeScore';
import { tierOf, toNum, type Tier } from './sepaTier';
import { inLiqSet, type LiqSet } from './liquidity';
import type { NewsFlag, ChangeNotes } from './dailyReport';
import { vcpFootprint } from './sepaTier';

export type ScanStatus = 'new' | 'reentry' | 'stay';

export interface SignalD10 {
  n: number;
  n_win?: number | null;
  n_flat?: number | null;
  n_loss?: number | null;
  win_rate_pct?: number | null;
  avg_return_pct?: number | null;
}

export interface DroppedRow {
  ticker: string;
  status: 'dropped' | 'dropped_earlier';
  days_before_drop?: number;
  last_seen?: string;
  close: number | null;
  chg_pct: number | null;
  price_stale: boolean;
  bar_date: string | null;
  in_scans: string[];
  events: NewsFlag[];
}

// ─── Growth ────────────────────────────────────────────────────────────────

export interface GrowthRow {
  ticker: string;
  status: ScanStatus;
  last_seen: string | null;
  streak_days: number;
  days_web: number | null;
  close: number | null;
  chg_pct: number | null;
  pe: number | null;
  roe_pct: number | null;
  roe?: number | null;
  rev_gr_fy: number | null;
  rev_gr_period: string | null;
  profit_gr_q_yoy: number | null;
  profit_gr_quarter: string | null;
  growth_stale: unknown;
  growth_quarter_end?: string | null;
  seen_before?: string | null;
  ema10: number | null;
  vs_ema10: number | null;
  vs_ema10_pct: number | null;
  high_52w: number | null;
  pct_from_52w_high: number | null;
  value_mb_1d: number | null;
  price_stale: boolean;
  bar_date: string | null;
  in_scans: string[];
  events: NewsFlag[];
  watch?: string[];
}

export interface GrowthSection {
  scan: string;
  page: string;
  date: string;
  compared_to: string | null;
  generated_at: string | null;
  counts: Record<'total' | 'new' | 'reentry' | 'stay' | 'dropped' | 'dropped_earlier', number>;
  lookback_days: number;
  signal_d10: SignalD10 | null;
  report_card_href: string;
  rows: GrowthRow[];
  dropped: DroppedRow[];
  dropped_earlier: DroppedRow[];
  headline?: string;
  change_notes?: ChangeNotes;
}

export type GrowthFilter = 'all' | ScanStatus;
export const GROWTH_FILTERS: GrowthFilter[] = ['all', 'new', 'stay'];

export function growthCounts(rows: GrowthRow[]): Record<GrowthFilter, number> {
  const c = { all: rows.length, new: 0, reentry: 0, stay: 0 } as Record<GrowthFilter, number>;
  for (const r of rows) c[r.status]++;
  return c;
}

/** ตัวที่ค่ามากสุดจากค่าจริง (null ไม่นับ) — ใช้กับ "ใกล้ 52W High สุด" / "เหนือ EMA10 มากสุด" */
export function maxBy<T>(rows: T[], f: (r: T) => number | null | undefined): T | null {
  let best: T | null = null;
  let bv = -Infinity;
  for (const r of rows) {
    const v = f(r);
    if (v != null && Number.isFinite(v) && v > bv) { bv = v; best = r; }
  }
  return best;
}

/** '2025-12-31' → 'FY68' · '2026Q3' → 'Q3/69' (ปี พ.ศ. 2 หลัก) */
export function fyLabel(periodEnd: string | null | undefined): string | null {
  const m = /^(\d{4})-/.exec(periodEnd ?? '');
  return m ? `FY${String(Number(m[1]) + 543).slice(-2)}` : null;
}
export function quarterLabel(q: string | null | undefined): string | null {
  const m = /^(\d{4})Q([1-4])$/.exec(q ?? '');
  return m ? `Q${m[2]}/${String(Number(m[1]) + 543).slice(-2)}` : null;
}

// ─── SEPA ──────────────────────────────────────────────────────────────────

export interface SepaRawRow {
  Ticker: string;
  Price?: number | null;
  RS_Rating: number;
  '%_From_High': unknown;
  'ADTV(MB)': number | null;
  Fundamental_Pass?: boolean | null;
  '52W_High'?: number | null;
  VCP_T?: unknown;
  VCP_Contracting?: unknown;
  VCP_ToPivot?: unknown;
  VCP_Pivot?: unknown;
  VCP_Footprint?: unknown;
  VCP_Weeks?: unknown;
  VCP_MaxDepth?: unknown;
  VCP_FinalDepth?: unknown;
  VCP_VolRatio?: unknown;
}

export interface SepaRow extends SepaRawRow {
  status: ScanStatus;
  seen_before?: string | null;
  last_seen: string | null;
  streak_days: number;
  days_web: number | null;
  chg_pct: number | null;
  price_stale: boolean;
  bar_date: string | null;
  price_check: 'ok' | 'mismatch' | null;
  in_scans: string[];
  events: NewsFlag[];
}

export interface SepaSection {
  scan: string;
  page: string;
  date: string;
  compared_to: string | null;
  generated_at: string | null;
  counts: Record<'total' | 'new' | 'reentry' | 'stay' | 'dropped', number>;
  web_diff: { previous_date: string | null; new: number; dropped: number; new_tickers: string[]; dropped_tickers: string[] } | null;
  lookback_days: number;
  signal_d10: SignalD10 | null;
  report_card_href: string;
  rows: SepaRow[];
  prev_rows: SepaRawRow[];
  dropped: DroppedRow[];
}

export interface RankedSepa<T extends SepaRawRow> {
  row: T;
  rank: number;
  score: number;
  tier: Tier;
  fromHigh: number | null;
}

/**
 * อันดับแบบหน้า /sepa (โหมดเริ่มต้น "composite"): กรองชุดสภาพคล่อง → เรียง score มาก→น้อย แล้ว RS มาก→น้อย
 * (Array.sort เป็น stable → เสมอกันคงลำดับไฟล์ เหมือน /sepa) · score = sepaCompositeScore ตัวเดียวกัน
 */
export function rankSepa<T extends SepaRawRow>(rows: T[], liq: LiqSet): RankedSepa<T>[] {
  const scored = rows
    .filter(r => inLiqSet(r['ADTV(MB)'], liq))
    .map(r => {
      const fromHigh = toNum(r['%_From_High']);
      const score = sepaCompositeScore({
        RS_Rating: r.RS_Rating,
        Fundamental_Pass: r.Fundamental_Pass,
        '%_From_High': fromHigh ?? NaN,
      }).total;
      return { row: r, score, fromHigh, tier: tierOf(r) };
    });
  scored.sort((a, b) => b.score - a.score || b.row.RS_Rating - a.row.RS_Rating);
  return scored.map((x, i) => ({ ...x, rank: i + 1 }));
}

export type SepaFilter = 'all' | 'ready' | 'watch' | 'fplus' | 'new' | 'near_high';
export const SEPA_FILTERS: SepaFilter[] = ['all', 'ready', 'watch', 'fplus', 'new', 'near_high'];
export const NEAR_HIGH_PCT = 2;

export function matchSepa(x: RankedSepa<SepaRow>, f: SepaFilter): boolean {
  switch (f) {
    case 'all': return true;
    case 'ready': return x.tier === 'ready';
    case 'watch': return x.tier === 'watch';
    case 'fplus': return x.row.Fundamental_Pass === true;
    case 'new': return x.row.status === 'new';
    case 'near_high': return x.fromHigh != null && x.fromHigh >= -NEAR_HIGH_PCT;
  }
}

export function sepaFilterCounts(rows: RankedSepa<SepaRow>[]): Record<SepaFilter, number> {
  const c = {} as Record<SepaFilter, number>;
  for (const f of SEPA_FILTERS) c[f] = rows.filter(x => matchSepa(x, f)).length;
  return c;
}

/** เรียงตามระยะถึง Pivot: ค่า ≥ 0 น้อย→มาก · ค่าติดลบ (ผ่าน Pivot แล้ว) ต่อท้าย · ไม่มี Pivot ท้ายสุด */
export function pivotSortKey(v: unknown): [number, number] {
  const n = toNum(v);
  if (n == null) return [2, 0];
  if (n < 0) return [1, -n];
  return [0, n];
}
export function comparePivot(a: unknown, b: unknown): number {
  const [ga, va] = pivotSortKey(a);
  const [gb, vb] = pivotSortKey(b);
  return ga - gb || va - vb;
}

export function fplusLabel(v: boolean | null | undefined): string {
  return v === true ? 'F+' : v === false ? 'ไม่มี F+' : 'ไม่มีข้อมูลงบ';
}

// ─── Market Stage ──────────────────────────────────────────────────────────

export interface StageDetail {
  ticker: string;
  is_fund: boolean;
  price: number | null;
  chg_pct: number | null;
  price_stale: boolean;
  bar_date: string | null;
  ema50: number | null;
  ema200: number | null;
  vs_ema200_pct: number | null;
  adtv_mb: number | null;
  pe: number | null;
  roe_pct: number | null;
  days_in_stage: number | null;
  flips_5d: number;
  pct_from_52w_high?: number | null;
}

export interface StageMove extends StageDetail {
  from: string;
  to: string;
  to_bear: boolean;
  /** น่าดู = ADTV/ราคาผ่านเกณฑ์ focus_rule */
  watch: boolean;
  /** บรรทัด "จับตา" (กติกาในสคริปต์) */
  notes?: string[];
}

export interface StageSection {
  scan: string;
  page: string;
  date: string;
  compared_to: string | null;
  stage_order: string[];
  groups: { key: string; label: string; stages: string[] }[];
  counts: { stock: Record<string, number>; fund: Record<string, number> };
  counts_prev: { stock: Record<string, number>; fund: Record<string, number> } | null;
  total_stock: number;
  total_fund: number;
  transitions_total: number;
  focus: StageMove[];
  summary: { from: string; to: string; count: number; examples: string[] }[];
  focus_rule: { stages: string[]; watch_min_adtv_mb: number; watch_min_price: number };
  lists: Record<string, { count: number; rows: StageDetail[] }>;
  list_limit: number;
  flip_days: number;
  price_stale: string[];
  headline?: string;
}

export function sumStages(counts: Record<string, number> | undefined, stages: string[]): number {
  return stages.reduce((s, k) => s + (counts?.[k] ?? 0), 0);
}

/** % ของยอดหุ้นสามัญ (ยอดเดียวกันทุกจุด) */
export function shareOf(n: number, total: number): number {
  return total > 0 ? (n / total) * 100 : 0;
}

// ─── SEPA: ประโยคจากกติกา (ฝั่งหน้าเว็บ เพราะอันดับ / Score / กลุ่ม / Pivot ต้องมาจาก lib เดียวกับ /sepa) ───

const pct1 = (v: number) => `${Math.abs(v).toFixed(1)}%`;
const price2 = (v: number | null) => (v == null ? '—' : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

/** ประโยคเปิดแท็บ SEPA จากอันดับของมุมมองที่เลือก */
export function sepaHeadline(ranked: RankedSepa<SepaRow>[]): string {
  if (!ranked.length) return 'วันนี้ไม่มีหุ้นผ่าน SEPA ในมุมมองนี้';
  const ready = ranked.filter(x => x.tier === 'ready');
  const withPivot = (xs: RankedSepa<SepaRow>[]) =>
    xs.map(x => ({ x, p: toNum(x.row.VCP_ToPivot) })).filter((o): o is { x: RankedSepa<SepaRow>; p: number } => o.p != null && o.p >= 0)
      .sort((a, b) => a.p - b.p);
  const parts: string[] = [ready.length ? `พร้อมยิง ${ready.length} ตัว` : 'ยังไม่มีตัวพร้อมยิง'];
  const near = withPivot(ready)[0] ?? withPivot(ranked)[0];
  if (near) parts.push(near.p < 0.05 ? `${near.x.row.Ticker} อยู่ที่ Pivot พอดี` : `${near.x.row.Ticker} ห่าง Pivot แค่ ${pct1(near.p)}`);
  const top = ranked[0];
  parts.push(`อันดับ 1 ${top.row.Ticker} Score ${Math.round(top.score)}`);
  return parts.join(' · ');
}

/** บรรทัด "จับตา" ของการ์ด SEPA (≤ 2 วลี เรียงตามความสำคัญ) */
export function sepaWatch(x: RankedSepa<SepaRow>): string[] {
  const out: string[] = [];
  const toPivot = toNum(x.row.VCP_ToPivot);
  const pivot = toNum(x.row.VCP_Pivot);
  if (x.row.price_stale) out.push('⚠️ ราคาค้าง');
  if (x.tier === 'ready' && toPivot != null) {
    out.push(toPivot < 0.05
      ? `อยู่ที่ Pivot ${price2(pivot)} พอดี — เบรคพร้อมวอลุ่ม = จุดซื้อ`
      : `ห่าง Pivot ${price2(pivot)} อีก ${pct1(toPivot)} — เบรคพร้อมวอลุ่ม = จุดซื้อ`);
  }
  else if (toPivot != null && toPivot < 0) out.push(`ผ่าน Pivot ไปแล้ว ${pct1(toPivot)} — ไม่ไล่ รอฐานใหม่`);
  else if (vcpFootprint(x.row) == null) out.push('ยังไม่มีฐาน — เฝ้าดู');
  else if (toPivot != null) out.push(`ห่าง Pivot ${price2(pivot)} อีก ${pct1(toPivot)} — ยังไม่เข้าเกณฑ์พร้อมยิง`);
  if (x.fromHigh != null && x.fromHigh >= -NEAR_HIGH_PCT) out.push('ชิด High รอบปี');
  return out.slice(0, 2);
}

// ─── "พรุ่งนี้ดูตัวไหน" — เกณฑ์เลือกหุ้นของแต่ละแท็บ (ฟังก์ชันล้วน มี test) ─────────────────────────

export const WATCH_NEAR_HIGH_PCT = 3; // Growth: ห่าง 52W High ≤ 3%
export const WATCH_EMA10_THIN_PCT = 1; // Growth: เหนือ EMA10 < 1%

export type GrowthWatchReason = 'near_high' | 'thin_ema10' | 'new';
export const GROWTH_REASON_LABEL: Record<GrowthWatchReason, string> = {
  near_high: 'ใกล้ High',
  thin_ema10: 'เกาะ EMA10 บาง',
  new: 'เข้าใหม่',
};

/** Growth: ตัวที่ ห่าง High ≤ 3% · เหนือ EMA10 < 1% · หรือ NEW วันนี้ — ตัวเดียวเข้าหลายเกณฑ์แสดงครั้งเดียว (reasons รวมให้) */
export function growthWatchlist(rows: GrowthRow[]): { row: GrowthRow; reasons: GrowthWatchReason[] }[] {
  const out: { row: GrowthRow; reasons: GrowthWatchReason[] }[] = [];
  for (const row of rows) {
    const reasons: GrowthWatchReason[] = [];
    if (row.pct_from_52w_high != null && row.pct_from_52w_high >= -WATCH_NEAR_HIGH_PCT) reasons.push('near_high');
    if (row.vs_ema10_pct != null && row.vs_ema10_pct < WATCH_EMA10_THIN_PCT) reasons.push('thin_ema10');
    if (row.status === 'new') reasons.push('new');
    if (reasons.length) out.push({ row, reasons });
  }
  return out;
}

/** SEPA: เฉพาะพร้อมยิงของมุมมองที่ส่งเข้ามา (rankSepa แล้ว) เรียงระยะถึง Pivot ใกล้ → ไกล (ผ่าน Pivot แล้ว/ไม่มี Pivot ท้ายสุด) */
export function sepaReadyList(ranked: RankedSepa<SepaRow>[]): RankedSepa<SepaRow>[] {
  return ranked.filter(x => x.tier === 'ready').sort((a, b) => comparePivot(a.row.VCP_ToPivot, b.row.VCP_ToPivot) || a.rank - b.rank);
}

/** Stage: "เพิ่งเข้ากลุ่มสะสม/ฟื้นตัว" = ย้ายเข้า stage ใน focus_rule.stages จากนอกกลุ่ม · "หลุดลงขาลง" = to_bear · เฉพาะสภาพคล่องดี (watch) */
export function stageWatchLists(ms: StageSection): { entered: StageMove[]; fellToBear: StageMove[] } {
  const base = new Set(ms.focus_rule.stages);
  const liquid = ms.focus.filter(m => m.watch);
  return {
    entered: liquid.filter(m => base.has(m.to) && !base.has(m.from)),
    fellToBear: liquid.filter(m => m.to_bear),
  };
}
