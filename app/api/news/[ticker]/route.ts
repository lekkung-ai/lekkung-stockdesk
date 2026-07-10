import type { NextRequest } from 'next/server';
import rawSectorMap from '@/data/scans/sector_map.json';

// Known SET tickers (keys of ticker_to_sector) used to tag each headline.
const TICKER_SET = new Set<string>(
  Object.keys((rawSectorMap as { ticker_to_sector: Record<string, unknown> }).ticker_to_sector)
);

// Common English/finance words that collide with real ticker symbols — skip them
// to cut false positives from English headlines ("speed UP THAI", "dip AS ...").
const TICKER_STOPWORDS = new Set<string>([
  'NEW', 'BIG', 'TOP', 'ALL', 'AND', 'FOR', 'THE', 'WAS', 'NOW', 'NEWS', 'NEXT',
  'ASIA', 'ASIAN', 'THAI', 'CEO', 'CFO', 'USD', 'THB', 'GDP', 'ETF', 'IPO', 'ESG',
  'AGM', 'EGM', 'NPL', 'SET', 'MAI', 'WHO', 'OUT', 'OUR', 'ARE', 'HAS', 'CAN',
  'GET', 'ONE', 'TWO', 'BUY', 'NET', 'WIN', 'WORK', 'PLAN', 'BEAUTY', 'PANEL', 'STAR',
]);

// Extract SET tickers that appear as standalone tokens in a headline.
// Require >= 3 chars (drops noise like AS/UP/AI/OR/IT) and skip the stopword list.
function extractTickers(title: string): string[] {
  const found = new Set<string>();
  const tokens = title.toUpperCase().match(/[A-Z][A-Z0-9]{2,}/g) ?? [];
  for (const tok of tokens) {
    if (TICKER_STOPWORDS.has(tok)) continue;
    if (TICKER_SET.has(tok)) found.add(tok);
  }
  return [...found];
}

// ── Sources (all fetched server-side) ──────────────────────────────────────
interface Feed {
  name: string; // short badge label
  url: string;
}

// Every feed is attempted in parallel; fetchFeed() logs whether each URL actually
// works (see console output). A failing feed is skipped, not fatal.
const FEEDS: Feed[] = [
  { name: 'InfoQuest', url: 'https://www.infoquest.co.th/stock/feed/' },
  { name: 'ข่าวหุ้น', url: 'https://www.kaohoon.com/feed' },
  { name: 'ข่าวหุ้น (ด่วน)', url: 'https://www.kaohoon.com/breakingnews/feed' },
  { name: 'ข่าวหุ้น (ทั่วไป)', url: 'https://www.kaohoon.com/news/feed' },
  { name: 'RYT9 (SET)', url: 'https://www.ryt9.com/tag/SET/rss.xml' },
  { name: 'RYT9 (หุ้น)', url: 'https://www.ryt9.com/tag/%E0%B8%AB%E0%B8%B8%E0%B9%89%E0%B8%99/rss.xml' },
  { name: 'มิติหุ้น', url: 'https://www.mitihoon.com/feed/' },
  { name: 'มติชน', url: 'https://www.matichon.co.th/economy/feed' },
  { name: 'Investing.com', url: 'https://th.investing.com/rss/news_25.rss' },
  { name: 'RYT9 (IPO)', url: 'https://www.ryt9.com/tag/IPO/rss.xml' },
];

// The Standard's wealth feed is dead and its general /feed/ buries stock news
// under politics, so it is intentionally excluded.

// Verified NOT usable from a server-side fetch (2026-06/07, rechecked 2026-07-10) — kept for reference:
//   Settrade feedburner (saaDailyUpdate / researchAll / researchMarket /
//     researchTechnique / researchStock) -> Incapsula bot-protection HTML page
//   HoonSmart https://hoonsmart.com/feed/            -> reachable but ~19-20s
//     response time, effectively times out under FEED_TIMEOUT_MS
//   Thunhoon https://thunhoon.com/feed (+ category feeds) -> 200 but returns
//     the site's SPA shell HTML, not RSS (no feed at that path)
//   MGR Online (mgronline.com)                       -> no working RSS path
//     found (tried /rss, /rss/stockmarket.xml, /asp/rss.aspx, per-section
//     paths) — likely discontinued
//   Bangkok Biz / Thansettakij (all paths tried)     -> 200 but redirects to
//     the SPA shell homepage HTML, not RSS
//   thestandard.co/wealth/feed/                       -> valid RSS shell but
//     it's the *comments* feed for that page ("ความเห็นบน: Wealth"), 0 items
//   stock2morrow.com/feed                            -> 503 at test time
//   Share2Trade                                      -> 404 (site moved to Atlas CMS)
//   Sanook Money                                     -> 404
//   Wealthy Thai / Prachachat                         -> 403 (Cloudflare)
//   th.investing.com/rss/stock.rss & stock_Stocks.rss -> valid RSS but stale
//     (~4 days behind); market_overview.rss fresher (~1 day) but not stock-specific
//   RYT9 tag names tried and 404: STOCK, ตลาดหลักทรัพย์, การเงิน, MAI, หลักทรัพย์,
//     งบการเงิน, ปันผล, บล, หุ้นกู้ (only "SET", "IPO", and "หุ้น" tags resolve)

const REVALIDATE = 300; // 5 minutes — was 1800 (30 min); too stale vs other aggregators
const FEED_TIMEOUT_MS = 12000;
const GENERAL_TOKENS = new Set(['ALL', 'GENERAL', '_']);

// ── Sentiment ───────────────────────────────────────────────────────────────
const POS_KEYWORDS = [
  // Thai
  'กำไร', 'เติบโต', 'ฟื้นตัว', 'ดีขึ้น', 'สูงสุด', 'ปันผล', 'เพิ่มขึ้น', 'แข็งแกร่ง',
  'ผ่านจุดต่ำสุด', 'บวก', 'ขยายตัว', 'รายได้เพิ่ม', 'ทำสถิติ',
  // English
  'profit', 'growth', 'surge', 'strong', 'buy', 'upgrade', 'outperform',
  'raise', 'beat', 'record high', 'positive', 'bullish',
];

const NEG_KEYWORDS = [
  // Thai
  'ขาดทุน', 'ลดลง', 'ปรับตัวลง', 'อ่อนแอ', 'แย่ลง', 'ต่ำสุด', 'ลบ',
  'กังวล', 'เสี่ยง', 'ผิดนัด', 'ยกเลิก', 'ลดทุน',
  // English
  'loss', 'decline', 'weak', 'sell', 'downgrade', 'underperform',
  'drop', 'cut', 'miss', 'concern', 'risk', 'bearish', 'negative',
];

function getSentiment(text: string): 'pos' | 'neg' | 'neu' {
  const lower = text.toLowerCase();
  const pos = POS_KEYWORDS.filter(k => lower.includes(k)).length;
  const neg = NEG_KEYWORDS.filter(k => lower.includes(k)).length;
  if (pos > neg) return 'pos';
  if (neg > pos) return 'neg';
  return 'neu';
}

// ── RSS parsing ──────────────────────────────────────────────────────────────
interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  ts: number; // parsed pubDate (ms) for sorting; 0 if unknown
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…',
  ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’',
  mdash: '—', ndash: '–', laquo: '«', raquo: '»',
};

function decodeEntities(s: string): string {
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

// Parse an RSS pubDate to epoch ms. Some Thai feeds (e.g. ThaiPBS) omit the
// timezone; since every source is Thai, assume Asia/Bangkok (+07:00) so sorting
// stays correct regardless of the server's timezone (Vercel runs in UTC).
function parsePubDate(raw: string): number {
  if (!raw) return 0;
  let s = raw.trim();
  if (!/([+-]\d{2}:?\d{2}|Z|GMT|UTC?)\s*$/i.test(s)) {
    s += ' +0700';
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? 0 : t;
}

function extractCdata(raw: string): string {
  const m = raw.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  return m ? m[1].trim() : raw.replace(/<[^>]+>/g, '').trim();
}

function parseRSS(xml: string, sourceName: string): NewsItem[] {
  const items: NewsItem[] = [];
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

async function fetchFeed(feed: Feed): Promise<NewsItem[]> {
  try {
    const res = await fetch(feed.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 Chrome/120',
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
      },
      next: { revalidate: REVALIDATE },
      signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.log(`[news] FAIL  ${feed.name} -> HTTP ${res.status}  (${feed.url})`);
      return [];
    }
    const xml = await res.text();
    const items = parseRSS(xml, feed.name);
    if (items.length === 0) {
      console.log(`[news] FAIL  ${feed.name} -> 200 but 0 items (not RSS?)  (${feed.url})`);
      return [];
    }
    console.log(`[news] OK    ${feed.name} -> ${items.length} items  (${feed.url})`);
    return items;
  } catch (err) {
    // a single broken/slow feed must not break the rest
    const e = err as Error;
    console.log(`[news] ERROR ${feed.name} -> ${e.name}: ${e.message}  (${feed.url})`);
    return [];
  }
}

// Cross-feed dedup helpers — different outlets can syndicate the same story
// with tracking params on the URL or trivial whitespace/case differences in
// the title, so compare normalized forms rather than raw strings.
function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return (u.hostname.replace(/^www\./, '') + u.pathname.replace(/\/+$/, '')).toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, ' ').replace(/["'".,!?…„“”‘’]/g, '');
}

// Match the ticker as a standalone token (avoids "TU" matching "STATUS" etc.)
function titleHasTicker(title: string, ticker: string): boolean {
  const re = new RegExp(`(?:^|[^A-Z0-9])${ticker}(?:[^A-Z0-9]|$)`, 'i');
  return re.test(title);
}

import rawArchivedItems from '@/data/news_archive.json';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await context.params;
  const t = ticker.toUpperCase();
  const wantGeneral = GENERAL_TOKENS.has(t);

  // Fetch every feed in parallel. fetchFeed() already catches its own errors
  // and resolves to [], but allSettled is the belt-and-suspenders guarantee
  // that one broken feed (a thrown rejection we didn't anticipate) can never
  // take down the whole page — it's just logged and skipped.
  const settled = await Promise.allSettled(FEEDS.map(fetchFeed));
  let allLive: NewsItem[] = [];
  settled.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      allLive.push(...result.value);
    } else {
      console.log(`[news] REJECTED ${FEEDS[i].name} -> ${result.reason}  (${FEEDS[i].url})`);
    }
  });

  // Load archived news from statically imported JSON
  let archivedItems: NewsItem[] = rawArchivedItems as NewsItem[];

  // Merge live and archived items, deduplicating across feeds. Different
  // sources can syndicate the same story with slightly different tracking
  // params on the URL or minor whitespace/case differences in the title, so
  // an exact-link match alone isn't enough once multiple outlets are mixed in.
  const seenLinks = new Set<string>();
  const seenTitles = new Set<string>();
  const merged: NewsItem[] = [];

  for (const item of [...allLive, ...archivedItems]) {
    if (!item.link) continue;
    const normLink = normalizeUrl(item.link);
    const normTitle = normalizeTitle(item.title);
    if (seenLinks.has(normLink) || (normTitle && seenTitles.has(normTitle))) continue;
    seenLinks.add(normLink);
    if (normTitle) seenTitles.add(normTitle);
    merged.push(item);
  }

  // Sort newest first
  const all = merged.sort((a, b) => b.ts - a.ts);

  let selected: NewsItem[];
  let isGeneral: boolean;

  if (wantGeneral) {
    // Return more items since we have an archive now
    selected = all.slice(0, 500);
    isGeneral = true;
  } else {
    const matches = all.filter(item => titleHasTicker(item.title, t));
    if (matches.length > 0) {
      selected = matches.slice(0, 20);
      isGeneral = false;
    } else {
      selected = all.slice(0, 8);
      isGeneral = true;
    }
  }

  const news = selected.map(item => ({
    title: item.title,
    link: item.link,
    pubDate: item.pubDate,
    ts: item.ts,
    source: item.source,
    tickers: extractTickers(item.title),
    sentiment: getSentiment(item.title),
  }));

  return Response.json(
    { news, isGeneral },
    { headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=60' } }
  );
}
