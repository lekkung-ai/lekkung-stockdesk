import type { NextRequest } from 'next/server';

// Bulk P/BV + ROE for every ticker in a sector, one upstream call instead of
// N per-stock ones - same TradingView "thailand" scanner /api/fundamental/[ticker]
// already uses, just queried with an `in_range` membership filter instead of
// a single `equal` ticker.
export async function GET(req: NextRequest) {
  const tickersParam = req.nextUrl.searchParams.get('tickers');
  if (!tickersParam) {
    return Response.json({ error: 'missing_tickers' }, { status: 400 });
  }
  const tickers = tickersParam.split(',').map(t => t.trim().toUpperCase()).filter(Boolean);
  if (tickers.length === 0) {
    return Response.json({ data: [] });
  }

  try {
    const payload = {
      filter: [{ left: 'name', operation: 'in_range', right: tickers }],
      options: { lang: 'en' },
      markets: ['thailand'],
      columns: ['name', 'price_book_ratio', 'return_on_equity'],
      range: [0, tickers.length],
    };

    const res = await fetch('https://scanner.tradingview.com/thailand/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      return Response.json({ error: `upstream_${res.status}` }, { status: res.status });
    }

    const json = await res.json();
    const data = (json.data ?? []).map((row: { d: [string, number | null, number | null] }) => ({
      ticker: row.d[0],
      pb: row.d[1],
      roe: row.d[2],
    }));

    return Response.json(
      { data },
      { headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=60' } }
    );
  } catch {
    return Response.json({ error: 'fetch_failed' }, { status: 500 });
  }
}
