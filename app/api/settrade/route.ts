import type { NextRequest } from 'next/server';

const ALLOWED_TYPES = new Set(['topGainer', 'topLoser', 'mostActiveValue', 'mostActiveVolume']);
const ALLOWED_MARKETS = new Set(['set', 'mai']);

async function getSettradeSessionCookie(): Promise<string> {
  try {
    const res = await fetch('https://www.settrade.com/th/home', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
    const rawCookies: string[] =
      typeof (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === 'function'
        ? (res.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
        : (res.headers.get('set-cookie') ?? '').split(/,(?=\s*\w+=)/);

    return rawCookies
      .map(raw => raw.split(';')[0].trim())
      .filter(Boolean)
      .join('; ');
  } catch {
    return '';
  }
}

function pickList(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    for (const k of ['stocks', 'securityList', 'data', 'items', 'list', 'result']) {
      if (Array.isArray(d[k])) return d[k] as unknown[];
    }
  }
  return [];
}

async function fetchWithRetry(url: string, maxTries = 3): Promise<unknown[] | null> {
  for (let attempt = 1; attempt <= maxTries; attempt++) {
    const cookie = await getSettradeSessionCookie();
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: '*/*',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8',
      Connection: 'keep-alive',
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      Referer: 'https://www.settrade.com/th/equities/market-summary/top-ranking/most-active-value',
      Origin: 'https://www.settrade.com',
    };
    if (cookie) headers['Cookie'] = cookie;

    try {
      const res = await fetch(url, { headers });
      if (res.ok) {
        const data = await res.json();
        const list = pickList(data);
        if (list.length > 0) return list;
      }
      // got 403 or empty — wait before retry (except last attempt)
      if (attempt < maxTries) await new Promise(r => setTimeout(r, 600 * attempt));
    } catch {
      if (attempt < maxTries) await new Promise(r => setTimeout(r, 600 * attempt));
    }
  }
  return null;
}

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type') ?? '';
  const market = (req.nextUrl.searchParams.get('market') ?? 'set').toLowerCase();
  if (!ALLOWED_TYPES.has(type)) {
    return Response.json({ items: [] }, { status: 400 });
  }
  const mkt = ALLOWED_MARKETS.has(market) ? market : 'set';
  const apiUrl = `https://www.settrade.com/api/set/ranking/${type}/${mkt}/S?count=20`;

  const list = await fetchWithRetry(apiUrl);
  if (list && list.length > 0) {
    return Response.json(
      { items: list },
      { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=30' } }
    );
  }
  return Response.json({ items: [], error: 'upstream_blocked' });
}
