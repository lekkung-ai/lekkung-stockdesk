import type { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import {
  type Feed,
  type FeedItem as NewsItem,
  extractTickers,
  fetchFeed as fetchFeedShared,
  normalizeUrl,
  normalizeTitle,
  titleHasTicker,
  isKnownTicker,
} from '@/lib/feedParsing';
import { fetchEfinanceThai } from '@/lib/efinanceThai';
import { fetchSetNews } from '@/lib/setNews';

// Every feed is attempted in parallel; fetchFeed() logs whether each URL actually
// works (see console output). A failing feed is skipped, not fatal.
const FEEDS: Feed[] = [
  { name: 'InfoQuest', url: 'https://www.infoquest.co.th/stock/feed/' },
  { name: 'ข่าวหุ้น', url: 'https://www.kaohoon.com/feed' },
  { name: 'ข่าวหุ้น (ด่วน)', url: 'https://www.kaohoon.com/breakingnews/feed' },
  { name: 'ข่าวหุ้น (คอลัมน์)', url: 'https://www.kaohoon.com/column/feed' },
  { name: 'RYT9 (SET)', url: 'https://www.ryt9.com/tag/SET/rss.xml' },
  { name: 'RYT9 (หุ้น)', url: 'https://www.ryt9.com/tag/%E0%B8%AB%E0%B8%B8%E0%B9%89%E0%B8%99/rss.xml' },
  { name: 'Money & Banking', url: 'https://moneyandbanking.co.th/feed/' },
  { name: 'Standard Wealth', url: 'https://thestandard.co/category/wealth/feed' },
  { name: 'Reporter Journey', url: 'https://www.reporterjourney.com/feed' },
  { name: 'มติชน', url: 'https://www.matichon.co.th/economy/feed' },
  { name: 'Investing.com', url: 'https://th.investing.com/rss/news_25.rss' },
  { name: 'RYT9 (IPO)', url: 'https://www.ryt9.com/tag/IPO/rss.xml' },
  { name: 'Thai PBS (เศรษฐกิจ)', url: 'https://news.thaipbs.or.th/rss/economic.xml' },
  { name: 'TODAY Biz', url: 'https://workpointtoday.com/feed/' },
  { name: 'ThaiPR', url: 'https://www.thaipr.net/finance/feed' },
  { name: 'Brand Inside', url: 'https://brandinside.asia/feed/' },
];

// The Standard's wealth feed is dead and its general /feed/ buries stock news
// under politics, so it is intentionally excluded.

// Verified NOT usable from a server-side fetch (2026-06/07, rechecked 2026-07-10) — kept for reference:
//   Settrade feedburner (saaDailyUpdate / researchAll / researchMarket /
//     researchTechnique / researchStock) -> Incapsula bot-protection HTML page
//   HoonSmart https://hoonsmart.com/feed/            -> reachable but ~19-20s
//     response time, effectively times out under FEED_TIMEOUT_MS. Not usable
//     live, but scripts/save_news.py fetches it once per pipeline run (60s
//     timeout budget) into the daily archive, so it still appears here via
//     loadHistoricalItems() below - just at "pipeline run" freshness, not live.
//   มิติหุ้น https://www.mitihoon.com/feed/            -> reachable fine from
//     save_news.py's runner (local machine / GitHub Actions), but Vercel's
//     production egress IP got itself rate-limited/blocked there starting
//     2026-07-11 (see PR history) and never recovered after 1.5+ hours of
//     monitoring post-fix (2026-07-13) - moved to the same batch-only
//     treatment as HoonSmart rather than keep attempting (and logging) a
//     live fetch that's confirmed persistently dead. Revisit adding it back
//     to FEEDS if/when the block clears.
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

const FEED_TIMEOUT_MS = 3000;
const GENERAL_TOKENS = new Set(['ALL', 'GENERAL', '_']);

// Shared across concurrent page loads via Next.js's fetch Data Cache, instead
// of every single request hitting all 10 upstream feeds directly (that was
// cache: 'no-store' until 2026-07-11 - see git history - and correlates with
// several sources starting to fail/rate-limit in production shortly after).
// The route handler itself stays dynamic (no revalidate on the route/response
// itself), only the upstream feed fetches are batched.
const LIVE_REVALIDATE_SEC = 60;

// If a feed's live fetch fails outright or comes back with 0 items (both
// abnormal for a rolling news RSS), fall back to that source's most recent
// items from the daily archive rather than letting the source vanish from
// the page silently.
const STALE_FALLBACK_COUNT = 10;

// efinancethai (EFIN) - added 2026-07-14, no RSS, custom JSON API (see
// lib/efinanceThai.ts). New source -> deliberately more cautious cache
// window than the RSS feeds above (300s vs 60s) until it's proven not to
// trip any rate-limiting over a few days of production traffic; if nothing
// odd shows up by ~2026-07-17, lower EFIN_REVALIDATE_SEC to LIVE_REVALIDATE_SEC.
const EFIN_REVALIDATE_SEC = 300;
const EFIN_PAGE_SIZE = 20;

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

// Daily snapshots written by scripts/save_news.py, same layout as Big Lot's
// public/data/history/<date>/biglot.json. Read at request time (not a static
// import) so new days show up without a redeploy — the batch script commits
// straight into public/, which the running server can already see on disk.
const HISTORY_DAYS = 7; // matches the news page's date-picker min range
const HISTORY_DIR = path.join(process.cwd(), 'public', 'data', 'history');

let historicalCache: { data: NewsItem[]; timestamp: number } | null = null;

function loadHistoricalItems(): NewsItem[] {
  const now = Date.now();
  if (historicalCache && (now - historicalCache.timestamp) < 60000) {
    return historicalCache.data;
  }
  const items: NewsItem[] = [];
  for (let i = 0; i < HISTORY_DAYS; i++) {
    const date = new Date(now - i * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
    const filePath = path.join(HISTORY_DIR, date, 'news.json');
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      items.push(...(JSON.parse(raw) as NewsItem[]));
    } catch {
      // no snapshot for this day yet — not an error, just nothing to add
    }
  }
  historicalCache = { data: items, timestamp: now };
  return items;
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await context.params;
  const t = ticker.toUpperCase();
  const wantGeneral = GENERAL_TOKENS.has(t);

  // Fetch RSS feeds, efinancethai, and SET news concurrently in parallel for max speed
  const [settled, efinItems, setNewsItems] = await Promise.all([
    Promise.allSettled(
      FEEDS.map(f => fetchFeedShared(f, 'news', FEED_TIMEOUT_MS, LIVE_REVALIDATE_SEC))
    ),
    fetchEfinanceThai(1, EFIN_PAGE_SIZE, EFIN_REVALIDATE_SEC, FEED_TIMEOUT_MS),
    fetchSetNews(wantGeneral ? 'SET' : t, LIVE_REVALIDATE_SEC, FEED_TIMEOUT_MS),
  ]);

  let allLive: NewsItem[] = [];
  const failedFeeds: Feed[] = [];

  settled.forEach((result, i) => {
    if (result.status === 'fulfilled' && result.value.length > 0) {
      allLive.push(...result.value);
    } else {
      if (result.status === 'rejected') {
        console.log(`[news] REJECTED ${FEEDS[i].name} -> ${result.reason}  (${FEEDS[i].url})`);
      }
      failedFeeds.push(FEEDS[i]);
    }
  });

  if (efinItems.length > 0) {
    allLive.push(...efinItems);
  } else {
    failedFeeds.push({ name: 'EFIN', url: 'efinancethai.com' });
  }

  if (setNewsItems.length > 0) {
    allLive.push(...setNewsItems);
  } else {
    failedFeeds.push({ name: 'SET (ตลาดหลักทรัพย์)', url: 'set.or.th' });
  }

  // Load daily snapshots for the past HISTORY_DAYS days (memory cached)
  const archivedItems: NewsItem[] = loadHistoricalItems();

  // Always include batch-archived SET disclosures from news.json
  const setArchived = archivedItems.filter(item => item.source === 'SET (ตลาดหลักทรัพย์)');
  if (setArchived.length > 0) {
    allLive.push(...setArchived);
  }

  const staleSources: string[] = [];
  if (failedFeeds.length > 0) {
    const archivedBySource = new Map<string, NewsItem[]>();
    for (const item of archivedItems) {
      const list = archivedBySource.get(item.source);
      if (list) list.push(item);
      else archivedBySource.set(item.source, [item]);
    }
    for (const feed of failedFeeds) {
      const fallback = (archivedBySource.get(feed.name) ?? [])
        .sort((a, b) => b.ts - a.ts)
        .slice(0, STALE_FALLBACK_COUNT)
        .map(item => ({ ...item, stale: true }));
      if (fallback.length > 0) {
        allLive.push(...fallback);
        staleSources.push(feed.name);
      }
    }
  }

  const candidates = [...allLive, ...archivedItems].sort((a, b) => {
    if (b.ts !== a.ts) return b.ts - a.ts;
    return a.source.localeCompare(b.source);
  });

  const seenLinks = new Set<string>();
  const seenTitles = new Set<string>();
  const all: NewsItem[] = [];

  for (const item of candidates) {
    if (!item.link) continue;
    const normLink = normalizeUrl(item.link);
    const normTitle = normalizeTitle(item.title);
    const titleKey = normTitle ? `${normTitle}|${(item.tickerHint || '').toUpperCase()}` : '';
    if (seenLinks.has(normLink) || (titleKey && seenTitles.has(titleKey))) continue;
    seenLinks.add(normLink);
    if (titleKey) seenTitles.add(titleKey);
    all.push(item);
  }

  let selected: NewsItem[];
  let isGeneral: boolean;

  if (wantGeneral) {
    const cutoffTs = Date.now() - HISTORY_DAYS * 86400000;
    selected = all.filter(item => item.ts >= cutoffTs);
    isGeneral = true;
  } else {
    const matches = all.filter(
      item => (item.tickerHint && item.tickerHint.toUpperCase() === t) || titleHasTicker(item.title, t)
    );
    if (matches.length > 0) {
      const isSet = (item: NewsItem) => item.source === 'SET (ตลาดหลักทรัพย์)' || item.link.includes('set.or.th');
      const setMatches = matches.filter(isSet);
      const generalMatches = matches.filter(item => !isSet(item));
      selected = [...setMatches.slice(0, 20), ...generalMatches.slice(0, 20)];
      isGeneral = false;
    } else {
      selected = all.slice(0, 8);
      isGeneral = true;
    }
  }

  const news = selected.map(item => {
    const hint = item.tickerHint?.toUpperCase();
    return {
      title: item.title,
      link: item.link,
      pubDate: item.pubDate,
      ts: item.ts,
      source: item.source,
      tickers: hint && isKnownTicker(hint) ? [hint] : extractTickers(item.title),
      sentiment: getSentiment(item.title),
      stale: item.stale ?? false,
    };
  });

  return Response.json(
    { news, isGeneral, staleSources },
    { headers: { 'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=300' } }
  );
}
