// /earnings definitions - one place for the rules the page shows (turnaround,
// ⚡ acceleration, PEAD) plus the sara-am text fix. The batch side has a Python
// twin of each rule in scripts/fetch_earnings.py (meaningful_yoy,
// is_previous_quarter, classify_profit_acceleration) and
// scripts/extract_reason.py (fix_sara_am) - keep both in sync by hand.

import type { EarningsBucket } from './earningsBucket';

export interface EarningsFigures {
  quarter?: string | null;
  netProfit: number | null;
  netProfitPrior: number | null;
  netProfitPriorQ?: number | null;
  priorQuarter?: string | null;
  netProfitPriorQPrior?: number | null;
  bucket?: EarningsBucket | null;
  gap_pct?: number | null;
  drift_d1_pct?: number | null;
  drift_d2_pct?: number | null;
  drift_d5_pct?: number | null;
  price_path?: { pre: (number | null)[]; post: (number | null)[] } | null;
}

// ── Sara am ──────────────────────────────────────────────────────────────────
// SET's MD&A PDFs break ำ (U+0E33) two ways: nikhahit + sara aa (U+0E4D U+0E32,
// "สําคัญ") or a stray space before it ("จ ำนวน", "ก ำไร"). ำ never starts a
// word, so dropping whitespace in front of it is always safe.
const SARA_AM = String.fromCharCode(0x0e33);
const NIKHAHIT_AA = new RegExp(String.fromCharCode(0x0e4d, 0x0e32), 'g');
const SPACE_SARA_AM = new RegExp(`\\s+${SARA_AM}`, 'g');

export function fixSaraAm(text: string): string {
  return text.replace(NIKHAHIT_AA, SARA_AM).replace(SPACE_SARA_AM, SARA_AM);
}

// ── MD&A reason preview ──────────────────────────────────────────────────────
// extract_reason.py sometimes lands on a financial table instead of a sentence
// ("รวมรายได้ ... 4,604.7 4,112.0 12.0 3,821.4 ..."). That reads as noise under a
// ticker, so the one-line preview hides it; the expanded row still shows the
// full text.
const NUMERIC_CHAR = /[0-9%.,]/g;
const NUMERIC_TOKEN = /^[()\-+]*\d[\d.,%()\-+]*$/;
export const TABLE_LIKE_RATIO = 0.35;
export const TABLE_LIKE_RUN = 4;

/** True when the text is mostly a table: > 35% of the non-space characters are
 *  digits / % / . / , - or more than 4 numeric tokens sit side by side. */
export function isTableLikeReason(text: string | null | undefined): boolean {
  const t = (text ?? '').trim();
  if (!t) return false;
  const chars = t.replace(/\s/g, '');
  const numeric = chars.match(NUMERIC_CHAR)?.length ?? 0;
  if (numeric / chars.length > TABLE_LIKE_RATIO) return true;
  let run = 0;
  for (const tok of t.split(/\s+/)) {
    run = NUMERIC_TOKEN.test(tok) ? run + 1 : 0;
    if (run > TABLE_LIKE_RUN) return true;
  }
  return false;
}

/** The line shown under a ticker: the fixed reason text, or '' when there is none
 *  or it is table-like. Never a placeholder. */
export function reasonPreview(reason: string | null | undefined): string {
  const fixed = reason ? fixSaraAm(reason) : '';
  return isTableLikeReason(fixed) ? '' : fixed;
}

// ── YoY / turnaround ─────────────────────────────────────────────────────────

/** %YoY only off a profit base (last year > 0). A loss/zero base gives a
 *  meaningless % (SCC -669M → +2,386M = "+456%") - that is a turnaround. */
export function meaningfulYoY(netProfit: number | null | undefined, netProfitPrior: number | null | undefined): number | null {
  if (netProfit == null || netProfitPrior == null || netProfitPrior <= 0) return null;
  return ((netProfit - netProfitPrior) / netProfitPrior) * 100;
}

/** พลิกกำไร: last year ≤ 0, this year > 0. Shown as a label, never as a %. */
export function isTurnaround(a: Pick<EarningsFigures, 'netProfit' | 'netProfitPrior'>): boolean {
  return a.netProfit != null && a.netProfitPrior != null && a.netProfitPrior <= 0 && a.netProfit > 0;
}

const QUARTER_RE = /ไตรมาส\s*(\d)\/(\d{4})/;

/** Back-to-back quarterly filings only (Q2 → Q3 of the same year). */
export function isPreviousQuarter(quarter: string | null | undefined, priorQuarter: string | null | undefined): boolean {
  const m1 = QUARTER_RE.exec(quarter ?? '');
  const m2 = QUARTER_RE.exec(priorQuarter ?? '');
  if (!m1 || !m2) return false;
  return m1[2] === m2[2] && Number(m2[1]) === Number(m1[1]) - 1;
}

/** Last quarter's own %YoY - null when that quarter isn't the one right
 *  before this filing, or its year-ago base wasn't a profit. */
export function priorQuarterYoY(a: EarningsFigures): number | null {
  if (!isPreviousQuarter(a.quarter, a.priorQuarter)) return null;
  return meaningfulYoY(a.netProfitPriorQ, a.netProfitPriorQPrior);
}

/** ⚡ เร่งตัว: this quarter's %YoY > 0 and > last quarter's %YoY. No last-quarter
 *  figure → no badge. */
export function isAccelerating(a: EarningsFigures): boolean {
  const yoy = meaningfulYoY(a.netProfit, a.netProfitPrior);
  const prev = priorQuarterYoY(a);
  return yoy != null && prev != null && yoy > 0 && yoy > prev;
}

export const PEAD_MIN_YOY = 20;

/** PEAD: good results (YoY ≥ 20% or turnaround) and the price still up 2
 *  trading days later (D+2 > 0). */
export function isPead(a: EarningsFigures): boolean {
  const yoy = meaningfulYoY(a.netProfit, a.netProfitPrior);
  const good = (yoy != null && yoy >= PEAD_MIN_YOY) || isTurnaround(a);
  return good && a.drift_d2_pct != null && a.drift_d2_pct > 0;
}

/** PEAD list, best D+2 first. */
export function peadRanked<T extends EarningsFigures>(list: T[]): T[] {
  return list.filter(isPead).sort((x, y) => (y.drift_d2_pct ?? 0) - (x.drift_d2_pct ?? 0));
}

// ── Summary buckets ──────────────────────────────────────────────────────────

const IMPROVED: EarningsBucket[] = ['profit_growth', 'turnaround', 'loss_shrink'];
const WORSENED: EarningsBucket[] = ['profit_shrink', 'loss_worse'];

export function isImproved(b: EarningsBucket | null | undefined): boolean {
  return b != null && IMPROVED.includes(b);
}
export function isWorsened(b: EarningsBucket | null | undefined): boolean {
  return b != null && WORSENED.includes(b);
}

/** Did last quarter improve vs its own year-ago? null = no back-to-back data. */
export function priorQuarterImproved(a: EarningsFigures): boolean | null {
  if (!isPreviousQuarter(a.quarter, a.priorQuarter)) return null;
  const np = a.netProfitPriorQ, prior = a.netProfitPriorQPrior;
  if (np == null || prior == null || prior === 0) return null;
  if (np > 0 && prior > 0) return np >= prior;
  if (np > 0) return true;   // loss -> profit
  if (prior > 0) return false; // profit -> loss
  return np > prior;          // smaller loss
}

// ── Price path (mini chart) ──────────────────────────────────────────────────

export interface PricePoint { x: number; y: number }

/** Points for the chart, x = trading day vs the first reaction day (0):
 *  pre-announcement closes at x ≤ -1 (the last one is the base, 0%), then
 *  วันแรก at 0 and D+1..D+5. Without a stored path (older data) the chart is
 *  just base 0% → วันแรก / +1 / +2 / +5. */
export function pricePath(a: EarningsFigures): { pre: PricePoint[]; post: PricePoint[] } {
  const p = a.price_path;
  if (p && p.post?.length) {
    const pre = p.pre
      .map((y, i) => ({ x: i - p.pre.length, y }))
      .filter((pt): pt is PricePoint => pt.y != null);
    const post = p.post
      .map((y, i) => ({ x: i, y }))
      .filter((pt): pt is PricePoint => pt.y != null);
    return { pre: pre.length ? pre : [{ x: -1, y: 0 }], post };
  }
  const post: PricePoint[] = [];
  const add = (x: number, y: number | null | undefined) => { if (y != null) post.push({ x, y }); };
  add(0, a.gap_pct);
  add(1, a.drift_d1_pct);
  add(2, a.drift_d2_pct);
  add(5, a.drift_d5_pct);
  return { pre: [{ x: -1, y: 0 }], post };
}
