import type { NextRequest } from 'next/server';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const TWO_MONTHS_MS = 60 * 24 * 3600 * 1000;

// F45 (สรุปผลการดำเนินงาน) lives on Settrade's per-ticker news feed, not
// set.or.th (which is Incapsula-blocked from a server). Same cookie-bypass
// pattern as corporate-action/warrant-info: visit the HTML page first to pick
// up a session cookie that clears the bot-protection challenge.
async function getSessionCookie(ticker: string): Promise<string> {
  try {
    const res = await fetch(`https://www.settrade.com/th/equities/quote/${encodeURIComponent(ticker)}/news`, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8',
      },
      signal: AbortSignal.timeout(8000),
    });
    const rawCookies: string[] =
      typeof (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === 'function'
        ? (res.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
        : (res.headers.get('set-cookie') ?? '').split(/,(?=\s*\w+=)/);
    return rawCookies.map(c => c.split(';')[0].trim()).filter(Boolean).join('; ');
  } catch {
    return '';
  }
}

interface NewsListItem { uuid: string; title: string; publishDate: string }

// The news list page is server-rendered as a Nuxt payload (window.__NUXT__) —
// a minified JS object literal, not JSON. Rather than parse that whole
// structure, pull out just the uuid/title/publishDate triples we need with a
// scoped regex (each item's publishDate appears within the same object,
// shortly after its uuid/title).
function parseNewsList(html: string): NewsListItem[] {
  const items: NewsListItem[] = [];
  const re = /uuid:"(\d+)",title:"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const chunk = html.slice(m.index, m.index + 2000);
    const pd = chunk.match(/publishDate:"([^"]+)"/);
    items.push({ uuid: m[1], title: m[2], publishDate: pd ? pd[1] : '' });
  }
  return items;
}

export interface F45Data {
  found: boolean;
  quarter: string | null;
  periodEnd: string | null;
  netProfit: number | null;
  netProfitPrior: number | null;
  netProfitYoY: number | null;
  eps: number | null;
  epsPrior: number | null;
  epsYoY: number | null;
  auditorOpinion: string | null;
  publishDate: string | null;
  newsUrl: string | null;
}

function parseNumber(s: string): number | null {
  const n = parseFloat(s.replace(/,/g, ''));
  return Number.isNaN(n) ? null : n;
}

function yoyPct(curr: number | null, prior: number | null): number | null {
  if (curr == null || prior == null || prior === 0) return null;
  return ((curr - prior) / Math.abs(prior)) * 100;
}

// The F45 filing is a plain-text template inside a single <pre> block —
// "แบบสรุปผลการดำเนินงาน (F45)" — with a fixed set of labeled rows. Verified
// against a live PTT Q1 filing.
function parseF45Detail(html: string): Partial<F45Data> {
  const preMatch = html.match(/<pre>([\s\S]*?)<\/pre>/);
  if (!preMatch) return {};
  const text = preMatch[1];

  const quarterMatch = text.match(/ไตรมาสที่\s*(\d)/);
  const isAnnual = !quarterMatch && /ประจำปี/.test(text);
  const yearMatch = text.match(/ปี\s*[\r\n\s\t]+(\d{4})\s+(\d{4})/);
  const periodEndMatch = text.match(/สิ้นสุดวันที่[\s\S]{0,60}?(\d{1,2}\s+\S+)\s*[\r\n]/);
  const opinionMatch = text.match(/ประเภทรายงานของผู้สอบบัญชีในงบการเงิน[\s\S]{0,30}?[\r\n]\s*([^\r\n]+)/);
  const unitIsThousand = /หน่วย\s*:\s*พันบาท/.test(text);
  const scale = unitIsThousand ? 1000 : 1;

  // First "กำไร (ขาดทุน)" pair = net profit; second = EPS (บาท/หุ้น, no scaling).
  const profitPairs = [...text.matchAll(/กำไร \(ขาดทุน\)\s*([\d,.\-]+)\s+([\d,.\-]+)/g)];
  const netProfit = profitPairs[0] ? parseNumber(profitPairs[0][1]) : null;
  const netProfitPrior = profitPairs[0] ? parseNumber(profitPairs[0][2]) : null;
  const eps = profitPairs[1] ? parseNumber(profitPairs[1][1]) : null;
  const epsPrior = profitPairs[1] ? parseNumber(profitPairs[1][2]) : null;

  const netProfitScaled = netProfit != null ? netProfit * scale : null;
  const netProfitPriorScaled = netProfitPrior != null ? netProfitPrior * scale : null;
  const year = yearMatch?.[1] ?? '';

  return {
    quarter: quarterMatch ? `ไตรมาส ${quarterMatch[1]}/${year}` : isAnnual ? `ประจำปี ${year}` : null,
    periodEnd: periodEndMatch ? `${periodEndMatch[1].trim()} ${year}`.trim() : null,
    netProfit: netProfitScaled,
    netProfitPrior: netProfitPriorScaled,
    netProfitYoY: yoyPct(netProfitScaled, netProfitPriorScaled),
    eps,
    epsPrior,
    epsYoY: yoyPct(eps, epsPrior),
    auditorOpinion: opinionMatch ? opinionMatch[1].trim() : null,
  };
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await context.params;
  const t = ticker.toUpperCase();
  const newsListUrl = `https://www.settrade.com/th/equities/quote/${t}/news`;
  const cacheHeaders = { 'Cache-Control': 'public, max-age=21600, s-maxage=21600, stale-while-revalidate=3600' };

  try {
    const cookie = await getSessionCookie(t);
    const listRes = await fetch(newsListUrl, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8',
        ...(cookie ? { Cookie: cookie } : {}),
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!listRes.ok) {
      return Response.json({ found: false }, { headers: cacheHeaders });
    }
    const listHtml = await listRes.text();
    const items = parseNewsList(listHtml);

    const cutoff = Date.now() - TWO_MONTHS_MS;
    const f45Items = items
      .filter(it => it.title.includes('F45') && Date.parse(it.publishDate) >= cutoff)
      .sort((a, b) => Date.parse(b.publishDate) - Date.parse(a.publishDate));

    if (f45Items.length === 0) {
      return Response.json({ found: false }, { headers: cacheHeaders });
    }

    const latest = f45Items[0];
    const detailUrl = `https://www.settrade.com/th/news-and-articles/news/${latest.uuid}?symbol=${t}`;
    const detailRes = await fetch(detailUrl, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8',
        Referer: newsListUrl,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      signal: AbortSignal.timeout(8000),
    });

    const detailHtml = detailRes.ok ? await detailRes.text() : '';
    const parsed = parseF45Detail(detailHtml);

    const data: F45Data = {
      found: true,
      quarter: parsed.quarter ?? null,
      periodEnd: parsed.periodEnd ?? null,
      netProfit: parsed.netProfit ?? null,
      netProfitPrior: parsed.netProfitPrior ?? null,
      netProfitYoY: parsed.netProfitYoY ?? null,
      eps: parsed.eps ?? null,
      epsPrior: parsed.epsPrior ?? null,
      epsYoY: parsed.epsYoY ?? null,
      auditorOpinion: parsed.auditorOpinion ?? null,
      publishDate: latest.publishDate ? latest.publishDate.slice(0, 10) : null,
      newsUrl: detailUrl,
    };

    return Response.json(data, { headers: cacheHeaders });
  } catch {
    return Response.json({ found: false, error: 'fetch_failed' }, { status: 500 });
  }
}
