import type { NextRequest } from 'next/server';
import {
  type Feed,
  type FeedItem,
  extractTickers,
  fetchFeed,
  normalizeUrl,
  normalizeTitle,
  titleHasTicker,
} from '@/lib/feedParsing';

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
const FEEDS: Feed[] = [
  { name: 'Kaohoon', url: 'https://www.kaohoon.com/stockanalysis/feed' },
  { name: 'มิติหุ้น', url: 'https://www.mitihoon.com/category/%e0%b8%9a%e0%b8%97%e0%b8%a7%e0%b8%b4%e0%b9%80%e0%b8%84%e0%b8%a3%e0%b8%b2%e0%b8%b0%e0%b8%ab%e0%b9%8c/feed' },
];

const FEED_TIMEOUT_MS = 12000;
const GENERAL_TOKENS = new Set(['ALL', 'GENERAL', '_']);

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
  rating: 'ซื้อ' | 'ขาย' | 'ถือ' | null;
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await context.params;
  const t = ticker.toUpperCase();
  const wantGeneral = GENERAL_TOKENS.has(t);

  const settled = await Promise.allSettled(FEEDS.map(f => fetchFeed(f, 'research', FEED_TIMEOUT_MS)));
  let all: FeedItem[] = [];
  settled.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      all.push(...result.value);
    } else {
      console.log(`[research] REJECTED ${FEEDS[i].name} -> ${result.reason}  (${FEEDS[i].url})`);
    }
  });

  // Dedup across feeds (same convention as /api/news)
  const seenLinks = new Set<string>();
  const seenTitles = new Set<string>();
  const merged: FeedItem[] = [];
  for (const item of all) {
    if (!item.link) continue;
    const normLink = normalizeUrl(item.link);
    const normTitle = normalizeTitle(item.title);
    if (seenLinks.has(normLink) || (normTitle && seenTitles.has(normTitle))) continue;
    seenLinks.add(normLink);
    if (normTitle) seenTitles.add(normTitle);
    merged.push(item);
  }

  const sorted = merged.sort((a, b) => b.ts - a.ts);

  let selected: FeedItem[];
  if (wantGeneral) {
    selected = sorted.slice(0, 200);
  } else {
    const matches = sorted.filter(item => titleHasTicker(item.title, t));
    selected = matches.slice(0, 20);
  }

  const research: ResearchItem[] = selected.map(item => {
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

  return Response.json(
    { research },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
