import type { NextRequest } from 'next/server';
import { isSetTicker } from '@/lib/setTickers';

export type PriceResult = {
  price: number;
  change: number;
  changePercent: number;
};

const YAHOO_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json',
  Referer: 'https://finance.yahoo.com',
};

async function fetchOne(yahooSymbol: string): Promise<PriceResult | null> {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=2d`;
  try {
    const res = await fetch(url, { headers: YAHOO_HEADERS });
    if (!res.ok) return null;
    const json = await res.json();
    const meta = json?.chart?.result?.[0]?.meta ?? {};
    const price: number | undefined = meta.regularMarketPrice;
    if (!price) return null;
    const prev: number | undefined = meta.chartPreviousClose ?? meta.previousClose;
    const change = prev ? price - prev : 0;
    const changePercent = prev ? ((price - prev) / prev) * 100 : 0;
    return { price, change, changePercent };
  } catch {
    return null;
  }
}

async function fetchWithConcurrency(
  items: { ticker: string; yahooSymbol: string }[],
  limit: number
): Promise<Record<string, PriceResult>> {
  const result: Record<string, PriceResult> = {};
  let idx = 0;

  async function worker() {
    while (idx < items.length) {
      const item = items[idx++];
      const data = await fetchOne(item.yahooSymbol);
      if (data) result[item.ticker] = data;
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return result;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbolsParam = searchParams.get('symbols') ?? '';
  const tickers = symbolsParam
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(Boolean);

  if (tickers.length === 0) {
    return Response.json({ prices: {} });
  }

  const items = tickers.map(ticker => ({
    ticker,
    yahooSymbol: isSetTicker(ticker) ? `${ticker}.BK` : ticker,
  }));

  const prices = await fetchWithConcurrency(items, 10);

  return Response.json({ prices }, {
    headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=30' },
  });
}
