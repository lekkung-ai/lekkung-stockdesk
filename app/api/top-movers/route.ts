import type { NextRequest } from 'next/server';

const ST_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json',
  Referer: 'https://www.settrade.com',
};

const ENDPOINTS: Record<string, string> = {
  topGainer:        'https://www.settrade.com/api/set/ranking/topGainer/set/S?count=20',
  topLoser:         'https://www.settrade.com/api/set/ranking/topLoser/set/S?count=20',
  mostActiveValue:  'https://www.settrade.com/api/set/ranking/mostActiveValue/set/S?count=20',
  mostActiveVolume: 'https://www.settrade.com/api/set/ranking/mostActiveVolume/set/S?count=20',
};

function pickList(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    for (const k of ['securityList', 'data', 'items', 'list', 'result']) {
      if (Array.isArray(d[k])) return d[k] as unknown[];
    }
  }
  return [];
}

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type') ?? 'topGainer';
  const url = ENDPOINTS[type];
  if (!url) return Response.json({ items: [] });
  try {
    const res = await fetch(url, { headers: ST_HEADERS });
    if (!res.ok) return Response.json({ items: [] });
    const data = await res.json();
    return Response.json(
      { items: pickList(data) },
      { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=30' } }
    );
  } catch {
    return Response.json({ items: [] });
  }
}
