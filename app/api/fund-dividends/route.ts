import { FUND_TICKERS } from '@/lib/fundFilter';
import { TRADINGVIEW_HEADERS } from '@/lib/tradingview';

// Trailing dividend yield (%) for every fund / REIT in combined.json (Is_Fund),
// in ONE TradingView scanner call — same pattern as /api/market-quotes.
// TradingView "dividends_yield" = dividends paid over the last 12 months / price
// (checked 2026-10-01: WHART 6.35%, CPNREIT 7.04%). Cached in-process for 60s;
// a failed refresh serves the last good payload if any.

const TTL_MS = 60_000;
const CACHE_HEADERS = { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' };
const TICKERS = [...FUND_TICKERS];
let cache: { at: number; yields: Record<string, number | null> } | null = null;

async function fetchYields(): Promise<Record<string, number | null>> {
  const res = await fetch('https://scanner.tradingview.com/thailand/scan', {
    method: 'POST',
    headers: TRADINGVIEW_HEADERS,
    body: JSON.stringify({
      filter: [{ left: 'name', operation: 'in_range', right: TICKERS }],
      options: { lang: 'en' },
      markets: ['thailand'],
      columns: ['name', 'dividends_yield'],
      range: [0, TICKERS.length],
    }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`upstream_${res.status}`);
  const json = await res.json();
  const yields: Record<string, number | null> = {};
  for (const row of json.data ?? []) {
    const [name, y] = row.d as [string, unknown];
    if (!name || !FUND_TICKERS.has(name)) continue;
    yields[name] = typeof y === 'number' && Number.isFinite(y) ? y : null;
  }
  if (Object.keys(yields).length === 0) throw new Error('empty');
  return yields;
}

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) {
    return Response.json({ yields: cache.yields, fetchedAt: cache.at }, { headers: CACHE_HEADERS });
  }
  if (TICKERS.length === 0) return Response.json({ yields: {}, fetchedAt: now });
  try {
    const yields = await fetchYields();
    cache = { at: now, yields };
    return Response.json({ yields, fetchedAt: now }, { headers: CACHE_HEADERS });
  } catch {
    if (cache) return Response.json({ yields: cache.yields, fetchedAt: cache.at, stale: true }, { headers: CACHE_HEADERS });
    return Response.json({ error: 'upstream_unavailable', yields: {} }, { status: 503 });
  }
}
