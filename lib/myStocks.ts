// Shared localStorage-backed "My Stocks" ticker list - used by the My
// Stocks page itself and anywhere else that needs to know which tickers the
// user holds (e.g. the calendar's "stocks you hold" filter/warning banner).
const STORAGE_KEY = 'mystocks:symbols';

export function loadMyStockSymbols(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

export function saveMyStockSymbols(symbols: string[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(symbols));
}
