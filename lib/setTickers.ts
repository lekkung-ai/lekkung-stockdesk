import rawSectorMap from '@/data/scans/sector_map.json';
import rawCombined from '@/data/scans/combined.json';

const SECTOR_MAP = rawSectorMap as {
  ticker_to_sector: Record<string, { sector: string; subsector: string }>;
};
const _combined = rawCombined as unknown as { ticker: string }[] | { generated_at?: string; data: { ticker: string }[] };
const COMBINED: { ticker: string }[] = Array.isArray(_combined) ? _combined : _combined.data;

// Full SET ticker set: sector_map (178) ∪ combined (258)
export const SET_TICKER_SET = new Set<string>([
  ...Object.keys(SECTOR_MAP.ticker_to_sector),
  ...COMBINED.map(c => c.ticker),
]);

export const SECTOR_INFO = SECTOR_MAP.ticker_to_sector;

export function isSetTicker(ticker: string): boolean {
  return SET_TICKER_SET.has(ticker.toUpperCase());
}

export function toYahooSymbol(ticker: string): string {
  return isSetTicker(ticker) ? `${ticker}.BK` : ticker;
}

// Sorted list for autocomplete
export const ALL_SET_TICKERS = [...SET_TICKER_SET].sort();
