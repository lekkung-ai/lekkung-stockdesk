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
        'free_cash_flow_ttm',
        'net_debt_fq',
        'total_shares_outstanding',
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
    const fcfRaw = typeof row[2] === 'number' && Number.isFinite(row[2]) ? row[2] : null;
    const netDebtRaw = typeof row[3] === 'number' && Number.isFinite(row[3]) ? row[3] : null;
    const sharesRaw = typeof row[4] === 'number' && Number.isFinite(row[4]) ? row[4] : null;

    return Response.json(
      {
        ticker: symbol,
        price,
        fcf: fcfRaw != null ? fcfRaw / 1e6 : null, // ล้านบาท
        netDebt: netDebtRaw != null ? netDebtRaw / 1e6 : null, // ล้านบาท (ติดลบได้ = มีเงินสดสุทธิ)
        shares: sharesRaw != null ? sharesRaw / 1e6 : null, // ล้านหุ้น
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
