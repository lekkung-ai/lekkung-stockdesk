import rawSectorMap from '@/data/scans/sector_map.json';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const YAHOO_HEADERS = {
  'User-Agent': UA,
  Accept: 'application/json',
  Referer: 'https://finance.yahoo.com',
};

// ── Ticker → broad sector lookup (same taxonomy as SectorFlow) ────────────────
// sector_map.json: { sectors: [{ sector, subsector, tickers[] }] }
const TICKER_SECTOR: Record<string, string> = {};
for (const entry of (rawSectorMap as { sectors: { sector: string; subsector: string; tickers: string[] }[] }).sectors) {
  for (const ticker of entry.tickers) {
    if (!TICKER_SECTOR[ticker]) TICKER_SECTOR[ticker] = entry.sector;
  }
}

// ── Settrade cookie ───────────────────────────────────────────────────────────

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

// ── Settrade SET100 stock data ────────────────────────────────────────────────

interface SettradeSock {
  symbol: string;
  nameEN: string;
  prior: number;      // previous close price
  last: number;       // current price
  change: number;     // last - prior
  percentChange: number;
  listedShare: number; // total listed shares (จำนวนหุ้นจดทะเบียนชำระแล้ว)
  marketCap: number;   // prior × listedShare (previous day market cap)
  sectorName: string;
}

async function fetchSET100Stocks(): Promise<SettradeSock[] | null> {
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
          return list.map((s: Record<string, unknown>) => ({
            symbol:         String(s.symbol ?? ''),
            nameEN:         String(s.nameEN ?? s.symbol ?? ''),
            prior:          Number(s.prior ?? 0),
            last:           Number(s.last ?? 0),
            change:         Number(s.change ?? 0),
            percentChange:  Number(s.percentChange ?? 0),
            listedShare:    Number(s.listedShare ?? 0),
            marketCap:      Number(s.marketCap ?? 0),
            sectorName:     String(s.sectorName ?? ''),
          }));
        }
      }
      if (attempt < 3) await new Promise(r => setTimeout(r, 600 * attempt));
    } catch {
      if (attempt < 3) await new Promise(r => setTimeout(r, 600 * attempt));
    }
  }
  return null;
}

// ── Yahoo Finance — SET Index level ──────────────────────────────────────────

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
    const prevClose: number = meta.chartPreviousClose ?? meta.previousClose ?? current;
    const change = current - prevClose;
    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;
    return { current, prevClose, change, changePercent };
  } catch {
    return { current: 0, prevClose: 0, change: 0, changePercent: 0 };
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export interface StockImpact {
  ticker: string;
  company: string;
  price: number;
  priceChange: number;
  pctChange: number;
  impact: number;
}

export interface SectorImpact {
  sector: string;
  impact: number;
  stockCount: number;
}

export async function GET() {
  const [stocks, setIndex] = await Promise.all([
    fetchSET100Stocks(),
    fetchSETIndex(),
  ]);

  if (!stocks || stocks.length === 0) {
    return Response.json(
      { error: 'upstream_unavailable', gainers: [], losers: [], sectorImpacts: [] },
      { status: 503 }
    );
  }

  // Total SET100 market cap (prior × listedShare per stock)
  const set100MarketCap = stocks.reduce((sum, s) => sum + s.marketCap, 0);

  // Estimate full-SET total market cap: SET100 ≈ 82% of full SET by market cap
  const totalSETMarketCap = set100MarketCap / 0.82;

  // Sector accumulator — computed in one pass alongside stock impacts
  const sectorAcc: Record<string, { impact: number; count: number }> = {};

  const impacts: StockImpact[] = stocks
    .map(s => {
      if (s.listedShare <= 0 || totalSETMarketCap <= 0 || setIndex.current <= 0) return null;

      // Official SET Impact formula:
      // Impact = (Last - Prior) × ListedShares × Current_SET_Index / Total_SET_MarketCap
      const impact = (s.change * s.listedShare * setIndex.current) / totalSETMarketCap;

      // Accumulate per broad sector (same taxonomy as SectorFlow)
      const sec = TICKER_SECTOR[s.symbol] ?? s.sectorName ?? 'Other';
      if (!sectorAcc[sec]) sectorAcc[sec] = { impact: 0, count: 0 };
      sectorAcc[sec].impact += impact;
      sectorAcc[sec].count += 1;

      return {
        ticker:      s.symbol,
        company:     s.nameEN,
        price:       s.last,
        priceChange: s.change,
        pctChange:   s.percentChange,
        impact:      Math.round(impact * 10000) / 10000,
      };
    })
    .filter((x): x is StockImpact => x !== null);

  // Sort by impact descending
  impacts.sort((a, b) => b.impact - a.impact);

  const gainers = impacts.filter(x => x.impact > 0).slice(0, 10);
  const losers  = impacts.filter(x => x.impact < 0).reverse().slice(0, 10);

  const sectorImpacts: SectorImpact[] = Object.entries(sectorAcc)
    .map(([sector, { impact, count }]) => ({
      sector,
      impact: Math.round(impact * 10000) / 10000,
      stockCount: count,
    }))
    .sort((a, b) => b.impact - a.impact);

  return Response.json(
    { setIndex, set100MarketCap, totalSETMarketCap, gainers, losers, sectorImpacts },
    { headers: { 'Cache-Control': 'public, max-age=120, stale-while-revalidate=60' } }
  );
}
