const ST_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json',
  Referer: 'https://www.settrade.com',
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

export async function GET() {
  try {
    const [gRes, lRes] = await Promise.all([
      fetch('https://www.settrade.com/api/set/ranking/topGainer/set/S?count=20', { headers: ST_HEADERS }),
      fetch('https://www.settrade.com/api/set/ranking/topLoser/set/S?count=20', { headers: ST_HEADERS }),
    ]);
    if (!gRes.ok || !lRes.ok) return Response.json({ gainers: null, losers: null });
    const [gData, lData] = await Promise.all([gRes.json(), lRes.json()]);
    return Response.json(
      { gainers: pickList(gData).length, losers: pickList(lData).length },
      { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=30' } }
    );
  } catch {
    return Response.json({ gainers: null, losers: null });
  }
}
