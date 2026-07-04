import type { NextRequest } from 'next/server';
import https from 'https';
import { toYahooSymbol } from '@/lib/setTickers';

const YF_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function raw(obj: unknown): number | null {
  if (obj && typeof obj === 'object' && 'raw' in obj) {
    const v = (obj as { raw: unknown }).raw;
    return typeof v === 'number' ? v : null;
  }
  return null;
}

function fmtMarketCap(n: number | null): string {
  if (n == null) return '—';
  const bil = n / 1_000_000_000;
  if (bil >= 1000) return `${(bil / 1000).toFixed(1)} ล้านล้าน`;
  if (bil >= 1) return `${bil.toFixed(1)} พันล้าน`;
  return `${(n / 1_000_000).toFixed(0)} ล้าน`;
}

function httpsGet(url: string, headers: Record<string, string>): Promise<{ body: string; cookies: string[] }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.get(
      {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        headers,
        maxHeaderSize: 65536,
      },
      res => {
        const rawCookies = (res.headers['set-cookie'] ?? []) as string[];
        let body = '';
        res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        res.on('end', () => resolve({ body, cookies: rawCookies }));
      }
    );
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(new Error('timeout')); });
  });
}

async function getYahooCrumb(symbol: string): Promise<{ cookie: string; crumb: string } | null> {
  try {
    // Step 1: hit quote page with https module (avoids undici header overflow)
    const { cookies } = await httpsGet(
      `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/`,
      { 'User-Agent': YF_UA, Accept: 'text/html', 'Accept-Language': 'en-US,en;q=0.9' }
    );

    const cookie = cookies
      .map(c => c.split(';')[0].trim())
      .filter(Boolean)
      .join('; ');

    if (!cookie) return null;

    // Step 2: get crumb — this endpoint returns plain text, headers are small → fetch is fine
    const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': YF_UA, Accept: '*/*', 'Accept-Language': 'en-US,en;q=0.9', Cookie: cookie },
    });
    const crumb = (await crumbRes.text()).trim();
    if (!crumb || crumb.startsWith('{')) return null;

    return { cookie, crumb };
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      return Response.json({ error: `upstream_${res.status}` }, { status: res.status });
    }

    const json = await res.json();
    const data = json.data;

    if (!data || data.length === 0) {
      return Response.json({ error: 'no_data' }, { status: 404 });
    }

    const d = data[0].d;
    
    // TradingView returns null for missing data
    // d[1] = PE, d[2] = PB, d[3] = ROE (%), d[4] = EPS, d[5] = DE, d[6] = Div Yield (%), d[7] = Market Cap (Baht), d[8] = Payout Ratio (%)
    const deValue = d[5] != null ? d[5] * 100 : null; // Multiply DE by 100 to match Yahoo's scale

    return Response.json(
      {
        pe: d[1],
        pb: d[2],
        roe: d[3],
        eps: d[4],
        de: deValue,
        deMissing: deValue == null,
        divYield: d[6],
        marketCap: fmtMarketCap(d[7]),
        payoutRatio: d[8],
      },
      { headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=60' } }
    );
  } catch (err) {
    return Response.json({ error: 'fetch_failed' }, { status: 500 });
  }
}

