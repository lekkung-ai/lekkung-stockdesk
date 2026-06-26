import { parseHtmlTable } from '@/lib/parseHtmlTable';

export async function GET() {
  try {
    const res = await fetch('https://www.settrade.com/th/equities/market-data/biglot', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        Referer: 'https://www.settrade.com',
      },
    });
    if (!res.ok) return Response.json({ headers: [], rows: [] });
    const html = await res.text();
    const { headers, rows } = parseHtmlTable(html, 2);
    return Response.json(
      { headers, rows },
      { headers: { 'Cache-Control': 'public, max-age=120, stale-while-revalidate=60' } }
    );
  } catch {
    return Response.json({ headers: [], rows: [] });
  }
}
