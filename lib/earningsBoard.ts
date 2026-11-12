// /earnings 3-layer board (mock earnings_v3, 12 Nov 2569): the "น่าสนใจ" score, the
// sector box (กลุ่มไหนงบดี / แย่), เด่นของวัน, the low-liquidity / fund folds, the 4 sort
// orders and the URL state. Display only - buckets come from pageBucket(), ⚡ from
// isAccelerating(), PEAD from isPead(), the liquidity line from PEAD_MIN_ADTV_MB
// (earningsMetrics.ts). Nothing here changes those rules.

import { BUCKET_ORDER, type EarningsBucket } from './earningsBucket';
import { isAccelerating, isImproved, meaningfulYoY, PEAD_MIN_ADTV_MB, type EarningsFigures } from './earningsMetrics';
import { hasNoProfit, pageBucket } from './earningsView';
import { auditorWarn, weinsteinWarn, type PeadExtra } from './peadExtras';
import { parseView, type EarningsView } from './earningsDays';

// ── Liquidity ────────────────────────────────────────────────────────────────

/** ADTV ≥ PEAD_MIN_ADTV_MB (million baht / day). No ADTV → not liquid. */
export function isLiquid(adtvMb: number | null | undefined): boolean {
  return adtvMb != null && Number.isFinite(adtvMb) && adtvMb >= PEAD_MIN_ADTV_MB;
}

// ── "น่าสนใจ" score ──────────────────────────────────────────────────────────
// ค่าทดลอง 12 พ.ย. 2569 - weights live only here; the page's "วิธีอ่าน" box reads them too.
export const INTEREST_WEIGHTS = {
  /** กำไรโต / พลิกกำไร */
  growth: 2,
  /** ขาดทุนลดลง */
  lossShrink: 1,
  /** %YoY ≥ INTEREST_YOY_MIN (meaningful YoY only) */
  bigYoY: 1,
  /** ⚡ เร่งตัว */
  accel: 2,
  /** per scan the stock sits in, at most INTEREST_MAX_SCANS scans */
  perScan: 2,
  /** Market Stage S.Bull / Bull */
  stageUp: 2,
  /** RS ≥ INTEREST_RS_MIN */
  rs: 1,
  /** ADTV below PEAD_MIN_ADTV_MB, or no ADTV */
  illiquid: -4,
  /** ผู้สอบบัญชี มีเงื่อนไข / ไม่แสดงความเห็น (red auditor badge) */
  auditorRed: -3,
  /** Weinstein Stage 3 */
  weinstein3: -1,
} as const;
export const INTEREST_YOY_MIN = 20;
export const INTEREST_MAX_SCANS = 3;
export const INTEREST_RS_MIN = 80;
export const INTEREST_UP_STAGES = ['S.Bull', 'Bull'];

export type ScoreInput = EarningsFigures & { auditorOpinion?: string | null };

export function interestScore(a: ScoreInput, extra: PeadExtra | undefined): number {
  const W = INTEREST_WEIGHTS;
  const b = pageBucket(a);
  let s = 0;
  if (b === 'profit_growth' || b === 'turnaround') s += W.growth;
  else if (b === 'loss_shrink') s += W.lossShrink;
  const yoy = meaningfulYoY(a.netProfit, a.netProfitPrior);
  if (yoy != null && yoy >= INTEREST_YOY_MIN) s += W.bigYoY;
  if (isAccelerating(a)) s += W.accel;
  s += W.perScan * Math.min(extra?.scans?.length ?? 0, INTEREST_MAX_SCANS);
  if (extra?.stage && INTEREST_UP_STAGES.includes(extra.stage)) s += W.stageUp;
  if (extra?.rs != null && extra.rs >= INTEREST_RS_MIN) s += W.rs;
  if (!isLiquid(extra?.adtv)) s += W.illiquid;
  if (auditorWarn(a.auditorOpinion)?.level === 'red') s += W.auditorRed;
  if (weinsteinWarn(extra?.wein)) s += W.weinstein3;
  return s;
}

// ── Sector box ───────────────────────────────────────────────────────────────

interface GroupFields { sector?: string | null; subsector?: string | null; market?: string | null }

/** Subsector; a mai stock (no subsector) → "<sector> (mai)". */
export function boardGroup(a: GroupFields): string {
  const sub = (a.subsector ?? '').trim();
  if (sub) return sub;
  const sec = (a.sector ?? '').trim();
  if (!sec) return '';
  return (a.market ?? '').toLowerCase() === 'mai' ? `${sec} (mai)` : sec;
}

export type SectorScope = 'day' | 'q';
/** Smallest group shown: 3 companies for one day, 5 for the whole quarter. */
export const SECTOR_MIN: Record<SectorScope, number> = { day: 3, q: 5 };
export const SECTOR_TOP = 5;

export interface SectorRow {
  group: string;
  /** companies with a base (no_base left out) */
  n: number;
  /** round(improved / n * 100) */
  pct: number;
  counts: Partial<Record<EarningsBucket, number>>;
}

type SectorInput = GroupFields & { bucket?: EarningsBucket | null; netProfit?: number | null };

/** Best SECTOR_TOP and worst SECTOR_TOP groups (never the same group twice). % = กำไรโต /
 *  พลิกกำไร / ขาดทุนลดลง over the companies that have a base (ไม่มีฐานเทียบ is not counted,
 *  and does not count toward the minimum). Ties: bigger group first. */
export function sectorBoard(rows: SectorInput[], minN: number): { best: SectorRow[]; worst: SectorRow[] } {
  const g = new Map<string, SectorInput[]>();
  for (const a of rows) {
    const b = pageBucket(a);
    if (!b || b === 'no_base') continue;
    const k = boardGroup(a);
    if (!k) continue;
    const list = g.get(k);
    if (list) list.push(a); else g.set(k, [a]);
  }
  const all: SectorRow[] = [];
  for (const [group, list] of g) {
    if (list.length < minN) continue;
    const counts: Partial<Record<EarningsBucket, number>> = {};
    for (const a of list) { const b = pageBucket(a)!; counts[b] = (counts[b] ?? 0) + 1; }
    const up = list.filter(a => isImproved(pageBucket(a))).length;
    all.push({ group, n: list.length, pct: Math.round((up / list.length) * 100), counts });
  }
  const best = [...all].sort((x, y) => y.pct - x.pct || y.n - x.n || x.group.localeCompare(y.group)).slice(0, SECTOR_TOP);
  const worst = [...all]
    .sort((x, y) => x.pct - y.pct || y.n - x.n || x.group.localeCompare(y.group))
    .filter(r => !best.includes(r))
    .slice(0, SECTOR_TOP);
  return { best, worst };
}

// ── เด่นของวัน ───────────────────────────────────────────────────────────────

export const HIGHLIGHT_TOP = 6;

/** Filings of `day` that are กำไรโต or พลิกกำไร and liquid, best score first, then ADTV.
 *  `total` = every filing of that day. */
export function dayHighlights<T extends ScoreInput & { announceDate: string | null }>(
  rows: T[], day: string, extraOf: (a: T) => PeadExtra | undefined,
): { passed: T[]; total: number } {
  const ofDay = rows.filter(a => (a.announceDate ?? '').slice(0, 10) === day);
  const passed = ofDay
    .filter(a => {
      const b = pageBucket(a);
      return (b === 'profit_growth' || b === 'turnaround') && isLiquid(extraOf(a)?.adtv);
    })
    .map(a => ({ a, s: interestScore(a, extraOf(a)), v: extraOf(a)?.adtv ?? 0 }))
    .sort((x, y) => y.s - x.s || y.v - x.v)
    .map(x => x.a);
  return { passed, total: ofDay.length };
}

// ── Folds ────────────────────────────────────────────────────────────────────

/** Rows split for one day (or the whole list): shown, low-liquidity (folded when
 *  `hideIlliquid`), funds / REITs (no profit at all - always folded). */
export function foldRows<T extends { netProfit: number | null }>(
  rows: T[], hideIlliquid: boolean, adtvOf: (a: T) => number | null | undefined,
): { shown: T[]; illiquid: T[]; funds: T[] } {
  const shown: T[] = [], illiquid: T[] = [], funds: T[] = [];
  for (const a of rows) {
    if (hasNoProfit(a)) funds.push(a);
    else if (hideIlliquid && !isLiquid(adtvOf(a))) illiquid.push(a);
    else shown.push(a);
  }
  return { shown, illiquid, funds };
}
/** Names listed on a folded line. */
export const FOLD_NAMES = 14;

// ── Sort ─────────────────────────────────────────────────────────────────────

export type BoardSort = 'score' | 'time' | 'yoy' | 'adtv';
export const BOARD_SORTS: BoardSort[] = ['score', 'time', 'yoy', 'adtv'];
export const DEFAULT_SORT: BoardSort = 'score';
export const SORT_LABEL: Record<BoardSort, string> = {
  score: 'น่าสนใจก่อน', time: 'เวลาประกาศ', yoy: 'กำไรโตมากสุด', adtv: 'สภาพคล่องมากสุด',
};

type SortInput = ScoreInput & { announceDate: string | null; ticker: string };

/** Comparator for one sort order. score: score, then ADTV · time: newest filing first ·
 *  yoy: พลิกกำไร on top, then %YoY (meaningful only), rows without a % last · adtv: most
 *  traded first, no ADTV last. Ties fall back to newest filing, then ticker. */
export function boardComparator<T extends SortInput>(sort: BoardSort, extraOf: (a: T) => PeadExtra | undefined): (x: T, y: T) => number {
  const time = (x: T, y: T) => (y.announceDate ?? '').localeCompare(x.announceDate ?? '') || x.ticker.localeCompare(y.ticker);
  const adtv = (a: T) => extraOf(a)?.adtv ?? -1;
  if (sort === 'time') return time;
  if (sort === 'adtv') return (x, y) => adtv(y) - adtv(x) || time(x, y);
  if (sort === 'yoy') {
    const v = (a: T) => pageBucket(a) === 'turnaround' ? Infinity : meaningfulYoY(a.netProfit, a.netProfitPrior) ?? -Infinity;
    return (x, y) => {
      const a = v(x), b = v(y);
      return a === b ? time(x, y) : b > a ? 1 : -1;
    };
  }
  const memo = new Map<T, number>();
  const sc = (a: T) => { let s = memo.get(a); if (s == null) { s = interestScore(a, extraOf(a)); memo.set(a, s); } return s; };
  return (x, y) => sc(y) - sc(x) || adtv(y) - adtv(x) || time(x, y);
}

// ── URL ──────────────────────────────────────────────────────────────────────

export type BoardFilter = 'acc' | 'scan' | 'pead';
export const BOARD_FILTERS: BoardFilter[] = ['acc', 'scan', 'pead'];
export const ALL_QUARTERS_PARAM = 'all';

export interface BoardQuery {
  /** YYYY-MM-DD, or null = newest day with a filing (checked against the data later) */
  day: string | null;
  scope: SectorScope;
  /** ซ่อนสภาพคล่องต่ำ (default on; ?liq=0 = off) */
  hideIlliquid: boolean;
  sort: BoardSort;
  filters: BoardFilter[];
  tab: EarningsBucket | null;
  view: EarningsView;
  q: string;
  /** quarter label, ALL_QUARTERS_PARAM, or null = the season quarter */
  quarter: string | null;
}

export const DEFAULT_QUERY: BoardQuery = {
  day: null, scope: 'day', hideIlliquid: true, sort: DEFAULT_SORT, filters: [], tab: null, view: 'day', q: '', quarter: null,
};

// The table's old column-sort keys → the closest of the 4 orders (anything else → default).
const LEGACY_SORT: Record<string, BoardSort> = { announceDate: 'time', yoy: 'yoy', interest: 'score' };

export function parseSort(v: string | null | undefined): BoardSort {
  if (!v) return DEFAULT_SORT;
  if ((BOARD_SORTS as string[]).includes(v)) return v as BoardSort;
  return LEGACY_SORT[v] ?? DEFAULT_SORT;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Query string → state. Every bad value falls back to its default. */
export function parseBoardQuery(search: string): BoardQuery {
  const p = new URLSearchParams(search);
  const day = p.get('day');
  const tab = p.get('tab');
  const f = (p.get('f') ?? '').split(',').filter((x): x is BoardFilter => (BOARD_FILTERS as string[]).includes(x));
  return {
    day: day && DAY_RE.test(day) ? day : null,
    scope: p.get('scope') === 'q' ? 'q' : 'day',
    hideIlliquid: p.get('liq') !== '0',
    sort: parseSort(p.get('sort')),
    filters: [...new Set(f)],
    tab: tab && (BUCKET_ORDER as string[]).includes(tab) ? (tab as EarningsBucket) : null,
    view: parseView(p.get('view')),
    q: (p.get('q') ?? '').trim().toUpperCase().slice(0, 20),
    quarter: p.get('quarter') || null,
  };
}

/** State → query string ("" when everything is default). Defaults are left out of the
 *  URL (the page passes day = null for the newest day); unknown params are kept. */
export function boardQueryString(s: BoardQuery, keep = ''): string {
  const p = new URLSearchParams(keep);
  for (const k of ['day', 'scope', 'liq', 'sort', 'f', 'tab', 'view', 'q', 'quarter']) p.delete(k);
  if (s.day) p.set('day', s.day);
  if (s.scope !== 'day') p.set('scope', s.scope);
  if (!s.hideIlliquid) p.set('liq', '0');
  if (s.sort !== DEFAULT_SORT) p.set('sort', s.sort);
  const f = BOARD_FILTERS.filter(k => s.filters.includes(k));
  if (f.length) p.set('f', f.join(','));
  if (s.tab) p.set('tab', s.tab);
  if (s.view !== 'day') p.set('view', s.view);
  if (s.q) p.set('q', s.q);
  if (s.quarter) p.set('quarter', s.quarter);
  const out = p.toString();
  return out ? `?${out}` : '';
}
