import type { NextRequest } from 'next/server';
import { parseHtmlTable } from '@/lib/parseHtmlTable';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BASE = 'https://market.sec.or.th/public/idisc/th/r59';

function todayTH() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function daysAgoTH(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// ISO "YYYY-MM-DD" -> SEC form date "DD/MM/YYYY" (Gregorian, same format the form accepts)
function isoToSecDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

function extractToken(html: string, id: string): string {
  const m = html.match(new RegExp(`id="${id}"[^>]+value="([^"]+)"`));
  return m?.[1] ?? '';
}

function thaiDateToSortKey(thai: string): string {
  const m = thai.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return '0000-00-00';
  return `${parseInt(m[3]) - 543}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

export async function GET(req: NextRequest) {
  const fromParam = req.nextUrl.searchParams.get('from');
  const toParam = req.nextUrl.searchParams.get('to');
  const dateFrom = fromParam ? isoToSecDate(fromParam) : daysAgoTH(30);
  const dateTo = toParam ? isoToSecDate(toParam) : todayTH();

  try {
    // Step 1: GET to acquire ASP.NET form tokens + session
    const page1 = await fetch(BASE, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'th-TH,th;q=0.9' },
      cache: 'no-store',
    });
    if (!page1.ok) return Response.json({ headers: [], rows: [], error: `page1_${page1.status}` });

    const html1 = await page1.text();
    const sessionCookie = (page1.headers.get('set-cookie') ?? '').split(';')[0];

    // Step 2: POST search filtered by "วันที่ สนง.รับเอกสาร" (SEC office received date) = rblDateType 2
    const body = new URLSearchParams({
      '__VIEWSTATE': extractToken(html1, '__VIEWSTATE'),
      '__VIEWSTATEGENERATOR': extractToken(html1, '__VIEWSTATEGENERATOR'),
      '__EVENTVALIDATION': extractToken(html1, '__EVENTVALIDATION'),
      'ctl00$CPH$ddlCompany': '',
      'ctl00$CPH$rblDateType': '2',
      'ctl00$CPH$BSDateFrom': dateFrom,
      'ctl00$CPH$BSDateTo': dateTo,
      'ctl00$CPH$btSearch': 'Search',
    });

    const page2 = await fetch(BASE, {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'th-TH,th;q=0.9',
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: BASE,
        ...(sessionCookie ? { Cookie: sessionCookie } : {}),
      },
      body: body.toString(),
      cache: 'no-store',
    });
    if (!page2.ok) return Response.json({ headers: [], rows: [], error: `page2_${page2.status}` });

    const html2 = await page2.text();
    const fetchDate = new Date().toISOString().slice(0, 10);

    for (let i = 0; i < 6; i++) {
      const { headers, rows } = parseHtmlTable(html2, i);
      if (rows.length > 2) {
        const dateCol = headers.find(h => /วันที่/.test(h));
        if (dateCol) {
          rows.sort((a, b) =>
            thaiDateToSortKey(b[dateCol] ?? '').localeCompare(thaiDateToSortKey(a[dateCol] ?? ''))
          );
        }
        return Response.json(
          { headers, rows, fetchDate, dateBasis: 'วันที่ สนง.รับเอกสาร', from: dateFrom, to: dateTo },
          { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=60' } }
        );
      }
    }
    return Response.json(
      { headers: [], rows: [], fetchDate, dateBasis: 'วันที่ สนง.รับเอกสาร' },
      { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' } }
    );
  } catch {
    return Response.json({ headers: [], rows: [], error: 'fetch_failed' });
  }
}
