export interface InvestorGroup {
  type: string;
  buy: number;   // million baht
  sell: number;  // million baht
  net: number;   // million baht
}

const TYPE_MAP: Record<string, string> = {
  institution: 'สถาบัน',
  proprietary: 'บัญชีบล.',
  foreign: 'ต่างประเทศ',
  individual: 'รายย่อย',
};

const TYPE_ORDER = ['สถาบัน', 'ต่างประเทศ', 'บัญชีบล.', 'รายย่อย'];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function getSessionCookie(): Promise<string> {
  try {
    const res = await fetch(
      'https://www.settrade.com/th/equities/market-data/historical-report/investor-type',
      {
        headers: {
          'User-Agent': UA,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8',
          'Cache-Control': 'no-cache',
        },
        signal: AbortSignal.timeout(8000),
      }
    );
    const rawCookies: string[] =
      typeof (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === 'function'
        ? (res.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
        : (res.headers.get('set-cookie') ?? '').split(/,(?=\s*\w+=)/);
    return rawCookies
      .map((raw: string) => raw.split(';')[0].trim())
      .filter(Boolean)
      .join('; ');
  } catch {
    return '';
  }
}

export async function GET() {
  const cookie = await getSessionCookie();
  if (!cookie) {
    return Response.json({ data: null, error: 'session_failed' });
  }

  try {
    const res = await fetch(
      'https://www.settrade.com/api/set/market/set/investor-type-summary',
      {
        headers: {
          'User-Agent': UA,
          Accept: 'application/json, text/plain, */*',
          'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8',
          Referer: 'https://www.settrade.com/th/equities/market-data/historical-report/investor-type',
          Cookie: cookie,
        },
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!res.ok) {
      return Response.json({ data: null, error: `upstream_${res.status}` });
    }

    const json = await res.json();
    const investors: unknown[] = json?.oneday?.investors ?? [];
    if (!Array.isArray(investors) || investors.length === 0) {
      return Response.json({ data: null, error: 'no_data' });
    }

    const groups: InvestorGroup[] = [];
    for (const item of investors) {
      if (!item || typeof item !== 'object') continue;
      const d = item as Record<string, unknown>;
      const thaiName = TYPE_MAP[String(d.type ?? '').toLowerCase()];
      if (!thaiName) continue;

      const buy = typeof d.buyValue === 'number' ? d.buyValue / 1_000_000 : 0;
      const sell = typeof d.sellValue === 'number' ? d.sellValue / 1_000_000 : 0;
      const net = typeof d.netValue === 'number' ? d.netValue / 1_000_000 : buy - sell;

      groups.push({ type: thaiName, buy, sell, net });
    }

    if (groups.length < 3) {
      return Response.json({ data: null, error: 'incomplete_data' });
    }

    groups.sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type));

    return Response.json(
      { data: groups },
      { headers: { 'Cache-Control': 'public, max-age=900, stale-while-revalidate=300' } }
    );
  } catch {
    return Response.json({ data: null, error: 'fetch_failed' });
  }
}
