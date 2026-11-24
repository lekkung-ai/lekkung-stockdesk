// /daily-report (สรุปสแกนรายวัน) — types ของ data/scans/daily_report.json (เขียนโดย
// scripts/build_daily_report.py) + logic ล้วนของหน้า (ตัวกรอง / ป้าย / รูปแบบวันที่)
// ไม่มี React ไม่มี JSON import — หน้าส่งข้อมูลเข้ามาเอง

export type DtStatus = 'new' | 'reentry' | 'stay';
export type RvTier = 'hi' | 'mid' | 'lo';
export type ClosePos = 'at_high' | 'near_high' | 'mid' | 'near_low';
export type TriggerKind = 'high_day' | 'high_5d' | 'high_30d' | 'close_30d_high';

export interface NewsFlag {
  type: string;
  label: string;
  severity?: string;
  date?: string;
  title?: string;
  link?: string;
}

export interface DtRow {
  ticker: string;
  name: string | null;
  status: DtStatus;
  last_seen: string | null;
  streak_days: number;
  close: number | null;
  chg_pct: number | null;
  volume: number | null;
  avg_vol_10d: number | null;
  rel_vol: number | null;
  rv_tier: RvTier | null;
  rsi7: number | null;
  adx: number | null;
  tech_rating: number | null;
  tech_label: string | null;
  pe: number | null;
  eps_gr_yoy: number | null;
  price_stale: boolean;
  bar_date: string | null;
  open: number | null;
  high: number | null;
  low: number | null;
  prev_close: number | null;
  closes_7d: { date: string; close: number }[];
  close_position: ClosePos | null;
  trigger: number | null;
  trigger_kind: TriggerKind | null;
  stop: number | null;
  stop_kind: 'low' | 'prev_close' | null;
  price_check: 'ok' | 'mismatch' | null;
  min_vol_1030: number | null;
  value_mb: number | null;
  thin: boolean | null;
  value_is_calc: boolean;
  in_scans: string[];
  events: NewsFlag[];
}

export interface DtDropped {
  ticker: string;
  status: 'dropped';
  days_before_drop: number;
  close: number | null;
  chg_pct: number | null;
  price_stale: boolean;
  bar_date: string | null;
  check: {
    criteria: Record<string, 'pass' | 'fail' | 'unknown'>;
    failed: string[];
    checked: number;
    total: number;
  };
  in_scans: string[];
  events: NewsFlag[];
}

export interface CalendarItem {
  date: string;
  type: 'XD' | 'XR' | string;
  ticker: string;
  amount: number | null;
  note: string;
}

export interface DailyReport {
  schema_version: number;
  date: string;
  compared_to: string | null;
  generated_at: string;
  market: {
    date: string;
    set_close: number | null;
    set_chg_pct: number | null;
    value_mb: number | null;
    value_chg_pct: number | null;
    value_is_universe: boolean;
    breadth: { up: number; flat: number; down: number; skipped_no_bar: number };
    condition: { label: string; dd_window: number; dd_count: number | null; caution: boolean; advice: string | null } | null;
  };
  calendar: { as_of: string | null; ahead_days: number; items: CalendarItem[] };
  daytrade: {
    scan: string;
    page: string;
    date: string;
    compared_to: string | null;
    generated_at: string | null;
    counts: Record<'total' | 'new' | 'reentry' | 'stay' | 'dropped' | 'rv_hi' | 'rv_mid' | 'rv_lo', number>;
    lookback_days: number;
    price_mismatch: string[];
    rows: DtRow[];
    dropped: DtDropped[];
    criteria: { key: string; label: string }[];
  } | null;
  growth: unknown;
  sepa: unknown;
  market_stage: unknown;
}

// ─── ตัวกรอง ─────────────────────────────────────────────────────────────

export type DtFilter = 'all' | DtStatus | 'rv-hi' | 'rv-mid' | 'rv-lo';
export const DT_FILTERS: DtFilter[] = ['all', 'new', 'reentry', 'stay', 'rv-hi', 'rv-mid', 'rv-lo'];
export const DT_FILTER_LABELS: Record<DtFilter, string> = {
  all: 'ทั้งหมด',
  new: 'เข้าใหม่',
  reentry: 'กลับเข้า',
  stay: 'อยู่ต่อ',
  'rv-hi': 'วอลุ่มมาจริง',
  'rv-mid': 'เฉียด',
  'rv-lo': 'ไม่มา',
};

export function matchFilter(r: DtRow, f: DtFilter): boolean {
  if (f === 'all') return true;
  if (f.startsWith('rv-')) return r.rv_tier === f.slice(3);
  return r.status === f;
}

export function matchQuery(r: DtRow, q: string): boolean {
  const s = q.trim().toUpperCase();
  return s === '' || r.ticker.toUpperCase().includes(s);
}

/** เลขบนปุ่มตัวกรอง = จำนวนแถวที่ตัวกรองนั้นให้จริง (นับจากแถวเดียวกับตาราง) */
export function filterCounts(rows: DtRow[]): Record<DtFilter, number> {
  const out = {} as Record<DtFilter, number>;
  for (const f of DT_FILTERS) out[f] = rows.filter(r => matchFilter(r, f)).length;
  return out;
}

// ─── ป้าย ───────────────────────────────────────────────────────────────

export const STATUS_LABEL: Record<DtStatus, string> = { new: 'เข้าใหม่', reentry: 'กลับเข้า', stay: 'อยู่ต่อ' };
export const RV_LABEL: Record<RvTier, string> = { hi: 'มาจริง', mid: 'เฉียด', lo: 'ไม่มา' };
export const CLOSE_POS_LABEL: Record<ClosePos, string> = {
  at_high: 'ที่ High วัน',
  near_high: 'ชิด High',
  mid: 'กลางแท่ง',
  near_low: 'ชิด Low',
};
export const TRIGGER_LABEL: Record<TriggerKind, string> = {
  high_day: 'High วัน',
  high_5d: 'High 5 วัน',
  high_30d: 'High 30 วัน',
  close_30d_high: 'ปิดสูงสุดใน 30 วัน',
};
export const SCAN_LABEL: Record<string, string> = { daytrade: 'Daytrade', growth: 'Growth', sepa: 'SEPA' };

// ─── รูปแบบตัวเลข / วันที่ ─────────────────────────────────────────────────

const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const WEEKDAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

function parts(iso: string | null | undefined): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** '2026-11-23' → '23 พ.ย.' */
export function shortDate(iso: string | null | undefined): string {
  const p = parts(iso);
  return p ? `${p[2]} ${MONTHS[p[1] - 1]}` : '—';
}

/** '2026-11-23' → 'จันทร์ 23 พ.ย. 2569' */
export function longDate(iso: string | null | undefined): string {
  const p = parts(iso);
  if (!p) return '—';
  const wd = new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay();
  return `${WEEKDAYS[wd]} ${p[2]} ${MONTHS[p[1] - 1]} ${p[0] + 543}`;
}

/** '2026-11-23T18:06:51+07:00' → '18:06' (เวลาไทยตามที่ไฟล์เขียน) */
export function hhmm(isoTs: string | null | undefined): string | null {
  const m = /T(\d{2}):(\d{2})/.exec(isoTs ?? '');
  return m ? `${m[1]}:${m[2]}` : null;
}

export function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtPct(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${v > 0 ? '+' : ''}${v.toFixed(digits)}%`;
}

/** 1,286,673 → '1.29M' · 386,002 → '0.39M' */
export function fmtShares(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${(v / 1e6).toFixed(2)}M`;
}

export function pctClass(v: number | null | undefined): 'pos' | 'neg' | 'flat' {
  if (v == null || v === 0) return 'flat';
  return v > 0 ? 'pos' : 'neg';
}

/** XD/XR ของหุ้นตัวนี้ในปฏิทินของรายงาน (ชุดเดียวกับแถบปฏิทินด้านบน) */
export function calendarFor(items: CalendarItem[], ticker: string): CalendarItem[] {
  return items.filter(i => i.ticker === ticker);
}

export function calendarText(i: CalendarItem): string {
  return `${i.type} ${shortDate(i.date)}${i.amount != null ? ` ${i.amount}` : ''}`;
}

/** จัดกลุ่มปฏิทินตามวันที่ (เรียงวันจากไฟล์) */
export function groupCalendar(items: CalendarItem[]): { date: string; items: CalendarItem[] }[] {
  const map = new Map<string, CalendarItem[]>();
  for (const i of items) {
    const arr = map.get(i.date) ?? [];
    arr.push(i);
    map.set(i.date, arr);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, its]) => ({ date, items: its }));
}

/** วันสแกนล่าสุดจาก generated_at.json (ค่าที่ใหม่สุดในไฟล์) → 'YYYY-MM-DD' */
export function latestScanDate(generatedAt: Record<string, unknown>): string | null {
  const ds = Object.values(generatedAt)
    .filter((v): v is string => typeof v === 'string')
    .map(v => v.slice(0, 10))
    .filter(v => /^\d{4}-\d{2}-\d{2}$/.test(v))
    .sort();
  return ds.length ? ds[ds.length - 1] : null;
}
