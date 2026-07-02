import { parseHtmlTable } from '@/lib/parseHtmlTable';

const SEC_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8',
  Referer: 'https://market.sec.or.th/',
};

function thaiDateToSortKey(thai: string): string {
  const m = thai.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return '0000-00-00';
  return `${parseInt(m[3]) - 543}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

export async function GET() {
  try {
    const res = await fetch('https://market.sec.or.th/public/idisc/th/r59', {
      headers: SEC_HEADERS,
      cache: 'no-store',
    });
    if (!res.ok) return Response.json({ headers: [], rows: [], error: `upstream_${res.status}` });
    const html = await res.text();

    for (let i = 0; i < 6; i++) {
      const { headers, rows } = parseHtmlTable(html, i);
      if (rows.length > 2) {
        const dateCol = headers.find(h => /รับเอกสาร|รับแจ้ง|รับรายงาน/.test(h)) || headers.find(h => /วันที่/.test(h));
        if (dateCol) {
          rows.sort((a, b) =>
            thaiDateToSortKey(b[dateCol] ?? '').localeCompare(thaiDateToSortKey(a[dateCol] ?? ''))
          );
        }
        const fetchDate = new Date().toISOString().slice(0, 10);
        return Response.json(
          { headers, rows, fetchDate },
          { headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=60' } }
        );
      }
    }
    return Response.json({ headers: [], rows: [], fetchDate: new Date().toISOString().slice(0, 10) });
  } catch {
    return Response.json({ headers: [], rows: [], error: 'fetch_failed' });
  }
}
