// F45 (สรุปผลการดำเนินงาน) detail-page parser - shared by app/api/f45/[ticker]/route.ts
// (live per-stock lookup) and scripts/fetch_earnings.py (market-wide batch
// fetch). The Python side is a manual line-for-line port of this file - there
// is no cross-language import, so any change to the parsing rules here
// (regexes, scaling, sign handling) must be mirrored by hand in
// parse_f45_detail()/parse_number() in fetch_earnings.py, or the two will
// silently drift apart.

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
  // Filled in by the route handler (not by parseF45Detail - these come from
  // matching a nearby news-list item / lib/earningsBucket.ts, not the F45
  // <pre> body itself).
  mdaUrl: string | null;
  bucket: import('./earningsBucket').EarningsBucket | null;
  // Cross-referenced from the batch earnings_feed.json (scripts/extract_reason.py)
  // by ticker+quarter - this route fetches F45 live, it doesn't extract
  // reasons itself. Absent (empty/'none') if this filing hasn't been through
  // that batch run yet.
  reason: string;
  reason_source: 'mda_extract' | 'none';
}

// SET's F45 template writes losses as "(34,882)" (accounting parens), not
// "-34,882" - verified 2026-07-14 against DEXON's Q1 F45 filing. Kept in sync
// with parse_number() in scripts/fetch_earnings.py.
export function parseNumber(s: string): number | null {
  const trimmed = s.trim();
  const negative = trimmed.startsWith('(') && trimmed.endsWith(')');
  const body = negative ? trimmed.slice(1, -1) : trimmed;
  const n = parseFloat(body.replace(/,/g, ''));
  if (Number.isNaN(n)) return null;
  return negative ? -n : n;
}

export function yoyPct(curr: number | null, prior: number | null): number | null {
  if (curr == null || prior == null || prior === 0) return null;
  return ((curr - prior) / Math.abs(prior)) * 100;
}

// The F45 filing is a plain-text template inside a single <pre> block —
// "แบบสรุปผลการดำเนินงาน (F45)" — with a fixed set of labeled rows. Verified
// against live PTT (profit) and DEXON (loss, parenthesized) Q1 filings.
export function parseF45Detail(html: string): Partial<F45Data> {
  const preMatch = html.match(/<pre>([\s\S]*?)<\/pre>/);
  if (!preMatch) return {};
  // Correction filings sometimes tag the revised figure inline with no
  // separating whitespace - e.g. "(0.04)(แก้ไข)       (0.14)" (verified on
  // NRF's corrected Q1 F45). Left in place, the profit-pair regex below
  // would swallow the annotation's opening paren and fail to close, so the
  // whole pair silently comes back null. Strip the marker before parsing.
  const text = preMatch[1].replace(/\(แก้ไข\)/g, '');

  const quarterMatch = text.match(/ไตรมาสที่\s*(\d)/);
  // Non-calendar fiscal-year companies (e.g. BTS, year-end 31 มี.ค.) label
  // their annual filing "12 เดือน" instead of "ประจำปี" - verified on BTS's
  // FY F45, which otherwise fell through both checks and left quarter null.
  const isAnnual = !quarterMatch && /ประจำปี|12\s*เดือน/.test(text);
  const yearMatch = text.match(/ปี\s*[\r\n\s\t]+(\d{4})\s+(\d{4})/);
  const periodEndMatch = text.match(/สิ้นสุดวันที่[\s\S]{0,60}?(\d{1,2}\s+\S+)\s*[\r\n]/);
  const opinionMatch = text.match(/ประเภทรายงานของผู้สอบบัญชีในงบการเงิน[\s\S]{0,30}?[\r\n]\s*([^\r\n]+)/);
  const unitIsThousand = /หน่วย\s*:\s*พันบาท/.test(text);
  const scale = unitIsThousand ? 1000 : 1;

  // First "กำไร (ขาดทุน)" pair = net profit; second = EPS (บาท/หุ้น, no scaling).
  // Character class includes ()  so a parenthesized loss like "(34,882)" is
  // captured whole - parseNumber() below handles the negation.
  const profitPairs = [...text.matchAll(/กำไร \(ขาดทุน\)\s*([\d,.\-()]+)\s+([\d,.\-()]+)/g)];
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
