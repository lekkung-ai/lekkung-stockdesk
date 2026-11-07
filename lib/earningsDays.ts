// /earnings "รายวัน" view: group the (already filtered + sorted) rows by announcement
// day, newest day first, and the numbers in each day's header. Display only - buckets
// come from pageBucket(), "กำไรดีขึ้น" from isImproved(), % from meaningfulYoY().

import type { EarningsBucket } from './earningsBucket';
import { isImproved, meaningfulYoY } from './earningsMetrics';
import { pageBucket } from './earningsView';

export type EarningsView = 'day' | 'list';
export const DEFAULT_VIEW: EarningsView = 'day';

/** ?view=day|list → view; anything else (missing, typo) → รายวัน. */
export function parseView(v: string | null | undefined): EarningsView {
  return v === 'list' ? 'list' : v === 'day' ? 'day' : DEFAULT_VIEW;
}

/** The query string with ?view set, every other parameter kept ("" when none is left). */
export function withView(search: string, view: EarningsView): string {
  const p = new URLSearchParams(search);
  p.set('view', view);
  const s = p.toString();
  return s ? `?${s}` : '';
}

interface DayFields {
  ticker: string;
  announceDate: string | null;
  bucket?: EarningsBucket | null;
  netProfit: number | null;
  netProfitPrior: number | null;
}

/** Bangkok calendar day of the filing ("2026-11-06T17:58:00+07:00" → "2026-11-06"). */
export function announceDay(a: Pick<DayFields, 'announceDate'>): string {
  return (a.announceDate ?? '').slice(0, 10);
}

export interface DayGroup<T> { day: string; rows: T[] }

/** Rows grouped by announcement day, newest day first; inside a day the rows keep the
 *  order they came in (the table's sort). Rows without a date are left out. */
export function groupByDay<T extends Pick<DayFields, 'announceDate'>>(rows: T[]): DayGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const a of rows) {
    const d = announceDay(a);
    if (!d) continue;
    const list = map.get(d);
    if (list) list.push(a); else map.set(d, [a]);
  }
  return [...map.entries()]
    .sort(([x], [y]) => (x < y ? 1 : x > y ? -1 : 0))
    .map(([day, rows]) => ({ day, rows }));
}

export interface DaySummary {
  n: number;
  /** per bucket; a row with no bucket counts as ไม่มีฐานเทียบ */
  counts: Partial<Record<EarningsBucket, number>>;
  /** rows with something to compare (bucket set and not ไม่มีฐานเทียบ) */
  base: number;
  /** กำไรโต + พลิกกำไร + ขาดทุนลดลง */
  improved: number;
  /** round(improved / base * 100); null when base is 0 */
  improvedPct: number | null;
  /** โตสุดของวัน: highest %YoY among กำไรโต rows only (never a turnaround) */
  best: { ticker: string; yoy: number } | null;
}

export function summarizeDay(rows: DayFields[]): DaySummary {
  const counts: Partial<Record<EarningsBucket, number>> = {};
  let base = 0, improved = 0;
  let best: DaySummary['best'] = null;
  for (const a of rows) {
    const b = pageBucket(a) ?? 'no_base';
    counts[b] = (counts[b] ?? 0) + 1;
    if (b !== 'no_base') base++;
    if (isImproved(b)) improved++;
    if (b === 'profit_growth') {
      const yoy = meaningfulYoY(a.netProfit, a.netProfitPrior);
      if (yoy != null && (!best || yoy > best.yoy)) best = { ticker: a.ticker, yoy };
    }
  }
  return {
    n: rows.length, counts, base, improved,
    improvedPct: base ? Math.round((improved / base) * 100) : null,
    best,
  };
}

const WEEKDAY = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

/** "2026-11-06" → "ศ. 6 พ.ย." */
export function dayLabel(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  if (!y || !m || !d) return day;
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAY[wd]} ${d} ${MONTHS[m - 1]}`;
}

/** Days open by default: the 2 newest. */
export const DAYS_OPEN_BY_DEFAULT = 2;
/** Day cards above the table: the newest 12 days that have a filing. */
export const DAY_CARDS = 12;
