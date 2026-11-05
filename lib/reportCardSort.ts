// Sorting for the /report-card/[scan] setup tables. One sort state lives in the URL:
//   ?sort=<key>&dir=asc|desc
// Column headers and the "เรียงตาม" dropdown both read/write it (no second state).
// Old links keep working: sort=latest|best|worst|giveback (dir optional).

import type { SetupEntry } from '@/lib/reportCard';

export type SortKey =
  | 'ticker' | 'entry' | 'exit' | 'hold' | 'ret' | 'mfe' | 'mae' | 'stage' | 'reason' | 'giveback';
export type SortDir = 'asc' | 'desc';
export interface SortState { key: SortKey; dir: SortDir }

export const STAGE_ORDER = ['S.Bull', 'Bull', 'Accumulation', 'Recovery', 'Warning', 'Distribution', 'Bear', 'ไม่มีข้อมูล'];
// ยังถือ > หลุดสแกน > ติดสแกนวันเดียว
const REASON_ORDER = ['open', 'left_scan', 'single_day'];

/** Column names as shown in the "เรียงตาม …" line and the custom dropdown option. */
export const SORT_LABELS: Record<SortKey, string> = {
  ticker: 'หุ้น',
  entry: 'วันที่ซื้อ',
  exit: 'วันที่ขาย/ล่าสุด',
  hold: 'ถือ (วัน)',
  ret: 'ผลตอบแทน',
  mfe: 'ขึ้นสูงสุด',
  mae: 'ลงต่ำสุด',
  stage: 'stage ตอนเข้า',
  reason: 'ปิดเพราะ',
  giveback: 'หลุดมือ (MFE − ผล)',
};

// First click: ordered columns (ticker / stage / reason) go in their listed order, the rest high -> low.
const ASC_FIRST: SortKey[] = ['ticker', 'stage', 'reason'];
export const defaultDir = (key: SortKey): SortDir => (ASC_FIRST.includes(key) ? 'asc' : 'desc');
export const DEFAULT_SORT: SortState = { key: 'entry', dir: 'desc' };

const LEGACY: Record<string, SortState> = {
  latest: { key: 'entry', dir: 'desc' },
  best: { key: 'ret', dir: 'desc' },
  worst: { key: 'ret', dir: 'asc' },
  giveback: { key: 'giveback', dir: 'desc' },
};

/** Dropdown presets (value -> sort). 'giveback' has no column, so it only exists here. */
export const PRESETS: { value: string; label: string; sort: SortState }[] = [
  { value: 'latest', label: 'วันที่เข้าล่าสุดก่อน', sort: LEGACY.latest },
  { value: 'best', label: 'ผลตอบแทนมากสุดก่อน', sort: LEGACY.best },
  { value: 'worst', label: 'ผลตอบแทนน้อยสุดก่อน', sort: LEGACY.worst },
  { value: 'giveback', label: 'หลุดมือมากสุดก่อน (MFE − ผล)', sort: LEGACY.giveback },
];

const KEYS = Object.keys(SORT_LABELS) as SortKey[];
const isKey = (v: string | null): v is SortKey => !!v && (KEYS as string[]).includes(v);

/** URL params -> sort state. Unknown/missing values fall back to the default. */
export function parseSort(sort: string | null, dir: string | null): SortState {
  const d = dir === 'asc' || dir === 'desc' ? dir : null;
  if (sort && sort in LEGACY && !isKey(sort)) return d ? { ...LEGACY[sort], dir: d } : LEGACY[sort];
  if (isKey(sort)) return { key: sort, dir: d ?? defaultDir(sort) };
  return DEFAULT_SORT;
}

export const sameSort = (a: SortState, b: SortState) => a.key === b.key && a.dir === b.dir;

/** The dropdown preset equal to this state, if any. */
export const presetFor = (s: SortState) => PRESETS.find(p => sameSort(p.sort, s));

/** "มาก→น้อย" for numbers and dates; ordered columns read "ตามลำดับ" / "ย้อนลำดับ". */
export function dirLabel(s: SortState): string {
  if (ASC_FIRST.includes(s.key)) return s.dir === 'asc' ? 'ตามลำดับ' : 'ย้อนลำดับ';
  return s.dir === 'desc' ? 'มาก→น้อย' : 'น้อย→มาก';
}

/** Query-string params for a state (default direction of a column is left out). */
export function sortParams(s: SortState): { sort: string | null; dir: string | null } {
  if (sameSort(s, DEFAULT_SORT)) return { sort: null, dir: null };
  return { sort: s.key, dir: s.dir === defaultDir(s.key) ? null : s.dir };
}

/** Header click: another column -> its first direction; same column -> flip. */
export function nextSort(cur: SortState, key: SortKey): SortState {
  return cur.key === key ? { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: defaultDir(key) };
}

type Val = number | string | null;

function valueOf(s: SetupEntry, key: SortKey): Val {
  switch (key) {
    case 'ticker': return s.ticker;
    case 'entry': return s.entry_date;
    case 'exit': return s.exit_date;
    case 'hold': return s.holding_days;
    case 'ret': return s.return_pct;
    case 'mfe': return Number.isFinite(s.mfe_pct as number) ? (s.mfe_pct as number) : null;
    case 'mae': return Number.isFinite(s.mae_pct as number) ? (s.mae_pct as number) : null;
    case 'giveback':
      return Number.isFinite(s.mfe_pct as number) ? (s.mfe_pct as number) - s.return_pct : null;
    case 'stage': {
      if (s.stage_at_entry == null) return null;
      const i = STAGE_ORDER.indexOf(s.stage_at_entry);
      return i === -1 ? STAGE_ORDER.length - 1 : i;
    }
    case 'reason': {
      const r = s.exit_reason ?? (s.status === 'open' ? 'open' : s.holding_days === 0 ? 'single_day' : 'left_scan');
      return REASON_ORDER.indexOf(r);
    }
  }
}

/** Stable sort. Empty values always last; ties fall back to latest entry first, then ticker. */
export function sortSetups(list: SetupEntry[], sort: SortState): SetupEntry[] {
  const tie = (a: SetupEntry, b: SetupEntry) =>
    b.entry_date.localeCompare(a.entry_date) || a.ticker.localeCompare(b.ticker);
  const sign = sort.dir === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => {
    const va = valueOf(a, sort.key);
    const vb = valueOf(b, sort.key);
    if (va == null && vb == null) return tie(a, b);
    if (va == null) return 1;
    if (vb == null) return -1;
    const c = typeof va === 'string' && typeof vb === 'string' ? va.localeCompare(vb) : (va as number) - (vb as number);
    return c * sign || tie(a, b);
  });
}
