import { parseHtmlTable } from '@/lib/parseHtmlTable';

const SEC_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8',
  Referer: 'https://market.sec.or.th/',
};

export async function GET() {
  try {
    const res = await fetch('https://market.sec.or.th/public/idisc/th/r59', {
      headers: SEC_HEADERS,
      cache: 'no-store',
    });
    if (!res.ok) return Response.json({ headers: [], rows: [], error: `upstream_${res.status}` });
    const html = await res.text();
    // Try each table index to find the one with actual data rows
    for (let i = 0; i < 6; i++) {
      const { headers, rows } = parseHtmlTable(html, i);
      if (rows.length > 2) {
        return Response.json(
          { headers, rows },
          { headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=60' } }
        );
      }
    }
    return Response.json({ headers: [], rows: [] });
  } catch {
    return Response.json({ headers: [], rows: [], error: 'fetch_failed' });
  }
}
