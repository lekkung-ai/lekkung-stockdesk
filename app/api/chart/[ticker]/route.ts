import type { NextRequest } from 'next/server';
import { toYahooSymbol } from '@/lib/setTickers';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await context.params;
  const symbol = toYahooSymbol(ticker.toUpperCase());

  const interval = req.nextUrl.searchParams.get('interval') ?? '1d';
  const range = req.nextUrl.searchParams.get('range') ?? '2y';
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/json',
        Referer: 'https://finance.yahoo.com',
      },
    });

    if (!res.ok) {
      console.error(`[chart] ${symbol} upstream ${res.status}`);
      return Response.json({ error: 'upstream error' }, { status: res.status });
    }

    const json = await res.json();
    const result = json?.chart?.result?.[0];

    if (!result) {
      return Response.json({ error: 'no data' }, { status: 404 });
    }

    const timestamps: number[] = result.timestamp ?? [];
    const quote = result.indicators?.quote?.[0] ?? {};
    const opens: (number | null)[] = quote.open ?? [];
    const highs: (number | null)[] = quote.high ?? [];
    const lows: (number | null)[] = quote.low ?? [];
    const closes: (number | null)[] = quote.close ?? [];
    const volumes: (number | null)[] = quote.volume ?? [];

    const data = timestamps
      .map((ts, i) => {
        const o = opens[i];
        const h = highs[i];
        const l = lows[i];
        const c = closes[i];
        if (o == null || h == null || l == null || c == null) return null;
        const time = new Date(ts * 1000).toISOString().slice(0, 10);
        return {
          time,
          open: parseFloat(o.toFixed(2)),
          high: parseFloat(h.toFixed(2)),
          low: parseFloat(l.toFixed(2)),
          close: parseFloat(c.toFixed(2)),
          volume: volumes[i] ?? 0,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    return Response.json({ data }, {
      headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=60' },
    });
  } catch (err) {
    console.error(`[chart] ${symbol} fetch failed:`, err);
    return Response.json({ error: 'fetch failed' }, { status: 500 });
  }
}
