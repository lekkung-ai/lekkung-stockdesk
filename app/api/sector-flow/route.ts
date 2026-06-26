import type { NextRequest } from 'next/server';
import rawSectorMap from '@/data/scans/sector_map.json';

export const maxDuration = 60;

type Period = '1D' | '1W' | '1M' | '3M';

interface RawSubsector {
  sector: string;
  subsector: string;
  tickers: string[];
}

export interface SubsectorResult {
  name: string;
  pct: number;
}

export interface SectorFlowItem {
  sector: string;
  count: number;
  pct_change: number;
  subsectors: SubsectorResult[];
}

const YAHOO_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json',
  Referer: 'https://finance.yahoo.com',
};

const CACHE = new Map<string, { data: SectorFlowItem[]; expiresAt: number }>();
const CACHE_TTL = 30 * 60 * 1000;

async function fetchPctChange(ticker: string, period: Period): Promise<number | null> {
  const sym = encodeURIComponent(`${ticker}.BK`);
  const rangeParam =
    period === '1D' ? 'range=2d&interval=1d' :
    period === '1W' ? 'range=5d&interval=1d' :
    period === '1M' ? 'range=1mo&interval=1d' :
                      'range=3mo&interval=1d';

  try {
    const res = await fetch(
      `https://query2.finance.yahoo.com/v8/finance/chart/${sym}?${rangeParam}`,
      { headers: YAHOO_HEADERS, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;

    if (period === '1D') {
      const meta = result.meta ?? {};
      const price: number | undefined = meta.regularMarketPrice;
      const prev: number | undefined = meta.chartPreviousClose ?? meta.previousClose;
      if (!price || !prev) return null;
      return ((price - prev) / prev) * 100;
    }

    const closes = (result.indicators?.quote?.[0]?.close ?? []) as (number | null)[];
    const valid = closes.filter((c): c is number => c != null && isFinite(c));
    if (valid.length < 2) return null;
    return ((valid[valid.length - 1] - valid[0]) / valid[0]) * 100;
  } catch {
    return null;
  }
}

async function batchFetch(tickers: string[], period: Period, concurrency: number): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  let idx = 0;
  async function worker() {
    while (idx < tickers.length) {
      const t = tickers[idx++];
      const v = await fetchPctChange(t, period);
      if (v != null) out[t] = v;
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tickers.length) }, worker));
  return out;
}

function mean(vals: number[]): number {
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}

export async function GET(req: NextRequest) {
  const raw = new URL(req.url).searchParams.get('period') ?? '1D';
  const period = raw.toUpperCase() as Period;
  if (!['1D', '1W', '1M', '3M'].includes(period)) {
    return Response.json({ error: 'Invalid period' }, { status: 400 });
  }

  const cached = CACHE.get(period);
  if (cached && Date.now() < cached.expiresAt) {
    return Response.json(cached.data, {
      headers: {
        'Cache-Control': 'public, max-age=1800, stale-while-revalidate=300',
        'X-Cache': 'HIT',
      },
    });
  }

  // Build sector → subsector → tickers structure
  const sectorMap = new Map<string, Map<string, string[]>>();
  for (const entry of (rawSectorMap as { sectors: RawSubsector[] }).sectors) {
    if (!sectorMap.has(entry.sector)) sectorMap.set(entry.sector, new Map());
    sectorMap.get(entry.sector)!.set(entry.subsector, entry.tickers);
  }

  const allTickers = [
    ...new Set([...sectorMap.values()].flatMap(m => [...m.values()].flat())),
  ];

  const changes = await batchFetch(allTickers, period, 10);

  const result: SectorFlowItem[] = [];
  for (const [sector, subsMap] of sectorMap) {
    const allInSector = [...subsMap.values()].flat();
    const sectorVals = allInSector.map(t => changes[t]).filter((v): v is number => v != null);

    const subsectors: SubsectorResult[] = [...subsMap.entries()]
      .map(([name, tickers]) => ({
        name,
        pct: mean(tickers.map(t => changes[t]).filter((v): v is number => v != null)),
      }))
      .sort((a, b) => b.pct - a.pct);

    result.push({
      sector,
      count: allInSector.length,
      pct_change: mean(sectorVals),
      subsectors,
    });
  }

  result.sort((a, b) => b.pct_change - a.pct_change);

  CACHE.set(period, { data: result, expiresAt: Date.now() + CACHE_TTL });

  return Response.json(result, {
    headers: { 'Cache-Control': 'public, max-age=1800, stale-while-revalidate=300' },
  });
}
