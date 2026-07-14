import type { FeedItem } from './feedParsing';

// efinancethai has no RSS feed - probed 2026-07-14 via the LatestNews page's
// own XHR calls (devtools network tab). This is the backend JSON API the
// page itself calls; colTypeID=21 is the full "all news" stream (very
// fresh, deep pagination - 130+ pages at pageSize=15 at probe time),
// colTypeID=0 is a much smaller curated-highlights subset. Using 21.
const EFIN_URL = 'https://www.efinancethai.com/ServiceNew/ServiceController.ashx';
const EFIN_COL_TYPE_ID = 21;

interface EfinRawItem {
  id: number;
  title: string;
  LastUpdate: string; // "YYYY-MM-DD HH:mm:ss" - no explicit timezone, Thai site -> Asia/Bangkok
  security: string; // ticker, when the article is tagged to one; empty string otherwise
  full_path_link: string;
}

interface EfinResponse {
  TotalPage?: number;
  Data?: EfinRawItem[];
}

function parseEfinDate(raw: string): number {
  if (!raw) return 0;
  const t = Date.parse(raw.replace(' ', 'T') + '+07:00');
  return Number.isNaN(t) ? 0 : t;
}

export async function fetchEfinanceThai(
  pageNumber: number,
  pageSize: number,
  revalidateSec: number,
  timeoutMs: number
): Promise<FeedItem[]> {
  const url = `${EFIN_URL}?colTypeID=${EFIN_COL_TYPE_ID}&pageNumber=${pageNumber}&pageSize=${pageSize}&typeColumn=true`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120' },
      next: { revalidate: revalidateSec },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      console.log(`[news] FAIL  EFIN -> HTTP ${res.status}  (${url})`);
      return [];
    }

    // The API declares Content-Type: application/json; charset=windows-874
    // (Thai legacy codepage) regardless of Accept-Charset - fetch's default
    // .text() decodes as UTF-8 and produces mojibake. Read raw bytes and
    // decode explicitly instead. (Verified 2026-07-14: 'windows-874' is a
    // valid label for both the browser/Node TextDecoder per the WHATWG
    // Encoding Standard.)
    const buf = await res.arrayBuffer();
    const text = new TextDecoder('windows-874').decode(buf);
    const data = JSON.parse(text) as EfinResponse;
    const rows = data.Data ?? [];
    if (rows.length === 0) {
      console.log(`[news] FAIL  EFIN -> 200 but 0 items (not JSON as expected?)  (${url})`);
      return [];
    }

    const items: FeedItem[] = rows.map(row => ({
      title: row.title,
      link: row.full_path_link,
      pubDate: row.LastUpdate,
      ts: parseEfinDate(row.LastUpdate),
      source: 'EFIN',
      tickerHint: row.security ? row.security.trim() : undefined,
    }));
    console.log(`[news] OK    EFIN -> ${items.length} items  (${url})`);
    return items;
  } catch (err) {
    const e = err as Error;
    console.log(`[news] ERROR EFIN -> ${e.name}: ${e.message}  (${url})`);
    return [];
  }
}
