import type { NextRequest } from 'next/server';
import { parseHtmlTable } from '@/lib/parseHtmlTable';

const BASE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml',
};

// r59: default view shows all recent transactions — filter client-side by company name
async function fetchR59(ticker: string) {
  const res = await fetch('https://market.sec.or.th/public/idisc/th/r59', { headers: BASE_HEADERS });
  if (!res.ok) return { headers: [], rows: [] };
  const html = await res.text();
  const { headers, rows } = parseHtmlTable(html, 0);
  const filtered = rows.filter(r => {
    const company = (r['ชื่อบริษัท'] ?? r[headers[0]] ?? '').toUpperCase();
    return company.includes(ticker);
  });
  return { headers, rows: filtered };
}

// r246: requires a 2-step form POST with session cookie forwarding
async function fetchR246(ticker: string) {
  const URL_246 = 'https://market.sec.or.th/public/idisc/th/r246';

  // Step 1: GET to obtain ViewState tokens + session cookie
  const getRes = await fetch(URL_246, { headers: BASE_HEADERS });
  if (!getRes.ok) return { headers: [], rows: [] };
  const getHtml = await getRes.text();

  const vsMatch  = getHtml.match(/id="__VIEWSTATE"[^>]*value="([^"]*)"/);
  const vsgMatch = getHtml.match(/id="__VIEWSTATEGENERATOR"[^>]*value="([^"]*)"/);
  const evMatch  = getHtml.match(/id="__EVENTVALIDATION"[^>]*value="([^"]*)"/);

  // Forward session cookie from GET response
  const setCookie = getRes.headers.get('set-cookie') ?? '';
  const cookieValue = setCookie.split(';')[0];

  const formData = new URLSearchParams({
    '__EVENTTARGET': '',
    '__EVENTARGUMENT': '',
    '__VIEWSTATE': vsMatch?.[1] ?? '',
    '__VIEWSTATEGENERATOR': vsgMatch?.[1] ?? '',
    '__EVENTVALIDATION': evMatch?.[1] ?? '',
    'ctl00$CPH$BsCompany':   ticker,
    'ctl00$CPH$BsCompany_t': ticker,
    'ctl00$CPH$BsCompany_v': '',
    'ctl00$CPH$txtSearchPerson': '',
    'ctl00$CPH$rblDateType': '0',
    'ctl00$CPH$BSDateFrom': '',
    'ctl00$CPH$BSDateTo':   '',
    'ctl00$CPH$btSearch':   'ค้นหา',
  });

  // Step 2: POST with session cookie included
  const postRes = await fetch(URL_246, {
    method: 'POST',
    headers: {
      ...BASE_HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: URL_246,
      ...(cookieValue ? { Cookie: cookieValue } : {}),
    },
    body: formData.toString(),
  });
  if (!postRes.ok) return { headers: [], rows: [] };
  const postHtml = await postRes.text();
  const { headers, rows } = parseHtmlTable(postHtml, 0);
  const filtered = rows.filter(r => {
    const first = Object.values(r)[0] ?? '';
    return first && !first.includes('ไม่พบ');
  });
  return { headers, rows: filtered };
}

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type') ?? '';
  const ticker = req.nextUrl.searchParams.get('ticker')?.toUpperCase() ?? '';
  if (!ticker) return Response.json({ headers: [], rows: [] });

  try {
    const result = type === '59' ? await fetchR59(ticker) : await fetchR246(ticker);
    return Response.json(result, {
      headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=60' },
    });
  } catch {
    return Response.json({ headers: [], rows: [] });
  }
}
