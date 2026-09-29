import type { HeatStock } from '../components/MarketHeatmap';
import { weightedChange } from './sectorChange';

// Keep the `n` largest stocks by market cap; fold the rest into one "อื่นๆ (k ตัว)" box
// sized by their total market cap and coloured by their market-cap-weighted %.
export function topNWithOther(stocks: HeatStock[], n: number, href: string): HeatStock[] {
  const sorted = [...stocks].sort((a, b) => b.mcap - a.mcap);
  if (sorted.length <= n) return sorted;
  const top = sorted.slice(0, n);
  const rest = sorted.slice(n);
  const { pct } = weightedChange(rest.map(s => ({ mcap: s.mcap, chg: s.chg })));
  const movers = rest
    .filter((s): s is HeatStock & { chg: number } => s.chg != null && Number.isFinite(s.chg))
    .sort((a, b) => Math.abs(b.chg) - Math.abs(a.chg))
    .slice(0, 5)
    .map(s => ({ ticker: s.ticker, chg: s.chg }));
  const other: HeatStock = {
    ticker: `อื่นๆ (${rest.length} ตัว)`,
    mcap: rest.reduce((a, s) => a + s.mcap, 0),
    chg: pct,
    price: null,
    rs: null,
    stage: null,
    other: { count: rest.length, pct, href, movers },
  };
  return [...top, other];
}
