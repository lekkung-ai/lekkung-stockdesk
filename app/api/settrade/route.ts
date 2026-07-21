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

function pickList(data: unknown): unknown[] | null {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    // SETTrade's own ranking shape (rankingType/market/stocks) - if this key
    // is present at all, the upstream call genuinely succeeded and `stocks`
    // being empty means "no ranking yet" (pre-open), not a failed fetch.
    for (const k of ['stocks', 'securityList', 'data', 'items', 'list', 'result']) {
      if (Array.isArray(d[k])) return d[k] as unknown[];
    }
  }
  return null;
}

type FetchOutcome = { list: unknown[] } | { list: null; reason: 'blocked' | 'market_not_open' };

async function fetchWithRetry(url: string, maxTries = 3): Promise<FetchOutcome> {
  let sawValidEmptyResponse = false;

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
        if (list && list.length > 0) return { list };
        if (list !== null) {
          // Valid, well-shaped response - just no rows in it right now
          // (typically: market hasn't opened yet, ranking not computed for
          // today). Retrying won't change that within the same request, but
          // keep trying anyway in case it's a transient partial response.
          sawValidEmptyResponse = true;
        }
      }
      // got 403, malformed body, or empty — wait before retry (except last attempt)
      if (attempt < maxTries) await new Promise(r => setTimeout(r, 600 * attempt));
    } catch {
      if (attempt < maxTries) await new Promise(r => setTimeout(r, 600 * attempt));
    }
  }
  return { list: null, reason: sawValidEmptyResponse ? 'market_not_open' : 'blocked' };
}

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type') ?? '';
  const market = (req.nextUrl.searchParams.get('market') ?? 'set').toLowerCase();
  if (!ALLOWED_TYPES.has(type)) {
    return Response.json({ items: [] }, { status: 400 });
  }
  const mkt = ALLOWED_MARKETS.has(market) ? market : 'set';
  const apiUrl = `https://www.settrade.com/api/set/ranking/${type}/${mkt}/S?count=30`;

  const outcome = await fetchWithRetry(apiUrl);
  if ('list' in outcome && outcome.list) {
    return Response.json(
      { items: outcome.list },
      { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=30' } }
    );
  }
  return Response.json({ items: [], error: outcome.reason });
}
