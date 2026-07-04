import type { NextRequest } from 'next/server';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Settrade's own equity-quote infrastructure (warrants trade on the SET main
// board, unlike broker-issued DW products which live under a separate API).
// A plain request gets an Incapsula 403 challenge page; visiting the quote
// HTML page first picks up a session cookie that clears it — same pattern
// already used by investor-type/route.ts and corporate-action/route.ts.
async function getSessionCookie(parent: string): Promise<string> {
  try {
    const res = await fetch(`https://www.settrade.com/th/equities/quote/${encodeURIComponent(parent)}/overview`, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8',
      },
      signal: AbortSignal.timeout(8000),
    });
    const rawCookies: string[] =
      typeof (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === 'function'
        ? (res.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
        : (res.headers.get('set-cookie') ?? '').split(/,(?=\s*\w+=)/);
    return rawCookies.map(c => c.split(';')[0].trim()).filter(Boolean).join('; ');
  } catch {
    return '';
  }
}

interface RawWarrant {
  symbol: string;
  last: number;
  prior: number;
  exercisePrice: number;
  exerciseRatio: string; // e.g. "1 : 1.03"
  maturityDate: string;  // e.g. "2028-07-06T00:00:00+07:00"
}

export interface WarrantInfo {
  symbol: string;
  parent: string;
  childPrice: number;
  exercisePrice: number;
  exerciseRatio: number; // parsed from the "1 : X" string
  maturityDate: string | null; // ISO date (yyyy-mm-dd)
}

function parseRatio(raw: string): number {
  const m = raw.match(/:\s*([\d.]+)/);
  return m ? parseFloat(m[1]) : 1;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ parent: string }> }
) {
  const { parent } = await context.params;
  const p = parent.toUpperCase();

  try {
    const cookie = await getSessionCookie(p);
    const res = await fetch(`https://www.settrade.com/api/set/stock/${encodeURIComponent(p)}/related-product/W`, {
      headers: {
        'User-Agent': UA,
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8',
        Referer: `https://www.settrade.com/th/equities/quote/${p}/overview`,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return Response.json({ warrants: [], error: `upstream_${res.status}` }, { status: res.status });

    const json = await res.json();
    const raw: RawWarrant[] = Array.isArray(json?.relatedProducts) ? json.relatedProducts : [];

    const warrants: WarrantInfo[] = raw.map(w => ({
      symbol: w.symbol,
      parent: p,
      childPrice: w.last,
      exercisePrice: w.exercisePrice,
      exerciseRatio: parseRatio(w.exerciseRatio),
      maturityDate: w.maturityDate ? w.maturityDate.slice(0, 10) : null,
    }));

    return Response.json(
      { warrants },
      { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=60' } }
    );
  } catch {
    return Response.json({ warrants: [], error: 'fetch_failed' }, { status: 500 });
  }
}
