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
  const symbol = toYahooSymbol(ticker.toUpperCase());

  const auth = await getYahooCrumb(symbol);
  if (!auth) return Response.json({ error: 'auth_failed' }, { status: 503 });

  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=defaultKeyStatistics,financialData,summaryDetail&crumb=${encodeURIComponent(auth.crumb)}`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': YF_UA, Accept: 'application/json', 'Accept-Language': 'en-US,en;q=0.9', Cookie: auth.cookie },
    });

    if (!res.ok) return Response.json({ error: `upstream_${res.status}` }, { status: res.status });

    const json = await res.json();
    const result = json?.quoteSummary?.result?.[0];
    if (!result) return Response.json({ error: 'no_data' }, { status: 404 });

    const ks = result.defaultKeyStatistics ?? {};
    const fd = result.financialData ?? {};
    const sd = result.summaryDetail ?? {};

    const roe = raw(fd.returnOnEquity);
    const divYield = raw(sd.dividendYield);
    const mcap = raw(sd.marketCap);
    // trailingPE is inconsistently placed across Yahoo Finance modules — try all known paths
    const pe = [raw(sd.trailingPE), raw(ks.trailingPE), raw(ks.forwardPE), raw((result.price ?? {}).trailingPE)]
      .find(v => v != null && v !== 0) ?? null;
    const de = raw(fd.debtToEquity);

    return Response.json(
      {
        pe,
        pb: raw(ks.priceToBook),
        roe: roe != null ? roe * 100 : null,
        eps: raw(ks.trailingEps),
        de,
        deMissing: de == null,
        divYield: divYield != null ? divYield * 100 : null,
        marketCap: fmtMarketCap(mcap),
      },
      { headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=60' } }
    );
  } catch {
    return Response.json({ error: 'fetch_failed' }, { status: 500 });
  }
}
