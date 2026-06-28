import type { NextRequest } from 'next/server';

// SET index constituent lists, sourced from settrade's composition endpoint.
const ALLOWED = new Set(['SET50', 'SET100']);

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function getSettradeCookie(): Promise<string> {
  try {
    const res = await fetch('https://www.settrade.com/th/home', {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8',
      },
    });
    const raw: string[] =
      typeof (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === 'function'
        ? (res.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
        : (res.headers.get('set-cookie') ?? '').split(/,(?=\s*\w+=)/);
    return raw.map(c => c.split(';')[0].trim()).filter(Boolean).join('; ');
  } catch {
    return '';
  }
}

interface SettradeStock {
  symbol: string;
  last: number;
  change: number;
  percentChange: number;
  marketCap: number | null;
  peRatio: number | null;
  pbRatio: number | null;
  dividendYield: number | null;
  sectorName: string;
  nameTH: string;
}

async function fetchComposition(index: string): Promise<SettradeStock[] | null> {
  const url = `https://www.settrade.com/api/set/index/${index}/composition`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const cookie = await getSettradeCookie();
    const headers: Record<string, string> = {
      'User-Agent': UA,
      Accept: '*/*',
      'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8',
      'Content-Type': 'application/json',
      Referer: `https://www.settrade.com/th/equities/quote/${index}/composition`,
      Origin: 'https://www.settrade.com',
    };
    if (cookie) headers['Cookie'] = cookie;

    try {
      const res = await fetch(url, { headers, next: { revalidate: 300 } });
      if (res.ok) {
        const json = await res.json();
        const list = json?.composition?.stockInfos;
        if (Array.isArray(list) && list.length > 0) return list as SettradeStock[];
      }
      if (attempt < 3) await new Promise(r => setTimeout(r, 600 * attempt));
    } catch {
      if (attempt < 3) await new Promise(r => setTimeout(r, 600 * attempt));
    }
  }
  return null;
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ index: string }> }
) {
  const { index } = await ctx.params;
  const idx = index.toUpperCase();
  if (!ALLOWED.has(idx)) {
    return Response.json({ items: [], error: 'invalid_index' }, { status: 400 });
  }

  const list = await fetchComposition(idx);
  if (!list) {
    return Response.json({ items: [], error: 'upstream_blocked' });
  }

  const items = list.map(s => ({
    symbol: s.symbol,
    last: s.last,
    change: s.change,
    percentChange: s.percentChange,
    marketCap: s.marketCap,
    pe: s.peRatio,
    pb: s.pbRatio,
    divYield: s.dividendYield,
    sectorCode: s.sectorName,
    nameTH: s.nameTH,
  }));

  return Response.json(
    { index: idx, items },
    { headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=120' } }
  );
}
