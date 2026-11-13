// Shared types, scan names/colours and formatters for /report-card and /report-card/[scan].
// Every field added in the 2026-11 "ตามไม้" redesign is optional: an older report_card.json
// (or a run without the stage file) leaves it out / null, and the page hides that part.

export const SCAN_ORDER = ['sepa', 'kell', 'breakout', 'lekkung_growth', 'ppbp', 'oneil'];

export const SCAN_LABELS: Record<string, string> = {
  sepa: 'SEPA',
  kell: 'Oliver Kell',
  breakout: 'Breakout',
  lekkung_growth: 'Lekkung Growth',
  ppbp: 'PPBP',
  oneil: "CAN SLIM (O'Neil)",
};

export const SCAN_COLORS: Record<string, string> = {
  sepa: '#1D9E75',
  kell: '#378ADD',
  breakout: '#EF9F27',
  lekkung_growth: '#7F77DD',
  ppbp: '#E24B4A',
  oneil: '#06B6D4',
};

export const SCAN_DESC: Record<string, string> = {
  sepa: 'Trend Template ของ Minervini: ราคาเหนือเส้นค่าเฉลี่ยที่เรียงตัวขึ้น ใกล้จุดสูงสุด 52 สัปดาห์ RS ≥ 70',
  kell: 'สัญญาณ EMA Crossback / Base break ตามวงจรราคาของ Oliver Kell',
  breakout: 'ราคาทะลุกรอบหรือจุดสูงสุดเดิม พร้อมวอลุ่มยืนยัน',
  lekkung_growth: 'หุ้นกำไรโตและแนวโน้ม EMA10/50/200 เรียงตัวขึ้น พร้อมสภาพคล่องพอ',
  ppbp: 'จุดซื้อ Pocket Pivot / Buyable Pullback บนแนวโน้มขาขึ้น',
  oneil: 'เกณฑ์ CAN SLIM ของ O’Neil: กำไรเร่งตัว ผู้นำกลุ่ม ราคาแข็งแรง',
};

// Site colours (same as the old report-card pages / WinFlatLossBar).
export const POS = '#1D9E75';
export const NEG = '#E24B4A';
export const NEUTRAL = 'rgba(255,255,255,0.85)';
export const FLAT_COLOR = 'rgba(255,255,255,0.28)';

export interface BestWorstEntry {
  ticker: string;
  entry_date: string;
  return_pct: number;
}

export interface HorizonMetric {
  n: number;
  avg_return_pct: number | null;
  median_return_pct: number | null;
  win_rate_pct: number | null;
  avg_set_return_pct: number | null;
  excess_return_pct: number | null;
  n_win?: number;
  n_flat?: number;
  n_loss?: number;
  flat_pct?: number | null;
  best5?: BestWorstEntry[];
  worst5?: BestWorstEntry[];
}

export type ExitReason = 'open' | 'single_day' | 'left_scan';

export interface SetupEntry {
  ticker: string;
  entry_date: string;
  entry_price: number;
  exit_date: string;
  exit_price: number;
  holding_days: number;
  return_pct: number;
  mfe_pct: number | null;
  mae_pct: number | null;
  price_path?: number[];
  status: 'open' | 'closed';
  stage_at_entry?: string | null;
  exit_reason?: ExitReason;
  // added 2026-11-13 (scripts/scan_setups.py: a setup ends after 5 scan days out)
  days_out?: number; // open: scan days since the last hit (0 = in the scan today); closed: 5
  setup_seq?: number;
  first_hit?: string;
  last_hit?: string;
  n_hits?: number;
  /** v4: closed setup that fails the outlier guard (>40% and a no-trade day while held): listed, but in no number */
  excluded_outlier?: boolean;
  // v3 (2026-11-13): the main exit is the 5th out day; the old next-day exit is kept
  // as *_drop for reference only (it needs future data) - never shown as a main number
  exit_date_drop?: string;
  exit_price_drop?: number;
  holding_days_drop?: number;
  return_pct_drop?: number;
}

/** Days an OPEN setup has been out of the scan (1-4 = still held, "หลุดมา N วัน"); 0 otherwise. */
export function openDaysOut(s: Pick<SetupEntry, 'status' | 'days_out'>): number {
  if (s.status !== 'open') return 0;
  const n = s.days_out;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0;
}

export interface StageRow {
  stage: string;
  n: number;
  avg_return_pct: number | null;
  win_rate_pct: number | null;
  avg_mfe_pct: number | null;
}

export interface MonthRow {
  month: string;
  n: number;
  avg_return_pct: number | null;
  sum_return_pct: number | null;
  win_rate_pct: number | null;
}

export interface SetupSummary {
  n_closed: number;
  n_open: number;
  n_pending?: number; // open setups that are out of the scan 1-4 days
  n_excluded_outlier?: number;
  excluded_outliers?: ExcludedOutlier[];
  avg_return_pct: number | null;
  win_rate_pct: number | null;
  avg_holding_days: number | null;
  avg_mfe_pct: number | null;
  avg_mae_pct: number | null;
  // added 2026-11
  n_win?: number;
  n_flat?: number;
  n_loss?: number;
  n_single_day?: number;
  median_return_pct?: number | null;
  avg_win_pct?: number | null;
  avg_loss_pct?: number | null;
  payoff_ratio?: number | null;
  giveback_n?: number;
  giveback_mfe_pct?: number;
  hist?: number[] | null;
  hist_labels?: string[];
  by_stage?: StageRow[] | null;
  monthly?: MonthRow[] | null;
  scatter?: [number, number][] | null;
  scatter_sampled?: boolean;
}

export interface WhatIfRow {
  n: number;
  avg_return_pct: number | null;
  win_rate_pct: number | null;
  // v4: the main rule on exactly the setups this row has a value for
  current_same_avg_pct?: number | null;
  current_same_win_pct?: number | null;
  diff_pct?: number | null;
  /** exit_on_drop cuts its own setups: compared with the whole main set, not setup by setup */
  different_set?: boolean;
}

export interface ExcludedOutlier {
  ticker: string;
  entry_date: string;
  exit_date: string;
  return_pct: number;
  reason: string;
}

export type WhatIfKey = 'current' | 'exit_on_drop' | 'hold_5' | 'hold_10' | 'hold_20' | 'tp_3' | 'tp_5' | 'sl_3';

export interface ClosedBrief {
  ticker: string;
  entry_date: string;
  exit_date: string;
  holding_days: number;
  return_pct: number;
  mfe_pct: number | null;
  exit_reason?: ExitReason;
}

export interface Last30 {
  days: number;
  since: string | null;
  n: number;
  avg_return_pct: number | null;
  n_win: number;
  n_flat: number;
  n_loss: number;
}

export interface DateRange {
  first_date: string | null;
  last_date: string | null;
  n_days?: number;
}

export interface ScanReport {
  total_picks: number;
  horizons: Record<string, HorizonMetric>;
  setups?: SetupEntry[];
  setup_summary?: SetupSummary;
  // v3
  scan_range?: DateRange;
  what_if?: Partial<Record<WhatIfKey, WhatIfRow>>;
  recent_closed?: ClosedBrief[];
  best3?: ClosedBrief[];
  worst3?: ClosedBrief[];
  last30?: Last30;
}

export interface ReportMeta {
  generated_at: string | null;
  assumptions: Record<string, string>;
  history_range: { first_date: string; last_date: string; n_dates: number };
  price_range?: { first_date: string; first_signal_date: string };
  scan_range?: DateRange;
  setup_formula_version?: number;
}

export interface ReportCardFile extends ReportMeta {
  scans: Record<string, ScanReport>;
}

export const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function fmtPct(n: number | null | undefined, digits = 2): string {
  if (!isNum(n)) return '—';
  return `${n > 0 ? '+' : ''}${n.toFixed(digits)}%`;
}

export function returnColor(n: number | null | undefined): string {
  if (!isNum(n)) return 'rgba(255,255,255,0.3)';
  if (n > 0) return POS;
  if (n < 0) return NEG;
  return 'rgba(255,255,255,0.5)';
}

export const fmtInt = (n: number) => n.toLocaleString('en-US');

const SHORT_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

/** "2026-11-05" -> "5 พ.ย." */
export function fmtShortDate(iso: string): string {
  if (!iso || !iso.includes('-')) return iso;
  const [, m, d] = iso.split('-');
  return `${parseInt(d, 10)} ${SHORT_MONTHS[parseInt(m, 10) - 1]}`;
}

/** "2026-11" -> "พ.ย." */
export function fmtMonth(ym: string): string {
  const m = parseInt(ym.split('-')[1], 10);
  return SHORT_MONTHS[m - 1] ?? ym;
}

/** Buddhist year of an ISO date. */
export const beYear = (iso: string) => parseInt(iso.slice(0, 4), 10) + 543;

/** avg MFE ≥ this and result ≤ 0 = "กำไรที่หลุดมือ" (same constant as the script). */
export const GIVEBACK_MFE_DEFAULT = 3;

/** generated_at ISO (+07:00) -> "5 พ.ย. 2569 18:13 น." (Bangkok wall clock as written by the script). */
export function formatGenerated(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${parseInt(m[3], 10)} ${SHORT_MONTHS[parseInt(m[2], 10) - 1]} ${parseInt(m[1], 10) + 543} ${m[4]}:${m[5]} น.`;
}
