import rawBreadth from '@/data/scans/breadth.json';

export interface SetIndexBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  marker: 'FTD' | 'DD' | null;
}

export interface BreadthRow {
  date: string;
  pct_above_ma10: number | null;
  pct_above_ma20: number | null;
  pct_above_ma50: number | null;
  pct_above_ma200: number | null;
  pct_new_52wh: number | null;
  pct_new_52wl: number | null;
}

export interface MarketStage {
  stage: string;
  dd_count_25d: number;
  pct_above_ma50_today: number | null;
  rule: string;
}

interface BreadthJson {
  generated_at: string;
  universe: { count: number; min_history_days: number; note: string };
  config: {
    ma_periods: number[];
    new_high_low_window: number;
    dd_min_decline_pct: number;
    ftd_min_gain_pct: number;
    ftd_window_start_day: number;
    ftd_window_end_day: number;
  };
  ftd_dd_rule: string;
  market_stage: MarketStage;
  set_index: SetIndexBar[];
  breadth: BreadthRow[];
}

const b = (rawBreadth as any)?.default ?? rawBreadth ?? {};
const breadth = b as unknown as BreadthJson;

export const breadthGeneratedAt: string = breadth.generated_at || new Date().toISOString();
export const breadthUniverse = breadth.universe || { count: 0, min_history_days: 0, note: '' };
export const breadthConfig = breadth.config || { ma_periods: [], new_high_low_window: 252, dd_min_decline_pct: 0.2, ftd_min_gain_pct: 1.5, ftd_window_start_day: 4, ftd_window_end_day: 10 };
export const marketStage: MarketStage = breadth.market_stage || { stage: 'Uptrend', dd_count_25d: 0, pct_above_ma50_today: null, rule: '' };
export const setIndexBars: SetIndexBar[] = breadth.set_index || [];
export const breadthRows: BreadthRow[] = breadth.breadth || [];

export function latestFtdDate(): string | null {
  for (let i = setIndexBars.length - 1; i >= 0; i--) {
    if (setIndexBars[i].marker === 'FTD') return setIndexBars[i].date;
  }
  return null;
}

export function latest52w(): { pct_new_52wh: number | null; pct_new_52wl: number | null } {
  const last = breadthRows[breadthRows.length - 1];
  return last
    ? { pct_new_52wh: last.pct_new_52wh, pct_new_52wl: last.pct_new_52wl }
    : { pct_new_52wh: null, pct_new_52wl: null };
}
