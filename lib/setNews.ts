import type { FeedItem } from './feedParsing';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

interface SetRawNewsInfo {
  id: string;
  symbol?: string;
  headline: string;
  datetime: string;
  url?: string;
}

async function getSessionCookie(symbol: string, timeoutMs: number): Promise<string> {
  try {
    const res = await fetch(`https://www.settrade.com/th/equities/quote/${encodeURIComponent(symbol)}/news`, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8',
      },
      signal: AbortSignal.timeout(timeoutMs),
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

export async function fetchSetNews(
  symbol = 'SET',
  revalidateSec = 60,
  timeoutMs = 12000,
  limit = 40
): Promise<FeedItem[]> {
  const targetSymbol = symbol && symbol !== 'ALL' && symbol !== 'GENERAL' && symbol !== '_' ? symbol : 'SET';
  const url = `https://www.settrade.com/api/set/news/${encodeURIComponent(targetSymbol)}/list?limit=${limit}`;

  try {
    const cookie = await getSessionCookie(targetSymbol, Math.min(timeoutMs, 5000));
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8',
        Referer: `https://www.settrade.com/th/equities/quote/${targetSymbol}/news`,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      next: { revalidate: revalidateSec },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      console.log(`[news] FAIL  SET -> HTTP ${res.status} (${url})`);
      return [];
    }

    const data = await res.json();
    const rows: SetRawNewsInfo[] = Array.isArray(data?.newsInfoList) ? data.newsInfoList : [];

    if (rows.length === 0) {
      console.log(`[news] FAIL  SET -> 200 but 0 items (${url})`);
      return [];
    }

    const items: FeedItem[] = rows.map(row => {
      const ts = row.datetime ? new Date(row.datetime).getTime() : 0;
      const itemSymbol = row.symbol && row.symbol !== 'SET' ? row.symbol : undefined;
      const articleUrl =
        row.url ||
        `https://www.set.or.th/th/market/news-and-alert/newsdetails?id=${row.id}&symbol=${row.symbol || targetSymbol}`;

      return {
        title: row.headline,
        link: articleUrl,
        pubDate: row.datetime,
        ts,
        source: 'SET (ตลาดหลักทรัพย์)',
        tickerHint: itemSymbol,
      };
    });

    console.log(`[news] OK    SET -> ${items.length} items (${url})`);
    return items;
  } catch (err) {
    const e = err as Error;
    console.log(`[news] ERROR SET -> ${e.name}: ${e.message} (${url})`);
    return [];
  }
}
