// /daily-report (สรุปสแกนรายวัน) — types ของ data/scans/daily_report.json (เขียนโดย
// scripts/build_daily_report.py) + logic ล้วนของหน้า (ตัวกรอง / ป้าย / รูปแบบวันที่)
// ไม่มี React ไม่มี JSON import — หน้าส่งข้อมูลเข้ามาเอง

import type { GrowthSection, SepaSection, StageSection } from './dailyReportTabs';

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
  /** บรรทัด "จับตา" (กติกาในสคริปต์) — ไม่มี = สคริปต์สร้างประโยคไม่ได้รอบนี้ */
  watch?: string[];
  /** Days ตามหน้าสแกน (scan_days.json) */
  days_web?: number | null;
  /** NEW ที่เคยอยู่ในสแกนภายใน 10 วันทำการก่อนหน้า (ข้อมูลเสริม) */
  seen_before?: string | null;
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
  in_scans: string[];
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
  } | null;
  calendar: { as_of: string | null; ahead_days: number; next_trading_day: string; items: CalendarItem[] } | null;
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
    headline?: string;
    change_notes?: ChangeNotes;
  } | null;
  growth: GrowthSection | null;
  sepa: SepaSection | null;
  market_stage: StageSection | null;
  warnings?: string[];
}

// ─── ตัวกรอง ─────────────────────────────────────────────────────────────

// สถานะตามหน้าสแกน: NEW (ป้ายเดียวกับ /lekkung-daytrade) / อยู่ต่อ — ไม่มี 'กลับเข้า' แยกแล้ว
export type DtFilter = 'all' | DtStatus | 'rv-hi' | 'rv-mid' | 'rv-lo';
export const DT_FILTERS: DtFilter[] = ['all', 'new', 'stay', 'rv-hi', 'rv-mid', 'rv-lo'];
export const DT_FILTER_LABELS: Record<DtFilter, string> = {
  all: 'ทั้งหมด',
  new: 'เข้าใหม่ (NEW)',
  reentry: 'กลับเข้า',
  stay: 'อยู่ต่อ',
  'rv-hi': 'วอลุ่มมาจริง',
  'rv-mid': 'วอลุ่มเกือบมา',
  'rv-lo': 'วอลุ่มยังไม่มา',
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
export const RV_LABEL: Record<RvTier, string> = { hi: 'มาจริง', mid: 'เกือบมา', lo: 'ยังไม่มา' };
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
export const SCAN_LABEL: Record<string, string> = { daytrade: 'Daytrade', growth: 'Growth', sepa: 'SEPA', market_stage: 'Stage' };

/** ป้าย "อยู่ใน" — ฟังก์ชันเดียวทุกจุด · 'market_stage:S.Bull' → 'Stage: S.Bull' (สคริปต์นับเฉพาะ Accumulation/Recovery/Bull/S.Bull) */
export function scanTagLabel(key: string): string {
  const i = key.indexOf(':');
  if (i < 0) return SCAN_LABEL[key] ?? key;
  const base = key.slice(0, i);
  return `${SCAN_LABEL[base] ?? base}: ${key.slice(i + 1)}`;
}

/** สแกนหลักของป้าย ('market_stage:Bull' → 'market_stage') ใช้เทียบ exclude */
export function scanKeyOf(key: string): string {
  const i = key.indexOf(':');
  return i < 0 ? key : key.slice(0, i);
}

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

/** สแกนของรายการปฏิทินที่นับเป็น "อยู่ในสแกนของเรา" — Daytrade / Growth / SEPA เท่านั้น */
export function calendarScans(i: CalendarItem): string[] {
  return i.in_scans.filter(k => scanKeyOf(k) !== 'market_stage');
}

export interface ChangeNotes {
  new: string | null;
  reentry: string | null;
  dropped: string | null;
  dropped_items: Record<string, string>;
  new_items?: Record<string, string>;
}

export interface CalendarSplit {
  /** พรุ่งนี้ (วันทำการถัดไป): หุ้นที่อยู่ในสแกนก่อน แล้วตามด้วยตัวอื่น */
  tomorrow: { inScan: CalendarItem[]; other: CalendarItem[] };
  /** หลังพรุ่งนี้เป็นต้นไป: แสดงเฉพาะหุ้นที่อยู่ในสแกน (เรียงตามวัน) · ที่เหลือซ่อนไว้ใน hidden */
  week: { shown: CalendarItem[]; hidden: CalendarItem[] };
}

/** แบ่งปฏิทินเป็น พรุ่งนี้ / ภายในสัปดาห์ — ไม่ตัดรายการทิ้ง (ซ่อนไว้ใน hidden) */
export function splitCalendar(items: CalendarItem[], nextDay: string): CalendarSplit {
  const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date) || a.ticker.localeCompare(b.ticker));
  const tm = sorted.filter(i => i.date === nextDay);
  const wk = sorted.filter(i => i.date > nextDay);
  // ตัวหนา = อยู่ใน Daytrade / Growth / SEPA (Market Stage ไม่นับในปฏิทิน)
  const inScan = (i: CalendarItem) => calendarScans(i).length > 0;
  return {
    tomorrow: { inScan: tm.filter(inScan), other: tm.filter(i => !inScan(i)) },
    week: { shown: wk.filter(inScan), hidden: wk.filter(i => !inScan(i)) },
  };
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
