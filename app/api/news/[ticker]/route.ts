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
} from '@/lib/feedParsing';

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
  const settled = await Promise.allSettled(FEEDS.map(f => fetchFeedShared(f, 'news', FEED_TIMEOUT_MS)));
  let allLive: NewsItem[] = [];
  settled.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      allLive.push(...result.value);
    } else {
      console.log(`[news] REJECTED ${FEEDS[i].name} -> ${result.reason}  (${FEEDS[i].url})`);
    }
  });

  // Load daily snapshots for the past HISTORY_DAYS days
  const archivedItems: NewsItem[] = loadHistoricalItems();

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
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
