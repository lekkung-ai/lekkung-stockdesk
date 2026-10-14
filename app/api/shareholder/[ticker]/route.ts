import type { NextRequest } from 'next/server';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const SETTRADE_HOME = 'https://www.settrade.com/th/home';

async function getSessionCookie(): Promise<string> {
  try {
    const res = await fetch(SETTRADE_HOME, {
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

export interface MajorShareholderItem {
  sequence: number;
  name: string;
  nationality: string | null;
  numberOfShare: number;
  percentOfShare: number;
  isThaiNVDR: boolean;
}

export interface ShareholderData {
  symbol: string;
  bookCloseDate: string | null;
  caType: string | null;
  totalShareholder: number | null;
  percentScriptless: number | null;
  freeFloat: {
    bookCloseDate: string | null;
    caType: string | null;
    percentFreeFloat: number | null;
    numberOfHolder: number | null;
  } | null;
  majorShareholders: MajorShareholderItem[];
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const t = ticker.toUpperCase();
  // ?soft=1 (stock page): "no data" is a normal answer (delisted / renamed tickers), not a 404 the browser
  // logs as a console error — same as dcf-inputs / ddm-inputs. Every other caller keeps the 404.
  const soft = req.nextUrl.searchParams.get('soft') === '1';
  const noData = (status: number, body: object) =>
    soft && status === 404 ? Response.json({ ticker: t, noData: true }) : Response.json(body, { status });

  try {
    const cookie = await getSessionCookie();
    const res = await fetch(`https://www.settrade.com/api/set/stock/${encodeURIComponent(t)}/shareholder`, {
      headers: {
        'User-Agent': UA,
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8',
        Referer: `https://www.settrade.com/th/equities/quote/${encodeURIComponent(t)}/major-shareholders`,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return noData(res.status, { error: `http_${res.status}`, symbol: t, majorShareholders: [] });
    }

    const data: ShareholderData = await res.json();
    return Response.json(data, {
      headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=600' },
    });
  } catch (err) {
    const e = err as Error;
    return Response.json(
      { error: e.message || 'fetch_failed', symbol: t, majorShareholders: [] },
      { status: 500 }
    );
  }
}
