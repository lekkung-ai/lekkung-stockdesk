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
  { name: 'ข่าวหุ้น (ทั่วไป)', url: 'https://www.kaohoon.com/news/feed' },
  { name: 'RYT9 (SET)', url: 'https://www.ryt9.com/tag/SET/rss.xml' },
  { name: 'RYT9 (หุ้น)', url: 'https://www.ryt9.com/tag/%E0%B8%AB%E0%B8%B8%E0%B9%89%E0%B8%99/rss.xml' },
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

const FEED_TIMEOUT_MS = 12000;
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

function loadHistoricalItems(): NewsItem[] {
  const items: NewsItem[] = [];
  const now = Date.now();
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
  return items;
}

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
  const settled = await Promise.allSettled(
    FEEDS.map(f => fetchFeedShared(f, 'news', FEED_TIMEOUT_MS, LIVE_REVALIDATE_SEC))
  );
  let allLive: NewsItem[] = [];
  const failedFeeds: Feed[] = [];
  settled.forEach((result, i) => {
    if (result.status === 'fulfilled' && result.value.length > 0) {
      allLive.push(...result.value);
    } else {
      if (result.status === 'rejected') {
        console.log(`[news] REJECTED ${FEEDS[i].name} -> ${result.reason}  (${FEEDS[i].url})`);
      }
      // A fulfilled-but-empty result is already logged inside fetchFeed()
      // itself (FAIL / ERROR / "200 but 0 items"), so no duplicate log here.
      failedFeeds.push(FEEDS[i]);
    }
  });

  // efinancethai isn't RSS (custom JSON API, see lib/efinanceThai.ts) so it's
  // not part of FEEDS/fetchFeedShared above - fetched separately here, but
  // pushed into the same failedFeeds list on failure so it gets the exact
  // same archive-fallback treatment as every RSS source (feed.name 'EFIN'
  // must match the `source` value scripts/save_news.py writes to the archive).
  const efinItems = await fetchEfinanceThai(1, EFIN_PAGE_SIZE, EFIN_REVALIDATE_SEC, FEED_TIMEOUT_MS);
  if (efinItems.length > 0) {
    allLive.push(...efinItems);
  } else {
    failedFeeds.push({ name: 'EFIN', url: 'efinancethai.com' });
  }

  const setNewsItems = await fetchSetNews(wantGeneral ? 'SET' : t, LIVE_REVALIDATE_SEC, FEED_TIMEOUT_MS);
  if (setNewsItems.length > 0) {
    allLive.push(...setNewsItems);
  } else {
    failedFeeds.push({ name: 'SET (ตลาดหลักทรัพย์)', url: 'set.or.th' });
  }

  // Load daily snapshots for the past HISTORY_DAYS days
  const archivedItems: NewsItem[] = loadHistoricalItems();

  // Always include batch-archived SET disclosures from news.json (scraped across
  // all ~900 tickers by save_news.py) so company-level disclosures (CREDIT,
  // BTSGIF, SCC, ACE, PCE, SIRI, KK, TVDH...) appear on the page alongside
  // live Exchange-level items.
  const setArchived = archivedItems.filter(item => item.source === 'SET (ตลาดหลักทรัพย์)');
  if (setArchived.length > 0) {
    allLive.push(...setArchived);
  }

  // Any feed that failed live gets its most recent archived items injected
  // instead, flagged `stale: true`, so a blocked/rate-limited/slow source
  // degrades to "a bit old" rather than disappearing from the page entirely.
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
        console.log(`[news] STALE FALLBACK ${feed.name} -> using ${fallback.length} archived item(s), live fetch failed/empty`);
      } else {
        console.log(`[news] STALE FALLBACK ${feed.name} -> no archived items available either`);
      }
    }
  }

  // Sort BEFORE dedup so the winner of any duplicate is deterministic —
  // newest ts wins, ties broken by source name — instead of "whichever
  // array happened to list it first" (previously: allLive-then-archivedItems
  // concat order, which depended on FEEDS array order, not content). Stable
  // sort means true ties (a stale-fallback item and its own archive copy
  // share identical ts+source) keep their relative order from the concat
  // below, so the stale:true copy - listed first via allLive - still wins.
  const candidates = [...allLive, ...archivedItems].sort((a, b) => {
    if (b.ts !== a.ts) return b.ts - a.ts;
    return a.source.localeCompare(b.source);
  });

  // Dedup across feeds. Different sources can syndicate the same story with
  // slightly different tracking params on the URL or minor whitespace/case
  // differences in the title, so an exact-link match alone isn't enough once
  // multiple outlets are mixed in.
  const seenLinks = new Set<string>();
  const seenTitles = new Set<string>();
  const all: NewsItem[] = [];

  for (const item of candidates) {
    if (!item.link) continue;
    const normLink = normalizeUrl(item.link);
    const normTitle = normalizeTitle(item.title);
    if (seenLinks.has(normLink) || (normTitle && seenTitles.has(normTitle))) continue;
    seenLinks.add(normLink);
    if (normTitle) seenTitles.add(normTitle);
    all.push(item); // candidates was already sorted, dedup preserves order
  }

  let selected: NewsItem[];
  let isGeneral: boolean;

  if (wantGeneral) {
    // Cut by age (matches the archive window), not by count — a fixed
    // count cap meant the visible cutoff point shifted around on every
    // request as new items arrived, silently pushing out whatever was at
    // the boundary regardless of how old it actually was.
    const cutoffTs = Date.now() - HISTORY_DAYS * 86400000;
    selected = all.filter(item => item.ts >= cutoffTs);
    isGeneral = true;
  } else {
    // A tickerHint (e.g. efinancethai's own `security` tag) is authoritative
    // even when the title itself doesn't literally spell out the symbol
    // (e.g. "บริษัท ปตท." without "PTT") - match on it too, not just the
    // title-text scan.
    const matches = all.filter(
      item => (item.tickerHint && item.tickerHint.toUpperCase() === t) || titleHasTicker(item.title, t)
    );
    if (matches.length > 0) {
      selected = matches.slice(0, 20);
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
      // A source-provided ticker tag (efinancethai's `security` field) is
      // more reliable than scanning the title text, so prefer it when
      // present and valid; fall back to the usual title-scan otherwise.
      tickers: hint && isKnownTicker(hint) ? [hint] : extractTickers(item.title),
      sentiment: getSentiment(item.title),
      stale: item.stale ?? false,
    };
  });

  return Response.json(
    { news, isGeneral, staleSources },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
