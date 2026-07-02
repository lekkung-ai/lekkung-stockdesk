import type { NextRequest } from 'next/server';
import { parseHtmlTable } from '@/lib/parseHtmlTable';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BASE = 'https://market.sec.or.th/public/idisc/th/r246';

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

// Fix garbled headers caused by <sup>N</sup> inside <th> opening tags
function cleanHeader(h: string): string {
  const gtIdx = h.lastIndexOf('>');
  if (gtIdx >= 0) h = h.slice(gtIdx + 1);
  return h.replace(/\s*\d+\s*$/, '').trim();
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
    const page1 = await fetch(BASE, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'th-TH,th;q=0.9' },
      cache: 'no-store',
    });
    if (!page1.ok) return Response.json({ headers: [], rows: [], error: `page1_${page1.status}` });

    const html1 = await page1.text();
    const cookie = page1.headers.get('set-cookie') ?? '';
    const sessionCookie = cookie.split(';')[0];

    const body = new URLSearchParams({
      '__VIEWSTATE': extractToken(html1, '__VIEWSTATE'),
      '__VIEWSTATEGENERATOR': extractToken(html1, '__VIEWSTATEGENERATOR'),
      '__EVENTVALIDATION': extractToken(html1, '__EVENTVALIDATION'),
      'ctl00$CPH$BsCompany': '',
      'ctl00$CPH$BsCompany_t': '',
      'ctl00$CPH$BsCompany_v': '',
      'ctl00$CPH$txtSearchPerson': '',
      // rblDateType 2 = "วันที่เผยแพร่" (disclosure/publish date) = when the filing became available
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
      const { headers: rawHeaders, rows } = parseHtmlTable(html2, i);
      if (rows.length > 2) {
        const headers = rawHeaders.map(cleanHeader);

        // Re-key rows with cleaned headers
        const cleanedRows = rows.map(row => {
          const cleaned: Record<string, string> = {};
          rawHeaders.forEach((raw, idx) => {
            cleaned[headers[idx]] = row[raw] ?? '';
          });
          return cleaned;
        });

        const dateCol = headers.find(h => /รับเอกสาร|รับแจ้ง|รับรายงาน/.test(h)) || headers.find(h => /วันที่/.test(h));
        if (dateCol) {
          cleanedRows.sort((a, b) =>
            thaiDateToSortKey(b[dateCol] ?? '').localeCompare(thaiDateToSortKey(a[dateCol] ?? ''))
          );
        }

        return Response.json(
          { headers, rows: cleanedRows, fetchDate, dateBasis: 'วันที่เผยแพร่', from: dateFrom, to: dateTo },
          { headers: { 'Cache-Control': 'no-store' } }
        );
      }
    }
    return Response.json({ headers: [], rows: [], fetchDate, dateBasis: 'วันที่เผยแพร่' });
  } catch {
    return Response.json({ headers: [], rows: [], error: 'fetch_failed' });
  }
}
