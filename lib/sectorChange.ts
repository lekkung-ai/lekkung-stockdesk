// Market-cap-weighted % change of a group of stocks (sector / subsector).
//
//   %group = Σ(mcap_prev × %chg) / Σ(mcap_prev),  mcap_prev = mcap_now / (1 + %chg/100)
//
// Stocks missing market cap or %chg (or with non-finite / non-positive values)
// are skipped, so the result is never NaN/Infinity. `n` is the number counted,
// `total` the number of stocks in the group.

export interface ChangeInput {
  mcap: number | null | undefined;
  chg: number | null | undefined; // percent, e.g. 1.5 = +1.5%
}

export interface GroupChange {
  pct: number | null; // null when nothing could be counted
  n: number;
  total: number;
}

export function isCountable(s: ChangeInput): s is { mcap: number; chg: number } {
  return (
    typeof s.mcap === 'number' && Number.isFinite(s.mcap) && s.mcap > 0 &&
    typeof s.chg === 'number' && Number.isFinite(s.chg) && s.chg > -100
  );
}

export function weightedChange(items: ChangeInput[]): GroupChange {
  let num = 0;
  let den = 0;
  let n = 0;
  for (const s of items) {
    if (!isCountable(s)) continue;
    const prev = s.mcap / (1 + s.chg / 100);
    if (!Number.isFinite(prev) || prev <= 0) continue;
    num += prev * s.chg;
    den += prev;
    n += 1;
  }
  const pct = den > 0 && Number.isFinite(num / den) ? num / den : null;
  return { pct, n, total: items.length };
}

export function formatPct(p: number | null | undefined, digits = 2): string {
  if (p == null || !Number.isFinite(p)) return '—';
  const r = Number(p.toFixed(digits));
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toFixed(digits)}%`;
}
