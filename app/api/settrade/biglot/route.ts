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

    const rows = parseTableRows(await artRes.text());

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
