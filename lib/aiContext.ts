import { scanData } from '@/lib/scanData';

export interface FundamentalSnapshot {
  pe: number | null;
  roe: number | null;
  eps: number | null;
  de: number | null;
}

export interface NewsSnapshot {
  title: string;
  source: string;
  pubDate: string;
}

export interface StockContext {
  ticker: string;
  sepa: boolean | null;
  kell: boolean | null;
  stage: string | null;
  rsScore: number | null;
  comboScore: number | null;
  fundamental: FundamentalSnapshot | null;
  news: NewsSnapshot[];
}

// Pull the combined.json scan flags for one ticker (in-memory, no network call).
function getScanEntry(ticker: string) {
  return scanData.find(s => s.ticker === ticker) ?? null;
}

// Fetch fundamental + news via the app's own API routes (same deployment),
// using the incoming request's origin so this works both locally and on Vercel.
async function fetchFundamental(origin: string, ticker: string): Promise<FundamentalSnapshot | null> {
  try {
    const res = await fetch(`${origin}/api/fundamental/${encodeURIComponent(ticker)}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.error) return null;
    return { pe: data.pe ?? null, roe: data.roe ?? null, eps: data.eps ?? null, de: data.de ?? null };
  } catch {
    return null;
  }
}

async function fetchNews(origin: string, ticker: string): Promise<NewsSnapshot[]> {
  try {
    const res = await fetch(`${origin}/api/news/${encodeURIComponent(ticker)}`, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    if (data?.isGeneral) return []; // no ticker-specific news — don't feed unrelated market news as if it were about this stock
    const items = Array.isArray(data?.news) ? data.news : [];
    return items.slice(0, 5).map((n: { title: string; source: string; pubDate: string }) => ({
      title: n.title,
      source: n.source,
      pubDate: n.pubDate,
    }));
  } catch {
    return [];
  }
}

export async function buildStockContext(origin: string, ticker: string): Promise<StockContext> {
  const scan = getScanEntry(ticker);
  const [fundamental, news] = await Promise.all([
    fetchFundamental(origin, ticker),
    fetchNews(origin, ticker),
  ]);

  return {
    ticker,
    sepa: scan?.sepa ?? null,
    kell: scan?.kell ?? null,
    stage: scan?.stage ?? null,
    rsScore: scan?.rs_score ?? null,
    comboScore: scan?.combo_score ?? null,
    fundamental,
    news,
  };
}

// Render the context as a plain-text block to embed in the system prompt.
export function formatStockContext(ctx: StockContext): string {
  const lines: string[] = [];

  lines.push(`Ticker: ${ctx.ticker}`);
  lines.push(`Market Stage: ${ctx.stage ?? 'ไม่มีข้อมูล (ไม่อยู่ในชุดสแกน)'}`);
  lines.push(`RS Score: ${ctx.rsScore ?? 'ไม่มีข้อมูล'}`);
  lines.push(`Combo Score: ${ctx.comboScore != null ? `${ctx.comboScore}/4` : 'ไม่มีข้อมูล'}`);
  lines.push(`ผ่าน SEPA Trend Template: ${ctx.sepa == null ? 'ไม่มีข้อมูล' : ctx.sepa ? 'ผ่าน' : 'ไม่ผ่าน'}`);
  lines.push(`ผ่าน Oliver Kell EMAC: ${ctx.kell == null ? 'ไม่มีข้อมูล' : ctx.kell ? 'ผ่าน' : 'ไม่ผ่าน'}`);

  lines.push('');
  lines.push('ข้อมูลพื้นฐาน (Fundamental):');
  if (ctx.fundamental) {
    lines.push(`  P/E: ${ctx.fundamental.pe ?? 'N/A'}`);
    lines.push(`  ROE: ${ctx.fundamental.roe != null ? `${ctx.fundamental.roe}%` : 'N/A'}`);
    lines.push(`  EPS: ${ctx.fundamental.eps ?? 'N/A'}`);
    lines.push(`  D/E: ${ctx.fundamental.de ?? 'N/A'}`);
  } else {
    lines.push('  ไม่มีข้อมูล');
  }

  lines.push('');
  lines.push('ข่าวล่าสุด:');
  if (ctx.news.length > 0) {
    for (const n of ctx.news) {
      lines.push(`  - [${n.source}] ${n.title}`);
    }
  } else {
    lines.push('  ไม่พบข่าวเฉพาะของหุ้นตัวนี้');
  }

  return lines.join('\n');
}
