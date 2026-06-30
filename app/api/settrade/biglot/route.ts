import type { NextRequest } from 'next/server';

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
  volume: number;
  value: number;
  avgPrice: number;
  time: string;
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
    if (!title.includes('(By Time)') || !link || !pubDate) continue;
    items.push({ title, link, pubDate, bangkokDate: pubDateToBangkokDate(pubDate) });
  }
  return items;
}

function parsePreRows(html: string): BigLotRow[] {
  const preBlocks = innerContent('pre', html);
  // PRE[0] is header row, PRE[1] is data rows
  const dataText = (preBlocks[1] ?? preBlocks[0] ?? '').replace(/<[^>]+>/g, '');
  const rows: BigLotRow[] = [];
  for (const line of dataText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || !/^[A-Z]/.test(trimmed)) continue;
    const parts = trimmed.split(/\s{2,}/);
    if (parts.length < 4) continue;
    const volume = parseFloat(parts[1]?.replace(/,/g, '') ?? '');
    const rawValue = parseFloat(parts[2]?.replace(/,/g, '') ?? '');
    const avgPrice = parseFloat(parts[3]?.replace(/,/g, '') ?? '');
    if (isNaN(volume) || isNaN(rawValue) || isNaN(avgPrice)) continue;
    rows.push({
      symbol: parts[0],
      volume,
      value: parseFloat((rawValue / 1000).toFixed(2)), // พันบาท → ลบ.
      avgPrice,
      time: parts[4]?.trim() ?? '',
    });
  }
  return rows;
}

export async function GET(req: NextRequest) {
  const selectedDate = req.nextUrl.searchParams.get('date');
  try {
    const rssRes = await fetch(RSS_URL, {
      headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, text/xml' },
      cache: 'no-store',
    });
    if (!rssRes.ok) return Response.json({ error: `rss_${rssRes.status}`, rows: [] });

    const items = parseRssItems(await rssRes.text());
    if (!items.length) return Response.json({ error: 'no_items', rows: [] });

    // Group by Bangkok date — keep latest item per date
    const dateMap = new Map<string, RssItem>();
    for (const item of items) {
      const ex = dateMap.get(item.bangkokDate);
      if (!ex || item.pubDate > ex.pubDate) dateMap.set(item.bangkokDate, item);
    }

    const availableDates = [...dateMap.keys()].sort().reverse();
    const targetDate = (selectedDate && dateMap.has(selectedDate)) ? selectedDate : availableDates[0];
    const targetItem = dateMap.get(targetDate)!;

    const artRes = await fetch(targetItem.link, {
      headers: { 'User-Agent': UA, Referer: 'https://www.ryt9.com' },
      cache: 'no-store',
    });
    if (!artRes.ok) return Response.json({ error: `article_${artRes.status}`, rows: [] });

    const rows = parsePreRows(await artRes.text());

    // Cache: 30 min after 17:00 BKK, 5 min before
    const bkHour = new Date(Date.now() + 7 * 3600000).getUTCHours();
    const cache = bkHour >= 17 ? 'public, max-age=1800, stale-while-revalidate=60'
                               : 'public, max-age=300, stale-while-revalidate=60';

    return Response.json(
      { date: targetDate, publishedAt: targetItem.pubDate, source: 'InfoQuest/RYT9', rows, availableDates },
      { headers: { 'Cache-Control': cache } }
    );
  } catch {
    return Response.json({ error: 'fetch_failed', rows: [] }, { status: 500 });
  }
}
