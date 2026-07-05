import type { NextRequest } from 'next/server';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
// Widened from a strict 2 months: SET's 45-day filing deadline means an
// early filer's latest quarterly report can be >60 days old right up until
// the next quarter's own deadline, which would otherwise create a recurring
// "no report" gap for companies that file well ahead of the deadline.
const LOOKBACK_MS = 90 * 24 * 3600 * 1000;

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
interface RawNewsInfo { id: string; headline: string; datetime: string }

// The rendered news page (…/equities/quote/{ticker}/news) only ever shows the
// 5 most recent items — enough to silently miss an F45 that's within the
// 2-month window but has since been pushed down by unrelated news (verified:
// DELTA's Q1 F45 sat at position #6+, hidden behind daily SEC Form 59-2
// digest reposts). The page's own Nuxt bundle calls this JSON endpoint with a
// much higher limit, so use that directly instead of scraping the HTML.
async function fetchNewsList(ticker: string, cookie: string, limit = 50): Promise<NewsListItem[]> {
  try {
    const res = await fetch(`https://www.settrade.com/api/set/news/${encodeURIComponent(ticker)}/list?limit=${limit}`, {
      headers: {
        'User-Agent': UA,
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8',
        Referer: `https://www.settrade.com/th/equities/quote/${ticker}/news`,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const json = await res.json();
    const raw: RawNewsInfo[] = Array.isArray(json?.newsInfoList) ? json.newsInfoList : [];
    return raw.map(n => ({ uuid: n.id, title: n.headline, publishDate: n.datetime }));
  } catch {
    return [];
  }
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
    const items = await fetchNewsList(t, cookie);

    const cutoff = Date.now() - LOOKBACK_MS;
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
