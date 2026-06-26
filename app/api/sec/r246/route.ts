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

function extractToken(html: string, id: string): string {
  const m = html.match(new RegExp(`id="${id}"[^>]+value="([^"]+)"`));
  return m?.[1] ?? '';
}

export async function GET() {
  try {
    // Step 1: GET page to acquire ASP.NET form tokens
    const page1 = await fetch(BASE, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'th-TH,th;q=0.9' },
      cache: 'no-store',
    });
    if (!page1.ok) return Response.json({ headers: [], rows: [], error: `page1_${page1.status}` });

    const html1 = await page1.text();
    const cookie = page1.headers.get('set-cookie') ?? '';
    const sessionCookie = cookie.split(';')[0];

    const viewstate = extractToken(html1, '__VIEWSTATE');
    const generator = extractToken(html1, '__VIEWSTATEGENERATOR');
    const evval = extractToken(html1, '__EVENTVALIDATION');

    // Step 2: POST form with 30-day date range search
    const body = new URLSearchParams({
      '__VIEWSTATE': viewstate,
      '__VIEWSTATEGENERATOR': generator,
      '__EVENTVALIDATION': evval,
      'ctl00$CPH$BsCompany': '',
      'ctl00$CPH$BsCompany_t': '',
      'ctl00$CPH$BsCompany_v': '',
      'ctl00$CPH$txtSearchPerson': '',
      'ctl00$CPH$rblDateType': '1',
      'ctl00$CPH$BSDateFrom': daysAgoTH(30),
      'ctl00$CPH$BSDateTo': todayTH(),
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
    // Find data table — pick the one with most rows
    for (let i = 0; i < 6; i++) {
      const { headers, rows } = parseHtmlTable(html2, i);
      if (rows.length > 2) {
        return Response.json(
          { headers, rows },
          { headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=60' } }
        );
      }
    }
    return Response.json({ headers: [], rows: [] });
  } catch (e) {
    return Response.json({ headers: [], rows: [], error: 'fetch_failed' });
  }
}
