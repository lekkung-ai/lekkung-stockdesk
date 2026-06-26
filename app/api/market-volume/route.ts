const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json',
  Referer: 'https://www.settrade.com',
  'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8',
};

function extractVolume(data: unknown): number | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;

  for (const key of [
    'totalValue',
    'totalTurnover',
    'turnoverValue',
    'marketValue',
    'tradeValue',
    'tradingValue',
    'totalTradingValue',
    'volumeValue',
    'totalVolume',
    'value',
  ]) {
    const v = d[key];
    if (typeof v === 'number' && v > 0) {
      const abs = Math.abs(v);
      if (abs > 1_000_000_000) return v / 1_000_000;
      if (abs > 1_000_000) return v / 1_000;
      return v;
    }
  }

  // Nested: look one level deep
  for (const key of Object.keys(d)) {
    const sub = d[key];
    if (sub && typeof sub === 'object' && !Array.isArray(sub)) {
      const found = extractVolume(sub);
      if (found) return found;
    }
  }

  return null;
}

async function fetchWithSession(url: string): Promise<unknown | null> {
  try {
    // Get session cookie from settrade home (same pattern as other working routes)
    const homeRes = await fetch('https://www.settrade.com/th/home', {
      headers: {
        'User-Agent': HEADERS['User-Agent'],
        Accept: 'text/html,application/xhtml+xml',
        'Cache-Control': 'no-cache',
      },
    });
    const rawCookies: string[] =
      typeof (homeRes.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === 'function'
        ? (homeRes.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
        : (homeRes.headers.get('set-cookie') ?? '').split(/,(?=\s*\w+=)/);
    const cookie = rawCookies
      .map((raw: string) => raw.split(';')[0].trim())
      .filter(Boolean)
      .join('; ');

    const res = await fetch(url, {
      headers: { ...HEADERS, ...(cookie ? { Cookie: cookie } : {}) },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

const ENDPOINTS = [
  'https://www.settrade.com/api/set/index/SET/info',
  'https://www.settrade.com/api/set/index/mai/info',
];

export async function GET() {
  for (const url of ENDPOINTS) {
    const data = await fetchWithSession(url);
    if (!data) continue;
    const d = data as Record<string, unknown>;
    // value field is in baht (raw), convert to million baht
    const raw = typeof d['value'] === 'number' ? d['value'] : null;
    if (raw && raw > 0) {
      const valueMillion = raw > 1_000_000 ? raw / 1_000_000 : raw;
      return Response.json(
        { value: valueMillion },
        { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=30' } }
      );
    }
  }

  return Response.json({ value: null });
}
