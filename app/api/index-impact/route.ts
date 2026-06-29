const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const YAHOO_HEADERS = {
  'User-Agent': UA,
  Accept: 'application/json',
  Referer: 'https://finance.yahoo.com',
};

// ── Yahoo crumb (module-level cache, reused across requests) ──────────────────
let _yfCrumb: string | null = null;
let _yfCookie: string | null = null;
let _yfCrumbExp = 0;

async function getYahooCrumb(): Promise<{ crumb: string; cookie: string } | null> {
  const now = Date.now();
  if (_yfCrumb && _yfCookie && now < _yfCrumbExp) {
    return { crumb: _yfCrumb, cookie: _yfCookie };
  }
  try {
    // Step 1: get consent cookie from fc.yahoo.com
    const r1 = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': UA } });
    const rawCookies = r1.headers.get('set-cookie') ?? '';
    const cookie = rawCookies
      .split(/,(?=\s*\w+=)/)
      .map(c => c.split(';')[0].trim())
      .filter(Boolean)
      .join('; ');

    // Step 2: get crumb
    const r2 = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': UA, Cookie: cookie },
    });
    const crumb = (await r2.text()).trim();
    if (crumb && crumb.length > 3 && !crumb.startsWith('{')) {
      _yfCrumb = crumb;
      _yfCookie = cookie;
      _yfCrumbExp = now + 25 * 60 * 1000; // cache 25 min
      return { crumb, cookie };
    }
  } catch { /* ignore */ }
  return null;
}

// ── Settrade cookie + SET100 composition ─────────────────────────────────────

async function getSettradeCookie(): Promise<string> {
  try {
    const res = await fetch('https://www.settrade.com/th/home', {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8',
      },
    });
    const raw: string[] =
      typeof (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === 'function'
        ? (res.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
        : (res.headers.get('set-cookie') ?? '').split(/,(?=\s*\w+=)/);
    return raw.map(c => c.split(';')[0].trim()).filter(Boolean).join('; ');
  } catch {
    return '';
  }
}

async function fetchSET100Symbols(): Promise<string[] | null> {
  const url = 'https://www.settrade.com/api/set/index/SET100/composition';
  for (let attempt = 1; attempt <= 3; attempt++) {
    const cookie = await getSettradeCookie();
    const headers: Record<string, string> = {
      'User-Agent': UA,
      Accept: '*/*',
      'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8',
      'Content-Type': 'application/json',
      Referer: 'https://www.settrade.com/th/equities/quote/SET100/composition',
      Origin: 'https://www.settrade.com',
    };
    if (cookie) headers['Cookie'] = cookie;
    try {
      const res = await fetch(url, { headers, next: { revalidate: 3600 } });
      if (res.ok) {
        const json = await res.json();
        const list = json?.composition?.stockInfos;
        if (Array.isArray(list) && list.length > 0) {
          return list.map((s: { symbol: string }) => s.symbol);
        }
      }
      if (attempt < 3) await new Promise(r => setTimeout(r, 600 * attempt));
    } catch {
      if (attempt < 3) await new Promise(r => setTimeout(r, 600 * attempt));
    }
  }
  return null;
}

// ── Yahoo Finance ─────────────────────────────────────────────────────────────

interface SETIndexData {
  current: number;
  prevClose: number;
  change: number;
  changePercent: number;
}

async function fetchSETIndex(): Promise<SETIndexData> {
  try {
    const url =
      'https://query2.finance.yahoo.com/v8/finance/chart/%5ESET.BK?interval=1d&range=2d';
    const res = await fetch(url, { headers: YAHOO_HEADERS });
    if (!res.ok) return { current: 0, prevClose: 0, change: 0, changePercent: 0 };
    const json = await res.json();
    const meta = json?.chart?.result?.[0]?.meta ?? {};
    const current: number = meta.regularMarketPrice ?? 0;
    const prevClose: number =
      meta.chartPreviousClose ?? meta.previousClose ?? current;
    const change = current - prevClose;
    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;
    return { current, prevClose, change, changePercent };
  } catch {
    return { current: 0, prevClose: 0, change: 0, changePercent: 0 };
  }
}

interface YahooQuote {
  symbol: string;
  shortName?: string;
  longName?: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  marketCap?: number;
  sharesOutstanding?: number;
}

async function fetchBatchQuotes(yahooSymbols: string[]): Promise<YahooQuote[]> {
  const CHUNK = 50;
  const chunks: string[][] = [];
  for (let i = 0; i < yahooSymbols.length; i += CHUNK) {
    chunks.push(yahooSymbols.slice(i, i + CHUNK));
  }

  const auth = await getYahooCrumb();
  const crumbParam = auth ? `&crumb=${encodeURIComponent(auth.crumb)}` : '';
  const cookieHeader = auth ? auth.cookie : '';

  const responses = await Promise.all(
    chunks.map(async chunk => {
      const symsParam = chunk.join(',');
      const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symsParam)}${crumbParam}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,marketCap,sharesOutstanding,shortName&lang=en-US&region=US`;
      try {
        const res = await fetch(url, {
          headers: { ...YAHOO_HEADERS, ...(cookieHeader ? { Cookie: cookieHeader } : {}) },
        });
        if (!res.ok) return [] as YahooQuote[];
        const json = await res.json();
        return (json?.quoteResponse?.result ?? []) as YahooQuote[];
      } catch {
        return [] as YahooQuote[];
      }
    })
  );

  return responses.flat();
}

// ── Main handler ──────────────────────────────────────────────────────────────

export interface StockImpact {
  ticker: string;
  company: string;
  price: number;
  priceChange: number;
  pctChange: number;
  marketCap: number;
  impact: number;
}

export async function GET() {
  const [symbols, setIndex] = await Promise.all([
    fetchSET100Symbols(),
    fetchSETIndex(),
  ]);

  if (!symbols || symbols.length === 0) {
    return Response.json(
      { error: 'upstream_unavailable', gainers: [], losers: [] },
      { status: 503 }
    );
  }

  const yahooSymbols = symbols.map(s => `${s}.BK`);
  const quotes = await fetchBatchQuotes(yahooSymbols);

  const quoteMap = new Map(
    quotes.map(q => [q.symbol.replace('.BK', '').toUpperCase(), q])
  );

  // Divisor: totalMarketCap / SET prevClose
  const totalMarketCap = quotes.reduce((sum, q) => sum + (q.marketCap ?? 0), 0);
  const prevClose = setIndex.prevClose || setIndex.current;
  const divisor = prevClose > 0 && totalMarketCap > 0 ? totalMarketCap / prevClose : 0;

  const impacts: StockImpact[] = symbols
    .map(sym => {
      const q = quoteMap.get(sym.toUpperCase());
      if (!q) return null;

      const priceChange = q.regularMarketChange ?? 0;
      const pctChange = q.regularMarketChangePercent ?? 0;
      const marketCap = q.marketCap ?? 0;
      const sharesOutstanding = q.sharesOutstanding;
      const price = q.regularMarketPrice ?? 0;
      const company = q.shortName ?? sym;

      let impact: number;
      if (divisor > 0 && sharesOutstanding && priceChange !== 0) {
        // Primary: direct formula using shares outstanding
        impact = (priceChange * sharesOutstanding) / divisor;
      } else if (totalMarketCap > 0 && prevClose > 0) {
        // Fallback: proportional formula
        impact = (pctChange / 100) * (marketCap / totalMarketCap) * prevClose;
      } else {
        impact = 0;
      }

      return {
        ticker: sym,
        company,
        price,
        priceChange,
        pctChange,
        marketCap,
        impact: Math.round(impact * 100) / 100,
      };
    })
    .filter((x): x is StockImpact => x !== null);

  // Sort descending by impact
  impacts.sort((a, b) => b.impact - a.impact);

  const gainers = impacts.filter(x => x.impact > 0).slice(0, 10);
  const losers = impacts.filter(x => x.impact < 0).reverse().slice(0, 10);

  return Response.json(
    { setIndex, totalMarketCap, divisor, gainers, losers },
    { headers: { 'Cache-Control': 'public, max-age=180, stale-while-revalidate=60' } }
  );
}
