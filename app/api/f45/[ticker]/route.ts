import type { NextRequest } from 'next/server';
import { parseF45Detail, type F45Data } from '@/lib/parseF45';
import { classifyBucket } from '@/lib/earningsBucket';

export type { F45Data };

// Kept in sync with classify_kind()'s mda branch in scripts/fetch_earnings.py.
const MDA_PATTERN = /คำอธิบายและวิเคราะห์ของฝ่ายจัดการ|คำอธิบายและการวิเคราะห์ของฝ่ายจัดการ|MD&A/;
const MDA_MATCH_MS = 3 * 24 * 3600 * 1000;

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

interface NewsListItem { uuid: string; title: string; publishDate: string; url: string | null }
interface RawNewsInfo { id: string; headline: string; datetime: string; url?: string }

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
    return raw.map(n => ({ uuid: n.id, title: n.headline, publishDate: n.datetime, url: n.url ?? null }));
  } catch {
    return [];
  }
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

    // Nearest MD&A filing to this F45's own publish date (same-day/adjacent
    // in practice - companies file F45, งบการเงิน and MD&A together).
    const anchorTime = Date.parse(latest.publishDate);
    const mdaItem = items.find(
      it => MDA_PATTERN.test(it.title) && Math.abs(Date.parse(it.publishDate) - anchorTime) <= MDA_MATCH_MS
    );

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
      mdaUrl: mdaItem?.url ?? null,
      bucket: classifyBucket(parsed.netProfit ?? null, parsed.netProfitPrior ?? null),
    };

    return Response.json(data, { headers: cacheHeaders });
  } catch {
    return Response.json({ found: false, error: 'fetch_failed' }, { status: 500 });
  }
}
