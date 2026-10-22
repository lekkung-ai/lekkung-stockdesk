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
import { createMemo, memoized, settleExceptStragglers } from '@/lib/serverMemo';
import { bangkokDateKey } from '@/lib/utils';

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
  { name: 'Standard Wealth', url: 'https://thestandard.co/category/wealth/feed/' },
  { name: 'Reporter Journey', url: 'https://reporterjourney.com/feed/' },
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

// Feeds that do not work from the server. They are NOT fetched: next's fetch cache keeps the response
// open until every revalidating fetch of the request has finished, so each slow/dead feed added up to
// FEED_TIMEOUT_MS to the end of every response (and it also re-requested a dead host each time). They still go
// through the "failed feed" path below, so their archived items and the amber "stale" dot on the
// source chip look exactly as they did when the live fetch failed. Remove an entry to try it again.
// Measured from Vercel's egress on 2026-10-22 (6 requests each, FEED_TIMEOUT_MS is 3 s):
const DISABLED_FEEDS: Record<string, string> = {
  'Money & Banking': '403 every time (bot protection), 0 items',
  'Reporter Journey': '3.2-3.9 s every time, always past the timeout',
  'Standard Wealth': '663 KB feed, 2.6-5 s or no answer within 6 s; only 1 of 6 requests came back within the timeout',
};

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
// Healthy feeds answer in 60-250 ms (Data Cache) / <0.7 s cold, but one permanently dead feed
// (Reporter Journey) used to hold the whole response for its full 3 s timeout. Once only this many
// feeds are still pending, they get STRAGGLER_GRACE_MS more and are then treated as failed for this
// response (their archived items still come through below) - see settleExceptStragglers.
const MAX_STRAGGLERS = 2;
const STRAGGLER_GRACE_MS = 350;
// Settrade needs a session cookie first (see lib/setNews.ts), so it gets a longer leash.
const SET_TIMEOUT_MS = 3000;
const GENERAL_TOKENS = new Set(['ALL', 'GENERAL', '_']);

// One page load is two requests (?part=head then ?part=rest, see below). Settrade is fetched live
// (no-store) and costs a session cookie + an API call, so both requests share one result for
// SET_SHARE_MS. If Settrade fails, the last good result is reused for up to SET_LAST_GOOD_MS instead
// of dropping SET news from the page; only a failure with nothing recent to reuse counts as degraded.
const SET_SHARE_MS = 15_000;
const SET_LAST_GOOD_MS = 5 * 60_000;
const setMemo = createMemo<NewsItem[]>(24);

async function fetchSetShared(symbol: string): Promise<NewsItem[]> {
  const fresh = await memoized(setMemo, symbol, SET_SHARE_MS, async () => {
    const items = await fetchSetNews(symbol, SET_TIMEOUT_MS);
    return items.length > 0 ? items : null;
  });
  if (fresh) return fresh;
  return setMemo.get(symbol, SET_LAST_GOOD_MS)?.value ?? [];
}

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
// SET disclosures only. A quiet stock can go weeks without filing anything
// (ZIGA's last one before 2026-08-21 was 2026-08-11), so a 7-day archive gives
// the "ข่าวแจ้งตลาด" section no safety net whenever the live settrade fetch
// above fails — the page then falls through to the generic all-market list,
// which reads as if unrelated news belonged to that ticker. ~73% of the
// universe has no SET disclosure within any given 7-day window; over 60 days
// almost every listed name has at least one. Deliberately NOT applied to the
// RSS/general sources: two-month-old general news adds no value and would
// bloat the /api/news/ALL payload.
const SET_HISTORY_DAYS = 60;
const HISTORY_DIR = path.join(process.cwd(), 'public', 'data', 'history');
const SET_SOURCE = 'SET (ตลาดหลักทรัพย์)';

let historicalCache: { data: NewsItem[]; timestamp: number } | null = null;
let setHistoricalCache: { data: NewsItem[]; timestamp: number } | null = null;

function readDayItems(daysAgo: number, now: number): NewsItem[] {
  const date = new Date(now - daysAgo * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
  const filePath = path.join(HISTORY_DIR, date, 'news.json');
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as NewsItem[];
  } catch {
    // no snapshot for this day yet — not an error, just nothing to add
    return [];
  }
}

function loadHistoricalItems(): NewsItem[] {
  const now = Date.now();
  if (historicalCache && (now - historicalCache.timestamp) < 60000) {
    return historicalCache.data;
  }
  const items: NewsItem[] = [];
  for (let i = 0; i < HISTORY_DAYS; i++) {
    items.push(...readDayItems(i, now));
  }
  historicalCache = { data: items, timestamp: now };
  return items;
}

// Same daily snapshots, read SET_HISTORY_DAYS back but keeping only the SET
// disclosures. Newest first; the caller's per-section slice() then still cuts
// the newest N, so old filings can only fill slots today's news left empty.
// Deduped by link here as well as in the merge below, since the same filing
// can be re-archived under more than one date.
function loadSetHistoricalItems(): NewsItem[] {
  const now = Date.now();
  if (setHistoricalCache && (now - setHistoricalCache.timestamp) < 60000) {
    return setHistoricalCache.data;
  }
  const items: NewsItem[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < SET_HISTORY_DAYS; i++) {
    for (const item of readDayItems(i, now)) {
      if (item.source !== SET_SOURCE) continue;
      const key = normalizeUrl(item.link ?? '');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      items.push(item);
    }
  }
  items.sort((a, b) => b.ts - a.ts);
  setHistoricalCache = { data: items, timestamp: now };
  return items;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await context.params;
  const t = ticker.toUpperCase();
  const wantGeneral = GENERAL_TOKENS.has(t);

  // Fetch RSS feeds, efinancethai, and SET news concurrently in parallel for max speed
  const startedAt = Date.now();
  const took: Record<string, number> = {};
  const timed = <T,>(label: string, p: Promise<T>) => p.then(v => { took[label] = Date.now() - startedAt; return v; });
  const [feedResults, efinItems, setNewsItems] = await Promise.all([
    timed('feeds', settleExceptStragglers(
      FEEDS.map(f => (DISABLED_FEEDS[f.name] ? Promise.resolve([] as NewsItem[]) : fetchFeedShared(f, 'news', FEED_TIMEOUT_MS, LIVE_REVALIDATE_SEC))),
      { maxStragglers: MAX_STRAGGLERS, graceMs: STRAGGLER_GRACE_MS },
      [] as NewsItem[],
    )),
    timed('efin', fetchEfinanceThai(1, EFIN_PAGE_SIZE, EFIN_REVALIDATE_SEC, FEED_TIMEOUT_MS)),
    timed('set', fetchSetShared(wantGeneral ? 'SET' : t)),
  ]);

  let allLive: NewsItem[] = [];
  const failedFeeds: Feed[] = [];

  feedResults.forEach((items, i) => {
    if (items.length > 0) {
      allLive.push(...items);
    } else {
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

  // Always include batch-archived SET disclosures from news.json. A ticker page
  // reads SET_HISTORY_DAYS back (see above); the all-market list keeps the
  // HISTORY_DAYS window it already used, so its payload stays as it was — the
  // extra depth only exists to answer "what did THIS company file", which the
  // all-market list never asks.
  const setArchived = wantGeneral
    ? archivedItems.filter(item => item.source === SET_SOURCE)
    : loadSetHistoricalItems();
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

  // The page asks for the newest day first (?part=head) and the other days right after (?part=rest):
  // the full week is ~750 KB of JSON (~150 KB compressed) but the page shows one day at a time, so the
  // first paint needs about a tenth of it. head = items of the newest Bangkok date + what the filter
  // bar needs from the whole week (source chips in their usual order, ticker list); rest = older dates.
  // No ?part -> the full list, exactly as before.
  const part = wantGeneral ? req.nextUrl.searchParams.get('part') : null;
  let body: Record<string, unknown> = { news, isGeneral, staleSources };
  if (part === 'head' || part === 'rest') {
    const dayOf = (n: { ts: number }) => bangkokDateKey(n.ts);
    let latestDate = '';
    for (const n of news) {
      const d = dayOf(n);
      if (d > latestDate) latestDate = d;
    }
    if (part === 'rest') {
      body = { news: news.filter(n => dayOf(n) < latestDate), isGeneral, staleSources };
    } else {
      const isSetItem = (n: { source: string; link: string }) => n.source === SET_SOURCE || n.link.includes('set.or.th');
      const sourcesNews: string[] = [];
      const sourcesSet: string[] = [];
      const tickers = new Set<string>();
      for (const n of news) {
        if (!sourcesSet.includes(n.source)) sourcesSet.push(n.source);
        if (!isSetItem(n) && !sourcesNews.includes(n.source)) sourcesNews.push(n.source);
        for (const tk of n.tickers) tickers.add(tk);
      }
      body = {
        news: news.filter(n => dayOf(n) === latestDate),
        isGeneral,
        staleSources,
        meta: { latestDate, sourcesNews, sourcesSet, tickers: [...tickers].sort() },
      };
    }
  }

  // News may be at most 5 min behind: 120 s fresh + 90 s stale-while-revalidate at the CDN, the 60 s feed
  // Data Cache above, and the browser always revalidating (max-age=0, a CDN hit is ~60 ms).
  // A response is not cached at all when SET (all-market list) failed with nothing recent to reuse, or
  // when at least half of the live feeds failed - the next request retries upstream. Disabled feeds,
  // EFIN and the odd single failing feed do not count: they get the archive fallback + stale dot above.
  const liveFeedCount = FEEDS.filter(f => !DISABLED_FEEDS[f.name]).length;
  const liveFailed = failedFeeds.filter(f => FEEDS.some(x => x.name === f.name) && !DISABLED_FEEDS[f.name]).length;
  const degraded =
    (wantGeneral && setNewsItems.length === 0) ||
    liveFailed * 2 >= liveFeedCount;

  const headers: Record<string, string> = {
    'Cache-Control': degraded ? 'no-store' : 'public, max-age=0, s-maxage=120, stale-while-revalidate=90',
    'Server-Timing': `feeds;dur=${took.feeds ?? 0}, efin;dur=${took.efin ?? 0}, set;dur=${took.set ?? 0}, total;dur=${Date.now() - startedAt}, failed;desc="${failedFeeds.length}", degraded;desc="${degraded ? 1 : 0}"`,
  };
  return Response.json(body, { headers });
}
