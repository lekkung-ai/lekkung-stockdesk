import fs from 'fs';
import path from 'path';
import type { EarningsBucket } from '@/lib/earningsBucket';
import { peadExtrasFor } from '@/lib/peadExtrasData';
import type { PeadExtra } from '@/lib/peadExtras';

export interface EarningsAnnouncement {
  ticker: string;
  sector: string | null;
  subsector: string | null;
  market: string | null;
  announceDate: string;
  quarter: string | null;
  periodEnd: string | null;
  netProfit: number | null;
  netProfitPrior: number | null;
  netProfitYoY: number | null;
  netProfitPriorQ?: number | null;
  netProfitQoQ?: number | null;
  // The quarter netProfitPriorQ comes from, and that quarter's own year-ago
  // profit - gives last quarter's %YoY for the ⚡ rule (lib/earningsMetrics.ts).
  priorQuarter?: string | null;
  netProfitPriorQPrior?: number | null;
  netProfitPriorQYoY?: number | null;
  profitAcceleration?: string | boolean | null;
  // Net profit of the 5 quarters ending at this filing, oldest first
  // (scripts/fetch_earnings.py build_profit_history). np null = no figure
  // (e.g. Q4 without a 9-month base) - a gap, never zero.
  profitHistory?: { q: string; np: number | null }[] | null;
  // Cumulative profit this year vs last year from the same F45 (9 months on a
  // Q3 filing, 6 on Q2) - null on Q1 / annual filings.
  cumMonths?: number | null;
  netProfitCum?: number | null;
  netProfitCumPrior?: number | null;
  eps: number | null;
  epsPrior: number | null;
  epsYoY: number | null;
  auditorOpinion: string | null;
  isCorrection: boolean;
  bucket: EarningsBucket | null;
  f45Url: string | null;
  statementUrl: string | null;
  mdaUrl: string | null;
  headline: string;
  // Rule-based extraction from the MD&A PDF (scripts/extract_reason.py) - no
  // AI involved. reason_source distinguishes how it was produced so this
  // same shape can carry an "ai_summary" source later without a schema
  // change; the frontend only needs reason to be non-empty.
  reason: string;
  reason_source: 'mda_extract' | 'none';
  gap_pct?: number | null;
  drift_d1_pct?: number | null;
  drift_d2_pct?: number | null;
  drift_d5_pct?: number | null;
  // % vs the last close before the announcement (scripts/enrich_earnings_pead.py):
  // pre = closes of the 5 days before (last = 0), post = [first reaction, D+1..D+5].
  price_path?: { pre: (number | null)[]; post: (number | null)[] } | null;
}

export interface EarningsCalendarEntry {
  ticker: string;
  date: string;
  status: 'confirmed' | 'predicted';
  quarter: string | null;
  basedOnLastYear?: string;
}

export interface EarningsBucketSummary {
  label: string;
  count: number;
  top3: { ticker: string; netProfitYoY: number }[];
}

export interface EarningsFeed {
  generatedAt: string;
  windowDays: number;
  universeSize: number;
  buckets: Record<EarningsBucket, EarningsBucketSummary>;
  announcements: EarningsAnnouncement[];
  calendar: EarningsCalendarEntry[];
  /** per-stock badges + ADTV (lib/peadExtras.ts) for the stocks in this feed only;
   *  ADTV is part of the PEAD rule (isPead). Absent on an old/empty feed. */
  extras?: Record<string, PeadExtra>;
}

const FEED_PATH = path.join(process.cwd(), 'public', 'data', 'earnings', 'earnings_feed.json');

// Static snapshot written by scripts/fetch_earnings.py (batch pipeline, runs
// ~09:45, ~18:00 and ~20:00 ICT) - read from disk, never fetched live, same pattern
// as public/data/sec/*.json. Read at request time (not a static import) so a
// fresh pipeline commit shows up without a redeploy.
export async function GET() {
  try {
    const raw = fs.readFileSync(FEED_PATH, 'utf-8');
    // f45Cache is the batch script's parsed-F45 store - never sent to the page.
    const { f45Cache: _cache, ...data } = JSON.parse(raw) as EarningsFeed & { f45Cache?: unknown };
    void _cache;
    // Small lookup (stage / ADTV / RS / Weinstein / scans) for the ~100 stocks in the
    // feed only - never the whole scan files. ADTV feeds the PEAD rule, the rest the
    // badges under every ticker (PEAD section and main table).
    const extras = peadExtrasFor(data.announcements.map(a => a.ticker));
    return Response.json({ ...data, extras }, {
      headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=60' },
    });
  } catch {
    return Response.json(
      { generatedAt: null, windowDays: 45, universeSize: 0, buckets: {}, announcements: [], calendar: [] },
      { status: 200 }
    );
  }
}
