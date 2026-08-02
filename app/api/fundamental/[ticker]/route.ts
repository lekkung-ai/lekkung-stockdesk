import type { NextRequest } from 'next/server';
import { TRADINGVIEW_HEADERS } from '@/lib/tradingview';

const YF_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function fmtMarketCap(n: number | null): string {
  if (n == null) return '—';
  const bil = n / 1_000_000_000;
  if (bil >= 1000) return `${(bil / 1000).toFixed(1)} ล้านล้าน`;
  if (bil >= 1) return `${bil.toFixed(1)} พันล้าน`;
  return `${(n / 1_000_000).toFixed(0)} ล้าน`;
}

async function getSettradeSessionCookie(): Promise<string> {
  try {
    const res = await fetch('https://www.settrade.com/th/home', {
      headers: {
        'User-Agent': YF_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
      signal: AbortSignal.timeout(6000),
    });
    const rawCookies: string[] =
      typeof (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === 'function'
        ? (res.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
        : (res.headers.get('set-cookie') ?? '').split(/,(?=\s*\w+=)/);

    return rawCookies
      .map(raw => raw.split(';')[0].trim())
      .filter(Boolean)
      .join('; ');
  } catch {
    return '';
  }
}

interface SettradeStockInfo {
  peRatio?: number | null;
  pbRatio?: number | null;
  dividendYield?: number | null;
  marketCap?: number | null;
}

async function fetchSettradeInfo(symbol: string): Promise<SettradeStockInfo | null> {
  try {
    const cookie = await getSettradeSessionCookie();
    const headers: Record<string, string> = {
      'User-Agent': YF_UA,
      Accept: 'application/json',
      Referer: 'https://www.settrade.com/',
    };
    if (cookie) {
      headers['Cookie'] = cookie;
    }
    const res = await fetch(`https://www.settrade.com/api/set/stock/${encodeURIComponent(symbol)}/info`, {
      headers,
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || typeof data !== 'object') return null;
    return {
      peRatio: typeof data.peRatio === 'number' ? data.peRatio : (data.peRatio === null ? null : undefined),
      pbRatio: typeof data.pbRatio === 'number' ? data.pbRatio : (data.pbRatio === null ? null : undefined),
      dividendYield: typeof data.dividendYield === 'number' ? data.dividendYield : (data.dividendYield === null ? null : undefined),
      marketCap: typeof data.marketCap === 'number' ? data.marketCap : (data.marketCap === null ? null : undefined),
    };
  } catch {
    return null;
  }
}

async function fetchTradingViewData(symbol: string): Promise<any[] | null> {
  try {
    const payload = {
      filter: [{ left: "name", operation: "equal", right: symbol }],
      options: { lang: "en" },
      markets: ["thailand"],
      columns: [
        "name",
        "price_earnings_ttm",
        "price_book_ratio",
        "return_on_equity",
        "earnings_per_share_basic_ttm",
        "debt_to_equity",
        "dividend_yield_recent",
        "market_cap_basic",
        "dividend_payout_ratio_fy",
      ],
      range: [0, 1]
    };

    const res = await fetch("https://scanner.tradingview.com/thailand/scan", {
      method: "POST",
      headers: TRADINGVIEW_HEADERS,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return null;

    const json = await res.json();
    const data = json.data;

    if (!data || data.length === 0) return null;

    return data[0].d;
  } catch {
    return null;
  }
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await context.params;
  const symbol = ticker.toUpperCase();

  try {
    const [tvResult, settradeResult] = await Promise.allSettled([
      fetchTradingViewData(symbol),
      fetchSettradeInfo(symbol),
    ]);

    const tvD = tvResult.status === 'fulfilled' ? tvResult.value : null;
    const settrade = settradeResult.status === 'fulfilled' ? settradeResult.value : null;

    if (!tvD && !settrade) {
      return Response.json({ error: 'no_data' }, { status: 404 });
    }

    const d = tvD || [];

    // Priority mapping:
    // SETTrade first for peRatio, pbRatio, dividendYield, marketCap
    // TradingView for roe, eps, de, payoutRatio
    const pe = settrade?.peRatio !== undefined ? settrade.peRatio : (d[1] ?? null);
    const pb = settrade?.pbRatio !== undefined ? settrade.pbRatio : (d[2] ?? null);
    const divYield = settrade?.dividendYield !== undefined ? settrade.dividendYield : (d[6] ?? null);
    const marketCapVal = settrade?.marketCap != null ? settrade.marketCap : (d[7] ?? null);

    const deValue = d[5] != null ? d[5] * 100 : null; // Multiply DE by 100 to match Yahoo's scale

    return Response.json(
      {
        pe,
        pb,
        roe: d[3] ?? null,
        eps: d[4] ?? null,
        de: deValue,
        deMissing: deValue == null,
        divYield,
        marketCap: fmtMarketCap(marketCapVal),
        payoutRatio: d[8] ?? null,
      },
      { headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=60' } }
    );
  } catch (err) {
    return Response.json({ error: 'fetch_failed' }, { status: 500 });
  }
}


