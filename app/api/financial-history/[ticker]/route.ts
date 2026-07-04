import type { NextRequest } from 'next/server';
import https from 'https';

const YF_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const TYPES = [
  'annualTotalRevenue',
  'annualNetIncome',
  'annualBasicEPS',
  'annualGrossProfit',
  'annualTotalAssets',
  'annualStockholdersEquity',
  'annualTotalLiabilitiesNetMinorityInterest',
  'annualOperatingCashFlow',
  'annualFreeCashFlow',
].join(',');

function httpsGet(url: string, headers: Record<string, string>): Promise<{ body: string; cookies: string[] }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.get(
      { hostname: parsed.hostname, path: parsed.pathname + parsed.search, headers, maxHeaderSize: 65536 },
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
    // Step 1: hit the quote page with the raw https module (avoids undici header overflow)
    const { cookies } = await httpsGet(
      `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/`,
      { 'User-Agent': YF_UA, Accept: 'text/html', 'Accept-Language': 'en-US,en;q=0.9' }
    );
    const cookie = cookies.map(c => c.split(';')[0].trim()).filter(Boolean).join('; ');
    if (!cookie) return null;

    // Step 2: crumb endpoint returns plain text, small headers — fetch is fine
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

interface TSPoint { asOfDate: string; reportedValue?: { raw: number } }
interface TSResult { meta: { type: string[] }; [key: string]: unknown }

function seriesOf(results: TSResult[], type: string): Map<string, number> {
  const out = new Map<string, number>();
  const r = results.find(x => x.meta?.type?.[0] === type);
  const arr = r ? (r[type] as (TSPoint | null)[] | undefined) : undefined;
  if (!Array.isArray(arr)) return out;
  for (const point of arr) {
    if (point?.asOfDate && point.reportedValue?.raw != null) {
      out.set(point.asOfDate.slice(0, 4), point.reportedValue.raw);
    }
  }
  return out;
}

export interface YearlyFinancials {
  year: string;
  totalRevenue: number | null;
  netIncome: number | null;
  eps: number | null;
  grossProfit: number | null;
  totalAssets: number | null;
  stockholdersEquity: number | null;
  totalLiabilities: number | null;
  operatingCashFlow: number | null;
  freeCashFlow: number | null;
  grossMargin: number | null;   // %
  netMargin: number | null;     // %
  roe: number | null;           // %
  roa: number | null;           // %
  de: number | null;            // ratio
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await context.params;
  const symbol = `${ticker.toUpperCase()}.BK`;

  try {
    const auth = await getYahooCrumb(symbol);
    if (!auth) return Response.json({ error: 'auth_failed', years: [] }, { status: 502 });

    const url = new URL(`https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${symbol}`);
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('type', TYPES);
    url.searchParams.set('period1', '1000000000');   // 2001-09-09 — comfortably before any annual report we need
    url.searchParams.set('period2', String(Math.floor(Date.now() / 1000) + 86400));
    url.searchParams.set('crumb', auth.crumb);

    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': YF_UA, Accept: 'application/json', Cookie: auth.cookie },
    });
    if (!res.ok) return Response.json({ error: `upstream_${res.status}`, years: [] }, { status: res.status });

    const json = await res.json();
    const results: TSResult[] = json?.timeseries?.result ?? [];
    if (!Array.isArray(results) || results.length === 0) {
      return Response.json({ error: 'no_data', years: [] }, { status: 404 });
    }

    const revenue = seriesOf(results, 'annualTotalRevenue');
    const netIncome = seriesOf(results, 'annualNetIncome');
    const eps = seriesOf(results, 'annualBasicEPS');
    const grossProfit = seriesOf(results, 'annualGrossProfit');
    const totalAssets = seriesOf(results, 'annualTotalAssets');
    const equity = seriesOf(results, 'annualStockholdersEquity');
    const liabilities = seriesOf(results, 'annualTotalLiabilitiesNetMinorityInterest');
    const opCashFlow = seriesOf(results, 'annualOperatingCashFlow');
    const freeCashFlow = seriesOf(results, 'annualFreeCashFlow');

    const years = [...new Set([...revenue.keys(), ...netIncome.keys()])].sort().reverse().slice(0, 4);

    const yearly: YearlyFinancials[] = years.map(year => {
      const rev = revenue.get(year) ?? null;
      const ni = netIncome.get(year) ?? null;
      const gp = grossProfit.get(year) ?? null;
      const ta = totalAssets.get(year) ?? null;
      const eq = equity.get(year) ?? null;
      const li = liabilities.get(year) ?? null;
      return {
        year,
        totalRevenue: rev,
        netIncome: ni,
        eps: eps.get(year) ?? null,
        grossProfit: gp,
        totalAssets: ta,
        stockholdersEquity: eq,
        totalLiabilities: li,
        operatingCashFlow: opCashFlow.get(year) ?? null,
        freeCashFlow: freeCashFlow.get(year) ?? null,
        grossMargin: gp != null && rev ? (gp / rev) * 100 : null,
        netMargin: ni != null && rev ? (ni / rev) * 100 : null,
        roe: ni != null && eq ? (ni / eq) * 100 : null,
        roa: ni != null && ta ? (ni / ta) * 100 : null,
        de: li != null && eq ? li / eq : null,
      };
    });

    return Response.json(
      { years: yearly },
      { headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=600' } }
    );
  } catch {
    return Response.json({ error: 'fetch_failed', years: [] }, { status: 500 });
  }
}
