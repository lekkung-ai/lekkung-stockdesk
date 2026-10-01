import { TRADINGVIEW_HEADERS } from '@/lib/tradingview';
import {
  delayMinutesFromMode,
  resolveFrontContract,
  type FuturesRow,
  type S50FuturesQuote,
} from '@/lib/s50Futures';

// SET50 index futures quote for the "เทียบ S50F" column on /set-index/[index]:
// TradingView "futures" scanner (same source + 15-min delay as /api/market-quotes),
// one call for every TFEX:S50 contract + S501!, then the real contract behind S501!
// is resolved (see resolveFrontContract). Cached in-process for 60s; a failed
// refresh serves the last good quote if any, else { quote: null }.

const TTL_MS = 60_000;
// every 200 response (fresh or from the in-process cache): CDN serves it 60s, revalidates in the background
const CACHE_HEADERS = { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' };
let cache: { at: number; quote: S50FuturesQuote } | null = null;

async function fetchQuote(now: number): Promise<S50FuturesQuote> {
  const res = await fetch('https://scanner.tradingview.com/futures/scan', {
    method: 'POST',
    headers: TRADINGVIEW_HEADERS,
    body: JSON.stringify({
      filter: [{ left: 'root', operation: 'equal', right: 'TFEX:S50' }],
      columns: ['name', 'close', 'change', 'volume', 'update_mode'],
      range: [0, 50],
    }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`upstream_${res.status}`);
  const json = await res.json();
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const rows: FuturesRow[] = (json.data ?? []).map((row: { d: unknown[] }) => {
    const [name, close, change, volume, mode] = row.d;
    return {
      name: String(name ?? ''),
      close: num(close),
      chg: num(change),
      volume: num(volume),
      updateMode: typeof mode === 'string' ? mode : null,
    };
  });
  const front = resolveFrontContract(rows);
  if (!front || front.close == null || front.chg == null) throw new Error('no_front_contract');
  return {
    contract: front.name,
    price: front.close,
    chg: front.chg,
    delayMinutes: delayMinutesFromMode(front.updateMode),
    fetchedAt: now,
  };
}

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) {
    return Response.json({ quote: cache.quote }, { headers: CACHE_HEADERS });
  }
  try {
    const quote = await fetchQuote(now);
    cache = { at: now, quote };
    return Response.json(
      { quote },
      { headers: CACHE_HEADERS },
    );
  } catch {
    if (cache) return Response.json({ quote: cache.quote, stale: true }, { headers: CACHE_HEADERS });
    return Response.json({ quote: null, error: 'upstream_unavailable' }, { status: 503 });
  }
}
