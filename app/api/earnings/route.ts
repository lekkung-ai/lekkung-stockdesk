import fs from 'fs';
import path from 'path';
import type { EarningsBucket } from '@/lib/earningsBucket';

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
}

const FEED_PATH = path.join(process.cwd(), 'public', 'data', 'earnings', 'earnings_feed.json');

// Static snapshot written by scripts/fetch_earnings.py (batch pipeline, runs
// ~09:45 and ~17:30 ICT) - read from disk, never fetched live, same pattern
// as public/data/sec/*.json. Read at request time (not a static import) so a
// fresh pipeline commit shows up without a redeploy.
export async function GET() {
  try {
    const raw = fs.readFileSync(FEED_PATH, 'utf-8');
    const data: EarningsFeed = JSON.parse(raw);
    return Response.json(data, {
      headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=60' },
    });
  } catch {
    return Response.json(
      { generatedAt: null, windowDays: 45, universeSize: 0, buckets: {}, announcements: [], calendar: [] },
      { status: 200 }
    );
  }
}
