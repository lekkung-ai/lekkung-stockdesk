import type { NextRequest } from 'next/server';

const RSS_URL = 'https://www.infoquest.co.th/stock/feed/';

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

function extractCdata(raw: string): string {
  const m = raw.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  return m ? m[1].trim() : raw.replace(/<[^>]+>/g, '').trim();
}

function parseRSS(xml: string) {
  const items: { title: string; link: string; pubDate: string; source: string }[] = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(xml)) !== null) {
    const block = m[1];

    const titleRaw = block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '';
    const title = extractCdata(titleRaw);

    // <link> in RSS often has a text node after </link> — grab the href between tags
    const linkRaw = block.match(/<link>([\s\S]*?)<\/link>/)?.[1]
      ?? block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/)?.[1]
      ?? '';
    const link = extractCdata(linkRaw).replace(/\s+/g, '');

    const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() ?? '';

    const sourceRaw = block.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] ?? '';
    const source = extractCdata(sourceRaw) || 'InfoQuest';

    if (title) items.push({ title, link, pubDate, source });
  }
  return items;
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await context.params;
  const t = ticker.toUpperCase();

  try {
    const res = await fetch(RSS_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
      },
      next: { revalidate: 300 },
    });

    if (!res.ok) throw new Error(`RSS ${res.status}`);

    const xml = await res.text();
    const all = parseRSS(xml);

    const filtered = all
      .filter(item => item.title.toUpperCase().includes(t))
      .slice(0, 5)
      .map(item => ({
        title: item.title,
        link: item.link,
        pubDate: item.pubDate,
        source: item.source,
        sentiment: getSentiment(item.title),
      }));

    return Response.json(
      { news: filtered },
      { headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=60' } }
    );
  } catch {
    return Response.json({ news: [] }, { status: 200 });
  }
}
