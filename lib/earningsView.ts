// /earnings view helpers: one money format for every amount on the page, the tab a
// filing is filed under, and the season counts behind the header stats. Display
// only - the bucket rule (classifyBucket) and the ⚡ / PEAD / turnaround rules in
// earningsMetrics.ts are untouched.

import type { EarningsBucket } from './earningsBucket';
import { isImproved, isWorsened } from './earningsMetrics';

/** Baht → "ล." / "พันล." everywhere on the page (this quarter, last year, last quarter,
 *  9 months, the 5-quarter bars, the expanded row): ≥ 1,000 ล. → "พันล." 2 decimals,
 *  ≥ 1 ล. → 1 decimal, below 1 ล. → 2 decimals (−585,000 → "-0.59 ล."), so a small
 *  figure never shows as a bare baht number next to the others. */
export function fmtMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)} พันล.`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)} ล.`;
  // round in whole 10,000-baht steps: (585000 / 1e6).toFixed(2) is "0.58" (binary float)
  const m = (Math.round(abs / 1e4) / 100).toFixed(2);
  return `${m === '0.00' ? '' : sign}${m} ล.`;
}

interface BucketFields {
  bucket?: EarningsBucket | null;
  netProfit?: number | null;
}

/** A filing with no profit figure at all (e.g. a fund / REIT F45: CTARAF, BAREIT). */
export function hasNoProfit(a: BucketFields): boolean {
  return a.netProfit == null;
}

/** Tab on /earnings. classifyBucket() gives no bucket when this period's profit is
 *  unknown, which used to leave such a row outside every tab but "ทั้งหมด" - the page
 *  files it under "ไม่มีฐานเทียบ" instead. Every other row keeps its own bucket. */
export function pageBucket(a: BucketFields): EarningsBucket | null {
  return a.bucket ?? (hasNoProfit(a) ? 'no_base' : null);
}

export interface SeasonCounts {
  /** every filing of the season ("ประกาศแล้ว") */
  n: number;
  /** of those, no profit figure at all */
  noProfit: number;
  /** base of the proportions = n - noProfit */
  base: number;
  up: number;
  down: number;
  /** % of base that improved (0 when base is 0) */
  upPct: number;
}

/** Header numbers: "ประกาศแล้ว" counts every filing; the improved / worse split and its
 *  % only count filings that have a profit figure. */
export function seasonCounts(rows: BucketFields[]): SeasonCounts {
  const n = rows.length;
  const noProfit = rows.filter(hasNoProfit).length;
  const base = n - noProfit;
  const withProfit = rows.filter(a => !hasNoProfit(a));
  const up = withProfit.filter(a => isImproved(a.bucket)).length;
  const down = withProfit.filter(a => isWorsened(a.bucket)).length;
  return { n, noProfit, base, up, down, upPct: base ? Math.round((up / base) * 100) : 0 };
}
