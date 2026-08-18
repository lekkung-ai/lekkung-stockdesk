import type { NextRequest } from 'next/server';
import { TRADINGVIEW_HEADERS } from '@/lib/tradingview';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await context.params;
  const symbol = ticker.toUpperCase().trim();

  if (!symbol) {
    return Response.json({ error: 'missing_ticker' }, { status: 400 });
  }

  try {
    const payload = {
      filter: [{ left: 'name', operation: 'equal', right: symbol }],
      options: { lang: 'en' },
      markets: ['thailand'],
      columns: [
        'name',
        'close',
        'dps_common_stock_prim_issue_fy',
        'dividends_yield_current',
        'dividend_payout_ratio_fy',
      ],
      range: [0, 1],
    };

    const res = await fetch('https://scanner.tradingview.com/thailand/scan', {
      method: 'POST',
      headers: TRADINGVIEW_HEADERS,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      return Response.json({ error: `upstream_${res.status}` }, { status: res.status });
    }

    const json = await res.json();
    const row = json.data?.[0]?.d;

    if (!row) {
      return Response.json({ error: 'no_data' }, { status: 404 });
    }

    const price = typeof row[1] === 'number' && Number.isFinite(row[1]) ? row[1] : null;
    const dps = typeof row[2] === 'number' && Number.isFinite(row[2]) ? row[2] : null;
    const dividendYield = typeof row[3] === 'number' && Number.isFinite(row[3]) ? row[3] : null;
    const payoutRatio = typeof row[4] === 'number' && Number.isFinite(row[4]) ? row[4] : null;

    return Response.json(
      {
        ticker: symbol,
        price,
        dps,
        dividendYield,
        payoutRatio,
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
        },
      }
    );
  } catch {
    return Response.json({ error: 'fetch_failed' }, { status: 500 });
  }
}