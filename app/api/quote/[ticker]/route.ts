import type { NextRequest } from 'next/server';
import { toYahooSymbol } from '@/lib/setTickers';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await context.params;
  const symbol = toYahooSymbol(ticker.toUpperCase());
  // ?soft=1 (stock page): "no data" is a normal answer (delisted / renamed tickers), not a 404 the browser
  // logs as a console error — same as dcf-inputs / ddm-inputs. Every other caller keeps the 404.
  const soft = req.nextUrl.searchParams.get('soft') === '1';
  const noData = (status: number, body: object) =>
    soft && status === 404 ? Response.json({ ticker: ticker.toUpperCase(), noData: true }) : Response.json(body, { status });
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/json',
        Referer: 'https://finance.yahoo.com',
      },
    });

    if (!res.ok) return noData(res.status, { error: 'upstream' });

    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return noData(404, { error: 'no data' });

    const meta = result.meta ?? {};
    const shortName: string = meta.shortName ?? meta.longName ?? ticker;

    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];
    const valid = closes.filter((c): c is number => c != null);

    if (valid.length < 1) return noData(404, { error: 'insufficient data' });

    const last = valid[valid.length - 1] ?? meta.regularMarketPrice;
    const prev = valid.length >= 2
      ? valid[valid.length - 2]
      : (meta.previousClose ?? null);
    const computedChange = (prev != null && prev !== 0) ? ((last - prev) / prev) * 100 : null;
    const change1d = computedChange ?? meta.regularMarketChangePercent ?? 0;

    return Response.json(
      {
        price: parseFloat(last.toFixed(2)),
        change1d: parseFloat(change1d.toFixed(2)),
        shortName,
      },
      { headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=60' } }
    );
  } catch {
    return Response.json({ error: 'fetch failed' }, { status: 500 });
  }
}
