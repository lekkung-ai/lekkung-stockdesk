import { WARRANT_PARENT_TICKERS } from '@/lib/warrantParents';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Settrade has no bulk "list all warrants" endpoint, only per-parent
// (/api/set/stock/{parent}/related-product/W). We fan out over the known parent
// list and merge results, reusing a single Incapsula session cookie for all calls
// (the cookie is domain-scoped, not parent-scoped, so one visit is enough).
async function getSessionCookie(): Promise<string> {
  try {
    const res = await fetch('https://www.settrade.com/th/equities/quote/PTT/overview', {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8',
      },
      signal: AbortSignal.timeout(8000),
    });
    const rawCookies: string[] =
      typeof (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === 'function'
        ? (res.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
        : (res.headers.get('set-cookie') ?? '').split(/,(?=\s*\w+=)/);
    return rawCookies.map(c => c.split(';')[0].trim()).filter(Boolean).join('; ');
  } catch {
    return '';
  }
}

interface RawWarrant {
  symbol: string;
  last: number;
  prior: number;
  change: number;
  percentChange: number;
  securityType: string;
  exercisePrice: number;
  exerciseRatio: string; // e.g. "1 : 1.03"
  maturityDate: string;  // e.g. "2028-07-06T00:00:00+07:00"
}

export interface WarrantListRow {
  symbol: string;
  parent: string;
  price: number;
  change: number;
  changePercent: number;
  exercisePrice: number;
  exerciseRatio: number;
  maturityDate: string | null; // ISO date (yyyy-mm-dd)
}

function parseRatio(raw: string): number {
  const m = raw.match(/:\s*([\d.]+)/);
  return m ? parseFloat(m[1]) : 1;
}

async function fetchParent(parent: string, cookie: string): Promise<WarrantListRow[]> {
  try {
    const res = await fetch(`https://www.settrade.com/api/set/stock/${encodeURIComponent(parent)}/related-product/W`, {
      headers: {
        'User-Agent': UA,
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8',
        Referer: `https://www.settrade.com/th/equities/quote/${parent}/overview`,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const json = await res.json();
    const raw: RawWarrant[] = Array.isArray(json?.relatedProducts) ? json.relatedProducts : [];

    const today = new Date().toISOString().slice(0, 10);
    return raw
      .filter(w => w.securityType === 'W' || /-W\d+$/.test(w.symbol ?? ''))
      .map(w => ({
        symbol: w.symbol,
        parent,
        price: w.last,
        change: w.change,
        changePercent: w.percentChange,
        exercisePrice: w.exercisePrice,
        exerciseRatio: parseRatio(w.exerciseRatio),
        maturityDate: w.maturityDate ? w.maturityDate.slice(0, 10) : null,
      }))
      .filter(w => !w.maturityDate || w.maturityDate >= today);
  } catch {
    return [];
  }
}

// Fan out with bounded concurrency so we don't open 78 sockets at once.
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function GET() {
  try {
    const cookie = await getSessionCookie();
    const perParent = await mapWithConcurrency(WARRANT_PARENT_TICKERS, 12, p => fetchParent(p, cookie));
    const warrants = perParent.flat().sort((a, b) => a.symbol.localeCompare(b.symbol));

    return Response.json(
      { warrants },
      { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=120' } }
    );
  } catch {
    return Response.json({ warrants: [], error: 'fetch_failed' }, { status: 500 });
  }
}
