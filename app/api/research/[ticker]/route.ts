import type { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import {
  type Feed,
  type FeedItem,
  extractTickers,
  fetchFeed,
  normalizeUrl,
  titleHasTicker,
} from '@/lib/feedParsing';
import rawIaaResearch from '@/data/scans/research_iaa.json';
import { IAA_SOURCE_NAME } from '@/lib/researchRating';

// Broker-research feeds — probed 2026-07-12. Both are WordPress category
// feeds (same /feed pattern as the general news route), containing actual
// analyst research write-ups (broker name, ticker, target price in the
// headline), not general market news.
//
// Verified NOT usable:
//   InfoQuest (infoquest.co.th)     -> no dedicated analysis category, only
//     a general /stock category mixing regular news with research
//   Settrade Research / IAA Consensus -> Incapsula bot-protection; browser
//     navigation hangs the full 300s on every attempt (3x), and curl only
//     gets the Nuxt.js SPA shell HTML — the actual consensus data loads via
//     a client-side API call this session could never observe
//   มิติหุ้น (category บทวิเคราะห์) -> reachable fine outside Vercel, but
//     production's egress IP has been blocked on mitihoon.com since
//     2026-07-11 (same block as the main news route - see
//     app/api/news/[ticker]/route.ts). scripts/save_research.py fetches it
//     from a non-blocked runner into the daily archive instead; merged in
//     below via loadHistoricalResearch(), same pattern as the news route's
//     HoonSmart/มิติหุ้น batch-only sources.
const FEEDS: Feed[] = [
  { name: 'Kaohoon', url: 'https://www.kaohoon.com/stockanalysis/feed' },
  { name: 'ข่าวหุ้น (คอลัมน์)', url: 'https://www.kaohoon.com/column/feed' },
];

const FEED_TIMEOUT_MS = 12000;
const LIVE_REVALIDATE_SEC = 60; // same reasoning as the news route - share one upstream fetch per minute instead of hitting Kaohoon on every page view
const GENERAL_TOKENS = new Set(['ALL', 'GENERAL', '_']);

// Daily snapshots written by scripts/save_research.py, same layout/reasoning
// as app/api/news/[ticker]/route.ts's loadHistoricalItems().
const HISTORY_DAYS = 7;
const HISTORY_DIR = path.join(process.cwd(), 'public', 'data', 'history');

function loadHistoricalResearch(): FeedItem[] {
  const items: FeedItem[] = [];
  const now = Date.now();
  for (let i = 0; i < HISTORY_DAYS; i++) {
    const date = new Date(now - i * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
    const filePath = path.join(HISTORY_DIR, date, 'research.json');
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      items.push(...(JSON.parse(raw) as FeedItem[]));
    } catch {
      // no snapshot for this day yet — not an error, just nothing to add
    }
  }
  return items;
}

// ── Best-effort title parsing ────────────────────────────────────────────────
// Headlines follow a fairly consistent Thai financial-press convention —
// broker name first (often quoted or before a colon), then a ticker, often a
// target price — but this is heuristic, not a real parser. Any field can
// legitimately come back null; the UI must render the item as a plain news
// card when that happens, not drop it (see app/news/page.tsx research tab).
const KNOWN_BROKERS = [
  'FSS', 'ดาโอ', 'Daol', 'ฟินันเซียฯ', 'ฟินันเซีย', 'KGI', 'CGS', 'SCB EIC', 'SCBS', 'Pi', 'GCAP GOLD', 'GCAP',
  'หยวนต้า', 'Yuanta', 'เอเซีย พลัส', 'ASPS', 'บัวหลวง', 'Bualuang', 'ธนชาต', 'ทรีนีตี้', 'Trinity',
  'KKP', 'Phillip', 'ฟิลลิป', 'RHB', 'UOB Kay Hian', 'เมย์แบงก์', 'Maybank', 'กรุงศรี', 'Krungsri',
  'InnovestX', 'เคจีไอ', 'ทิสโก้', 'Tisco', 'กสิกรไทย',
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractBroker(title: string): string | null {
  // Strip leading quote marks and a "บล." (บริษัทหลักทรัพย์ / securities co.)
  // prefix — headlines often read "บล.ดาโอ แนะซื้อ..." rather than the bare
  // broker name.
  const cleaned = title.replace(/^["“'‘]+/, '').replace(/^บล\.\s*/, '').trim();
  for (const b of KNOWN_BROKERS) {
    const re = new RegExp(`^${escapeRegex(b)}`, 'i');
    const m = cleaned.match(re);
    if (!m) continue;
    // \b is a no-op on Thai script (only [A-Za-z0-9_] count as \w in JS
    // regex), so half this list ("ดาโอ", "ฟินันเซีย", ...) would silently
    // never match with a \b-based boundary. Check manually instead: the
    // next character must not be another letter/digit (Thai or Latin) —
    // this is what actually stops "Pi" from matching inside "Pizza".
    const nextChar = cleaned[m[0].length];
    if (!nextChar || !/[A-Za-zก-๙0-9]/.test(nextChar)) return b;
  }
  return null;
}

function extractTargetPrice(title: string): number | null {
  const m = title.match(/เป้า(?:หมาย)?\s*(?:ที่)?\s*(\d+(?:\.\d+)?)\s*บาท/);
  if (m) return parseFloat(m[1]);
  const m2 = title.match(/\bTP\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
  if (m2) return parseFloat(m2[1]);
  return null;
}

// Requires "แนะ" (recommend) right before the rating word, or the rating
// word itself in quotes — plain "ขาย" alone would false-positive on very
// common Thai phrases like "ยอดขาย" (sales figures), unrelated to a rating.
function extractRating(title: string): 'ซื้อ' | 'ขาย' | 'ถือ' | null {
  if (/แนะ["“]?ซื้อ["”]?|["“]ซื้อ["”]/.test(title)) return 'ซื้อ';
  if (/แนะ["“]?ขาย["”]?|["“]ขาย["”]/.test(title)) return 'ขาย';
  if (/แนะ["“]?ถือ["”]?|["“]ถือ["”]/.test(title)) return 'ถือ';
  return null;
}

interface ResearchItem extends FeedItem {
  broker: string | null;
  tickers: string[];
  targetPrice: number | null;
  // Kaohoon/มิติหุ้น only ever produce the 3 fixed Thai words; SETTrade IAA
  // (see below) contributes open-ended English broker text ("BUY", "Trading
  // (Maintain)", ...) - widened to a plain string so both fit one field.
  // lib/researchRating.ts's classifyRating() buckets either vocabulary into
  // buy/sell/neutral for display.
  rating: string | null;
  companyName?: string | null;
  fileUrl?: string | null; // PDF link (IAA only) - link out only, never downloaded/stored
}

// SETTrade IAA (ศูนย์รวมบทวิเคราะห์) - fetched by data_engine's
// tools/research/fetch_iaa_research.py (Playwright batch, see that file for
// why: Incapsula blocks plain HTTP clients) into data/scans/research_iaa.json,
// same static-import pattern as data/scans/macro_commodities.json. Structured
// (broker/ticker/rating/date are real fields, not title-guessed), so no
// heuristic parsing needed here - just reshape into ResearchItem.
interface IaaRawItem {
  uuid: string;
  title: string;
  url: string;
  tickers: string[];
  broker: string | null;
  rating: string | null;
  companyName: string | null;
  date: string;
  ts: number;
  fileUrl: string | null;
}

const iaaRawItems: IaaRawItem[] = (rawIaaResearch as { items?: IaaRawItem[] }).items ?? [];

function iaaToResearchItem(raw: IaaRawItem): ResearchItem {
  return {
    title: raw.title,
    link: raw.url,
    pubDate: raw.date,
    ts: raw.ts,
    source: IAA_SOURCE_NAME,
    broker: raw.broker,
    tickers: raw.tickers,
    targetPrice: null,
    rating: raw.rating,
    companyName: raw.companyName,
    fileUrl: raw.fileUrl,
  };
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await context.params;
  const t = ticker.toUpperCase();
  const wantGeneral = GENERAL_TOKENS.has(t);

  const settled = await Promise.allSettled(
    FEEDS.map(f => fetchFeed(f, 'research', FEED_TIMEOUT_MS, LIVE_REVALIDATE_SEC))
  );
  let allLive: FeedItem[] = [];
  settled.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      allLive.push(...result.value);
    } else {
      console.log(`[research] REJECTED ${FEEDS[i].name} -> ${result.reason}  (${FEEDS[i].url})`);
    }
  });

  // Archive is always merged in as a base (same reasoning as the news
  // route) - not just for มิติหุ้น's batch-only path, but so Kaohoon itself
  // degrades gracefully to its own archived items if its live fetch ever
  // fails, instead of the tab going blank.
  const archivedItems = loadHistoricalResearch();

  // Sort BEFORE dedup so the winner of any duplicate is deterministic -
  // newest ts wins, ties broken by source name (same fix as the news route).
  const candidates = [...allLive, ...archivedItems].sort((a, b) => {
    if (b.ts !== a.ts) return b.ts - a.ts;
    return a.source.localeCompare(b.source);
  });

  // Dedup by link only - title-similarity dedup (as /api/news still does)
  // silently drops distinct research reports here. IAA's own title template
  // repeats the generic "บทวิเคราะห์ประจำวันที่ X" suffix across many
  // different companies/brokers on the same day; confirmed live on
  // 2026-07-16 data: 141 IAA items normalized down to 136 unique titles,
  // i.e. title-based dedup was discarding real distinct reports that happen
  // to share a templated headline. Each item already carries its own
  // uuid-backed link, so link-only dedup is both correct and sufficient.
  const seenLinks = new Set<string>();
  const sorted: FeedItem[] = [];
  for (const item of candidates) {
    if (!item.link) continue;
    const normLink = normalizeUrl(item.link);
    if (seenLinks.has(normLink)) continue;
    seenLinks.add(normLink);
    sorted.push(item); // candidates was already sorted, dedup preserves order
  }

  let selected: FeedItem[];
  let iaaSelected: IaaRawItem[];
  if (wantGeneral) {
    selected = sorted.slice(0, 200);
    iaaSelected = iaaRawItems;
  } else {
    const matches = sorted.filter(item => titleHasTicker(item.title, t));
    selected = matches.slice(0, 20);
    iaaSelected = iaaRawItems.filter(item => item.tickers.includes(t));
  }

  const feedResearch: ResearchItem[] = selected.map(item => {
    const broker = extractBroker(item.title);
    // Broker acronyms (SCB EIC, GCAP GOLD, KGI, CGS...) frequently collide
    // with real ticker symbols (SCB, GCAP...). If the broker name we just
    // matched contains the ticker as a token, it's almost certainly the
    // broker's own name, not a stock mention — drop it.
    const brokerTokens = broker ? new Set(broker.toUpperCase().split(/\s+/)) : null;
    const tickers = extractTickers(item.title).filter(tk => !brokerTokens?.has(tk));
    return {
      ...item,
      broker,
      tickers,
      targetPrice: extractTargetPrice(item.title),
      rating: extractRating(item.title),
    };
  });

  const iaaResearch: ResearchItem[] = iaaSelected.map(iaaToResearchItem);

  // General/tab view: plain chronological (IAA and Kaohoon/มิติหุ้น
  // interleaved by date). Single-ticker view (feeds /stock/[ticker]'s
  // related-research section): IAA first, since it's structured data
  // (real broker/ticker/rating fields) rather than title-guessed - then by
  // date within each group.
  const research: ResearchItem[] = wantGeneral
    ? [...feedResearch, ...iaaResearch].sort((a, b) => b.ts - a.ts)
    : [
        ...iaaResearch.sort((a, b) => b.ts - a.ts),
        ...feedResearch.sort((a, b) => b.ts - a.ts),
      ];

  return Response.json(
    { research },
    { headers: { 'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=300' } }
  );
}
