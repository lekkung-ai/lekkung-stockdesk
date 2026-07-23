import rawSectorMap from '@/data/scans/sector_map.json';

// Shared RSS-parsing + ticker-extraction utilities, factored out of
// app/api/news/[ticker]/route.ts so app/api/research/[ticker]/route.ts can
// reuse the exact same battle-tested logic instead of duplicating it.

export interface FeedItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  ts: number; // parsed pubDate (ms) for sorting; 0 if unknown
  stale?: boolean; // true when this item came from the archive fallback, not a live fetch
  tickerHint?: string; // ticker the SOURCE itself already tagged this item with (e.g. efinancethai's `security` field) - more reliable than title-scanning, use directly instead of extractTickers() when present
}

export interface Feed {
  name: string;
  url: string;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…',
  ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’',
  mdash: '—', ndash: '–', laquo: '«', raquo: '»',
};

export function decodeEntities(s: string): string {
  // Loop until stable to handle double-encoded entities (e.g. "&amp;#8220;").
  let out = s;
  let prev: string;
  let guard = 0;
  do {
    prev = out;
    out = out
      .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
      .replace(/&([a-zA-Z]+);/g, (m, n) => NAMED_ENTITIES[n] ?? NAMED_ENTITIES[n.toLowerCase()] ?? m);
    guard++;
  } while (out !== prev && guard < 5);
  return out;
}

// Parse an RSS pubDate to epoch ms. Some Thai feeds omit the timezone; since
// every source is Thai, assume Asia/Bangkok (+07:00) so sorting stays correct
// regardless of the server's timezone (Vercel runs in UTC).
export function parsePubDate(raw: string): number {
  if (!raw) return 0;
  let s = raw.trim();
  if (!/([+-]\d{2}:?\d{2}|Z|GMT|UTC?)\s*$/i.test(s)) {
    s += ' +0700';
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? 0 : t;
}

export function extractCdata(raw: string): string {
  const m = raw.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  return m ? m[1].trim() : raw.replace(/<[^>]+>/g, '').trim();
}

export function parseRSS(xml: string, sourceName: string): FeedItem[] {
  const items: FeedItem[] = [];
  const re = /<item\b[\s\S]*?<\/item>/g;
  const blocks = xml.match(re) ?? [];

  for (const block of blocks) {
    const titleRaw = block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '';
    const title = decodeEntities(extractCdata(titleRaw));
    if (!title) continue;

    // <link> in RSS often has a trailing text node — fall back to <guid>
    const linkRaw =
      block.match(/<link>([\s\S]*?)<\/link>/)?.[1] ??
      block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/)?.[1] ??
      '';
    const link = extractCdata(linkRaw).replace(/\s+/g, '');

    const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() ?? '';

    items.push({
      title,
      link,
      pubDate,
      source: sourceName,
      ts: parsePubDate(pubDate),
    });
  }
  return items;
}

// revalidateSec omitted -> always fetch live (cache: 'no-store'), used by the
// research route. Passing it shares one upstream fetch across all requests
// within that window (Next.js Data Cache) instead of hitting the source on
// every single page view — the news route passes 60 here specifically
// because no-store on every one of 10 feeds turned out to trigger
// rate-limiting/blocking on several upstream sites (see git history on
// app/api/news/[ticker]/route.ts around 2026-07-13 for the incident).
export async function fetchFeed(
  feed: Feed,
  logPrefix: string,
  timeoutMs: number,
  revalidateSec?: number
): Promise<FeedItem[]> {
  try {
    const res = await fetch(feed.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 Chrome/120',
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
      },
      ...(revalidateSec != null ? { next: { revalidate: revalidateSec } } : { cache: 'no-store' as const }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      console.log(`[${logPrefix}] FAIL  ${feed.name} -> HTTP ${res.status}  (${feed.url})`);
      return [];
    }
    const xml = await res.text();
    const items = parseRSS(xml, feed.name);
    if (items.length === 0) {
      console.log(`[${logPrefix}] FAIL  ${feed.name} -> 200 but 0 items (not RSS?)  (${feed.url})`);
      return [];
    }
    console.log(`[${logPrefix}] OK    ${feed.name} -> ${items.length} items  (${feed.url})`);
    return items;
  } catch (err) {
    const e = err as Error;
    console.log(`[${logPrefix}] ERROR ${feed.name} -> ${e.name}: ${e.message}  (${feed.url})`);
    return [];
  }
}

// Cross-feed dedup helpers — different outlets can syndicate the same story
// with tracking params on the URL or trivial whitespace/case differences in
// the title, so compare normalized forms rather than raw strings.
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    // Include search parameters (u.search) because sites like set.or.th and efinancethai
    // differentiate unique articles via query params (e.g. ?id=105511201). Stripping u.search
    // erroneously collapses all distinct SET/EFIN disclosures into a single duplicate URL.
    return (u.hostname.replace(/^www\./, '') + u.pathname.replace(/\/+$/, '') + u.search).toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

export function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, ' ').replace(/["'".,!?…„“”‘’]/g, '');
}

// Match the ticker as a standalone token (avoids "TU" matching "STATUS" etc.)
export function titleHasTicker(title: string, ticker: string): boolean {
  const re = new RegExp(`(?:^|[^A-Z0-9])${ticker}(?:[^A-Z0-9]|$)`, 'i');
  return re.test(title);
}

// ── Ticker extraction ────────────────────────────────────────────────────────
const TICKER_SET = new Set<string>(
  Object.keys((rawSectorMap as { ticker_to_sector: Record<string, unknown> }).ticker_to_sector)
);

// For sources that already tag an item with its own ticker (e.g.
// efinancethai's `security` field) - validates it's a real SET ticker before
// trusting it outright, in case the source's own tag is empty/stale/off-market.
export function isKnownTicker(symbol: string): boolean {
  return TICKER_SET.has(symbol.toUpperCase());
}

// Common English/finance words that collide with real ticker symbols — skip
// them to cut false positives from English headlines ("speed UP THAI", "dip AS ...").
const TICKER_STOPWORDS = new Set<string>([
  'NEW', 'BIG', 'TOP', 'ALL', 'AND', 'FOR', 'THE', 'WAS', 'NOW', 'NEWS', 'NEXT',
  'ASIA', 'ASIAN', 'THAI', 'CEO', 'CFO', 'USD', 'THB', 'GDP', 'ETF', 'IPO', 'ESG',
  'AGM', 'EGM', 'NPL', 'SET', 'MAI', 'WHO', 'OUT', 'OUR', 'ARE', 'HAS', 'CAN',
  'GET', 'ONE', 'TWO', 'BUY', 'NET', 'WIN', 'WORK', 'PLAN', 'BEAUTY', 'PANEL', 'STAR',
]);

// Extract SET tickers that appear as standalone tokens in a headline.
// Require >= 3 chars (drops noise like AS/UP/AI/OR/IT) and skip the stopword
// list. This is also the "context-aware" matching used to decide whether a
// research article is "about" a given ticker (app/stock/[ticker]) — a bare
// standalone all-caps token is already a much stronger signal than a raw
// substring match, which is what keeps short/generic-word tickers like TRUE
// or PLAN from false-positiving on unrelated English words in a title.
export function extractTickers(title: string): string[] {
  const found = new Set<string>();
  const tokens = title.toUpperCase().match(/[A-Z][A-Z0-9]{2,}/g) ?? [];
  for (const tok of tokens) {
    if (TICKER_STOPWORDS.has(tok)) continue;
    if (TICKER_SET.has(tok)) found.add(tok);
  }
  return [...found];
}
