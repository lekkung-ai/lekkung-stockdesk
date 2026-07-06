import fs from 'fs';
import path from 'path';

// Tickers that pass SEPA today but didn't in the most recent saved history
// snapshot (data/history/{date}/sepa.json, indexed by data/history/index.json).
// Returns an empty set if there's no prior snapshot to compare against —
// never throws, so a missing/empty history simply means no "NEW" badges yet.
export function getNewSepaTickers(todaySepaTickers: string[]): Set<string> {
  try {
    const indexPath = path.join(process.cwd(), 'data', 'history', 'index.json');
    const dates: string[] = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    if (!Array.isArray(dates) || dates.length === 0) return new Set();

    const lastDate = [...dates].sort().at(-1);
    if (!lastDate) return new Set();

    const prevSepaPath = path.join(process.cwd(), 'data', 'history', lastDate, 'sepa.json');
    const prevSepa = JSON.parse(fs.readFileSync(prevSepaPath, 'utf-8')) as { Ticker?: string }[];
    const prevTickers = new Set(prevSepa.map(r => r.Ticker).filter((t): t is string => !!t));

    return new Set(todaySepaTickers.filter(t => !prevTickers.has(t)));
  } catch {
    return new Set();
  }
}
