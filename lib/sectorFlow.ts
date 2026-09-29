// Pure logic for the /sector-flow page (labels, ordering, filtering). No React, no JSON import.

export const STATUSES = ['เพิ่งเริ่มแข็ง', 'แข็งต่อเนื่อง', 'เริ่มหมดแรง', 'อ่อนต่อเนื่อง'] as const;
export type FlowStatus = (typeof STATUSES)[number];

export interface FlowRow {
  sector: string;
  subsector?: string;
  n: number;
  flow_1d: number | null;
  flow_5d: number | null;
  chg_1d: number | null;
  chg_5d: number | null;
  avg_value_20d: number | null;
  value_1d?: number | null;
  base_value_1d?: number | null;
  value_5d?: number | null;
  base_value_5d?: number | null;
  ret_1w: number | null;
  ret_1m: number | null;
  ret_3m: number | null;
  excess_1w: number | null;
  excess_1m: number | null;
  excess_3m: number | null;
  status: string | null;
}

export type FlowWindow = '1d' | '5d';

export const MIN_AVG_VALUE_MB = 20; // groups trading less than this (million baht/day) are hidden by default

export type FlowLabel = 'เงินเข้า ราคาขึ้น' | 'เงินเข้า แต่ราคาลง (แรงขาย)' | 'เงียบ' | null;

/** Meaning tag for a flow multiple + group price change (%). */
export function flowLabel(flow: number | null, chg: number | null): FlowLabel {
  if (flow == null || !Number.isFinite(flow)) return null;
  if (flow >= 1.3) {
    if (chg != null && chg >= 0.1) return 'เงินเข้า ราคาขึ้น';
    if (chg != null && chg <= -0.1) return 'เงินเข้า แต่ราคาลง (แรงขาย)';
    return null;
  }
  if (flow <= 0.7) return 'เงียบ';
  return null;
}

export function flowValue(r: FlowRow, w: FlowWindow): number | null {
  return w === '1d' ? r.flow_1d : r.flow_5d;
}
export function flowChg(r: FlowRow, w: FlowWindow): number | null {
  return w === '1d' ? r.chg_1d : r.chg_5d;
}

/** Rows for section 1: optional small-group filter, sorted by flow high → low, null flow last. */
export function flowRows(rows: FlowRow[], w: FlowWindow, showAll: boolean): FlowRow[] {
  return rows
    .filter(r => showAll || (r.avg_value_20d != null && r.avg_value_20d >= MIN_AVG_VALUE_MB))
    .sort((a, b) => compareNullLast(flowValue(a, w), flowValue(b, w), 'desc'));
}

export type SortKey = 'name' | 'excess_1w' | 'excess_1m' | 'excess_3m' | 'status' | 'n';
export type SortDir = 'asc' | 'desc';

export function statusRank(s: string | null): number {
  const i = STATUSES.indexOf(s as FlowStatus);
  return i < 0 ? STATUSES.length : i;
}

/** Numbers compare by value; a null on either side always sorts last regardless of direction. */
export function compareNullLast(a: number | null, b: number | null, dir: SortDir): number {
  const an = a == null || !Number.isFinite(a);
  const bn = b == null || !Number.isFinite(b);
  if (an && bn) return 0;
  if (an) return 1;
  if (bn) return -1;
  return dir === 'asc' ? (a as number) - (b as number) : (b as number) - (a as number);
}

export function rowName(r: FlowRow): string {
  return r.subsector ?? r.sector;
}

/** Section 2 ordering. `sort` undefined = default: status order (เพิ่งเริ่มแข็ง → … → อ่อนต่อเนื่อง), then excess_3m high → low. */
export function strengthRows(rows: FlowRow[], sort: SortKey | undefined, dir: SortDir): FlowRow[] {
  const out = [...rows];
  if (!sort) {
    return out.sort((a, b) => {
      const s = statusRank(a.status) - statusRank(b.status);
      return s !== 0 ? s : compareNullLast(a.excess_3m, b.excess_3m, 'desc');
    });
  }
  return out.sort((a, b) => {
    switch (sort) {
      case 'name':
        return dir === 'asc' ? rowName(a).localeCompare(rowName(b)) : rowName(b).localeCompare(rowName(a));
      case 'status': {
        const an = a.status == null, bn = b.status == null;
        if (an || bn) return an && bn ? 0 : an ? 1 : -1;
        const d = statusRank(a.status) - statusRank(b.status);
        return dir === 'asc' ? d : -d;
      }
      case 'n':
        return compareNullLast(a.n, b.n, dir);
      default:
        return compareNullLast(a[sort], b[sort], dir);
    }
  });
}

export function parseFlowWindow(v: string | null): FlowWindow {
  return v === '5d' ? '5d' : '1d';
}

const SORT_KEYS: SortKey[] = ['name', 'excess_1w', 'excess_1m', 'excess_3m', 'status', 'n'];
export function parseSortKey(v: string | null): SortKey | undefined {
  return SORT_KEYS.includes(v as SortKey) ? (v as SortKey) : undefined;
}
export function parseSortDir(v: string | null): SortDir {
  return v === 'asc' ? 'asc' : 'desc';
}

const MONTHS_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
/** '2026-09-28' → '28 ก.ย. 2569' */
export function formatThaiDay(isoDate: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate ?? '');
  if (!m) return 'ไม่ทราบวันที่';
  return `${Number(m[3])} ${MONTHS_TH[Number(m[2]) - 1]} ${Number(m[1]) + 543}`;
}
