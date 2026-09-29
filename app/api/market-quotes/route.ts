import { tickerToSector } from '@/lib/sectorData';
import { TRADINGVIEW_HEADERS } from '@/lib/tradingview';

// Price, today's %change and market cap for every ticker in sector_map, in ONE
// TradingView scanner call (same "thailand" scanner /api/prices uses). Cached
// in-process for 60s; a failed refresh serves the last good payload if any.

export interface MarketQuote {
  price: number | null;
  chg: number | null;   // %
  mcap: number | null;  // THB
}

const TTL_MS = 60_000;
const TICKERS = Object.keys(tickerToSector);
let cache: { at: number; quotes: Record<string, MarketQuote> } | null = null;

async function fetchQuotes(): Promise<Record<string, MarketQuote>> {
  const res = await fetch('https://scanner.tradingview.com/thailand/scan', {
    method: 'POST',
    headers: TRADINGVIEW_HEADERS,
    body: JSON.stringify({
      filter: [{ left: 'name', operation: 'in_range', right: TICKERS }],
      options: { lang: 'en' },
      markets: ['thailand'],
      columns: ['name', 'close', 'change', 'market_cap_basic'],
      range: [0, TICKERS.length],
    }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`upstream_${res.status}`);
  const json = await res.json();
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const quotes: Record<string, MarketQuote> = {};
  for (const row of json.data ?? []) {
    const [name, close, change, mcap] = row.d as [string, unknown, unknown, unknown];
    if (!name || !(name in tickerToSector)) continue;
    quotes[name] = { price: num(close), chg: num(change), mcap: num(mcap) };
  }
  if (Object.keys(quotes).length === 0) throw new Error('empty');
  return quotes;
}

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) {
    return Response.json({ quotes: cache.quotes, fetchedAt: cache.at });
  }
  try {
    const quotes = await fetchQuotes();
    cache = { at: now, quotes };
    return Response.json(
      { quotes, fetchedAt: now },
      { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=30' } },
    );
  } catch {
    if (cache) return Response.json({ quotes: cache.quotes, fetchedAt: cache.at, stale: true });
    return Response.json({ error: 'upstream_unavailable', quotes: {} }, { status: 503 });
  }
}
