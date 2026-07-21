import type { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';

interface MoverRow { symbol: string; last: number | null; percentChange: number | null; totalVolume: number | null; totalValue: number | null; }
type MarketRanking = { topGainer: MoverRow[]; topLoser: MoverRow[]; mostActiveValue: MoverRow[]; mostActiveVolume: MoverRow[] };
interface HistoryJson {
  generatedAt: string;
  windowDays: number;
  dates: string[];
  byDate: Record<string, { set: MarketRanking; mai: MarketRanking }>;
}

const FILE_PATH = path.join(process.cwd(), 'data', 'scans', 'topmover_history.json');

function readHistory(): HistoryJson | null {
  try {
    return JSON.parse(fs.readFileSync(FILE_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

// The full file (potentially a few MB across a 90-day + permanent month-end
// window) stays server-side - same "batch it once, serve slices" idea as
// /api/topmover-charts. Called with no params: just the lightweight
// metadata (date list) to size a date-picker. Called with ?date=: that one
// day's 4-panel data, falling back to the nearest earlier available date
// (weekends/holidays never got a snapshot) so a picked date never just 404s.
export async function GET(req: NextRequest) {
  const history = readHistory();
  if (!history) {
    return Response.json({ dates: [], windowDays: 90, generatedAt: null });
  }

  const dateParam = req.nextUrl.searchParams.get('date');
  if (!dateParam) {
    return Response.json({
      dates: history.dates,
      windowDays: history.windowDays,
      generatedAt: history.generatedAt,
    });
  }

  const resolvedDate = [...history.dates].reverse().find(d => d <= dateParam) ?? null;
  if (!resolvedDate) {
    return Response.json({ date: dateParam, resolvedDate: null, markets: null });
  }

  return Response.json({
    date: dateParam,
    resolvedDate,
    markets: history.byDate[resolvedDate],
  });
}
