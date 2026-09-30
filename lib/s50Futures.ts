// SET50 index futures (TFEX) quote helpers for /api/s50-futures and the
// "เทียบ S50F" column on /set-index/[index].

export interface S50FuturesQuote {
  contract: string;          // real contract the numbers come from, e.g. "S50Z2026" ("S501!" if unresolved)
  price: number | null;
  chg: number | null;        // % change today
  delayMinutes: number | null;
  fetchedAt: number;         // ms epoch
}

export interface FuturesRow {
  name: string;              // "S501!", "S50Z2026", ...
  close: number | null;
  chg: number | null;
  volume: number | null;
  updateMode: string | null; // "delayed_streaming_900", "streaming", ...
}

export const CONTINUOUS = 'S501!';

/** "delayed_streaming_900" → 15; realtime / unknown → null. */
export function delayMinutesFromMode(mode: string | null): number | null {
  const m = mode?.match(/^delayed_streaming_(\d+)$/);
  return m ? Math.round(Number(m[1]) / 60) : null;
}

/**
 * TradingView exposes no field naming the contract behind S501!, but S501! is the
 * same series as that contract - identical close and volume. Resolve it by that
 * match and take the numbers from the real contract, so the % change is always the
 * contract's own day change (never a cross-contract comparison on rollover).
 * No unique match (or volume 0, where a match proves nothing) → S501!'s own numbers.
 */
export function resolveFrontContract(rows: FuturesRow[]): FuturesRow | null {
  const cont = rows.find(r => r.name === CONTINUOUS);
  if (!cont) return null;
  if (cont.close == null || !cont.volume) return cont;
  const matches = rows.filter(
    r => r.name !== CONTINUOUS && !r.name.endsWith('!') && r.close === cont.close && r.volume === cont.volume,
  );
  return matches.length === 1 ? matches[0] : cont;
}

/** Stock % change minus futures % change (percentage points); null if either side is missing. */
export function vsFutures(stockChg: number | null | undefined, futChg: number | null | undefined): number | null {
  if (stockChg == null || futChg == null || !Number.isFinite(stockChg) || !Number.isFinite(futChg)) return null;
  return stockChg - futChg;
}

/** +1.52% / −0.84% (U+2212 minus); 2 decimals. Values that round to zero show as +0.00%. */
export function fmtSignedPct(v: number): string {
  const s = Math.abs(v).toFixed(2);
  return `${v < 0 && s !== '0.00' ? '−' : '+'}${s}%`;
}
