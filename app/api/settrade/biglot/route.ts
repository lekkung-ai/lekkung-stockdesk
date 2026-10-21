import type { NextRequest } from 'next/server';
import { createMemo, memoized } from '@/lib/serverMemo';

const RSS_URL = 'https://www.ryt9.com/tag/BIG+LOT%3A/rss.xml';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

interface RssItem {
  title: string;
  link: string;
  pubDate: string;
  bangkokDate: string;
}

export interface BigLotRow {
  symbol: string;
  transactions: number;
  volume: number;
  value: number;
  avgPrice: number;
}

function innerContent(tag: string, html: string): string[] {
  const re = new RegExp(`<${tag}(?:[^>"']|"[^"]*"|'[^']*')*>`, 'gi');
  const close = `</${tag}>`;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const start = m.index + m[0].length;
    const end = html.toLowerCase().indexOf(close.toLowerCase(), start);
    if (end === -1) continue;
    out.push(html.slice(start, end));
    re.lastIndex = end + close.length;
  }
  return out;
}

function stripTags(html: string): string {
  let text = html.replace(/<[^>]+>/g, '');
  text = text.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  return text.replace(/\s+/g, ' ').trim();
}

function pubDateToBangkokDate(pubDate: string): string {
  const d = new Date(pubDate);
  const bk = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  return bk.toISOString().slice(0, 10);
}

function parseRssItems(xml: string): RssItem[] {
  const items: RssItem[] = [];
  for (const block of innerContent('item', xml)) {
    const titleM = block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
    const linkM = block.match(/<link>\s*(https?:[^\s<]+?)\s*<\/link>/i);
    const dateM = block.match(/<pubDate[^>]*>(.*?)<\/pubDate>/i);
    const title = titleM?.[1]?.trim() ?? '';
    const link = linkM?.[1]?.trim() ?? '';
    const pubDate = dateM?.[1]?.trim() ?? '';
    if (!title.includes('วันนี้') || !title.includes('มูลค่าสูงสุด') || !link || !pubDate) continue;
    items.push({ title, link, pubDate, bangkokDate: pubDateToBangkokDate(pubDate) });
  }
  return items;
}

function parseTableRows(html: string): BigLotRow[] {
  const tables = innerContent('table', html);
  if (!tables.length) return [];
  
  const rows: BigLotRow[] = [];
  for (const tr of innerContent('tr', tables[0])) {
    let tds = innerContent('td', tr);
    if (!tds.length) tds = innerContent('th', tr);
    
    const cells = tds.map(stripTags);
    if (cells.length >= 5) {
      const symbol = cells[0].trim();
      if (!symbol || !/^[A-Za-z0-9\-\.]+$/.test(symbol) || symbol === 'หลักทรัพย์') continue;
      
      const transactions = parseInt(cells[1].replace(/,/g, ''), 10);
      const volume = parseInt(cells[2].replace(/,/g, ''), 10);
      const rawValue = parseFloat(cells[3].replace(/,/g, ''));
      const avgPrice = parseFloat(cells[4].replace(/,/g, ''));
      
      if (isNaN(transactions) || isNaN(volume) || isNaN(rawValue) || isNaN(avgPrice)) continue;
      
      rows.push({
        symbol,
        transactions,
        volume,
        value: parseFloat((rawValue / 1000).toFixed(2)),
        avgPrice,
      });
    }
  }
  return rows;
}

interface BigLotPayload {
  date: string;
  publishedAt: string;
  source: string;
  rows: BigLotRow[];
  availableDates: string[];
}

// Warm-instance memos (see lib/serverMemo.ts). The RSS index is the only part that can change
// within a day, so it gets a short hard limit; a past day's article no longer changes, so its
// parsed table is kept per link (today's only briefly). Only non-empty results are stored. `payloadMemo` is the last good
// answer per requested date and is used solely when upstream fails.
const RSS_MAX_AGE_MS = 3 * 60 * 1000;
const ARTICLE_TODAY_MAX_AGE_MS = 5 * 60 * 1000; // today's article could still be edited
const ARTICLE_PAST_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const rssMemo = createMemo<RssItem[]>(1);
const articleMemo = createMemo<BigLotRow[]>(40);
const payloadMemo = createMemo<BigLotPayload>(40);

// Big Lot may be at most 10 min behind: 240 s fresh + 120 s stale-while-revalidate at the CDN
// + the 180 s RSS memo above. Errors and empty answers are never cached.
const OK_CACHE = 'public, max-age=0, s-maxage=240, stale-while-revalidate=120';
const NO_CACHE = 'no-store';

export async function GET(req: NextRequest) {
  const selectedDate = req.nextUrl.searchParams.get('date');
  const memoKey = selectedDate ?? 'latest';

  // On any upstream failure: the last good payload for this request if this instance has one
  // (its own date / publishedAt fields still tell the page how old it is), else the same error
  // body as before. Either way it is not cached.
  const failed = (error: string, status = 200) => {
    const last = payloadMemo.get(memoKey);
    if (last) return Response.json(last.value, { headers: { 'Cache-Control': NO_CACHE } });
    return Response.json({ error, rows: [] }, { status, headers: { 'Cache-Control': NO_CACHE } });
  };

  try {
    let rssError = 'no_items';
    const items = await memoized(rssMemo, 'rss', RSS_MAX_AGE_MS, async () => {
      const rssRes = await fetch(RSS_URL, {
        headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, text/xml' },
        cache: 'no-store',
      });
      if (!rssRes.ok) {
        rssError = `rss_${rssRes.status}`;
        return null;
      }
      const parsed = parseRssItems(await rssRes.text());
      return parsed.length ? parsed : null;
    });
    if (!items) return failed(rssError);

    // Group by Bangkok date — keep latest item per date
    const dateMap = new Map<string, RssItem>();
    for (const item of items) {
      const ex = dateMap.get(item.bangkokDate);
      if (!ex || item.pubDate > ex.pubDate) dateMap.set(item.bangkokDate, item);
    }

    const availableDates = [...dateMap.keys()].sort().reverse();
    const targetDate = (selectedDate && dateMap.has(selectedDate)) ? selectedDate : availableDates[0];
    const targetItem = dateMap.get(targetDate)!;

    let articleError = 'article_empty';
    const todayBangkok = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
    const articleMaxAge = targetDate < todayBangkok ? ARTICLE_PAST_MAX_AGE_MS : ARTICLE_TODAY_MAX_AGE_MS;
    const rows = await memoized(articleMemo, targetItem.link, articleMaxAge, async () => {
      const artRes = await fetch(targetItem.link, {
        headers: { 'User-Agent': UA, Referer: 'https://www.ryt9.com' },
        cache: 'no-store',
      });
      if (!artRes.ok) {
        articleError = `article_${artRes.status}`;
        return null;
      }
      const parsed = parseTableRows(await artRes.text());
      return parsed.length ? parsed : null;
    });
    if (!rows) return failed(articleError);

    const payload: BigLotPayload = { date: targetDate, publishedAt: targetItem.pubDate, source: 'InfoQuest/RYT9', rows, availableDates };
    payloadMemo.set(memoKey, payload);
    return Response.json(payload, { headers: { 'Cache-Control': OK_CACHE } });
  } catch {
    return failed('fetch_failed', 500);
  }
}
