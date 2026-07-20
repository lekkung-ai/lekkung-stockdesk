import type { NextRequest } from 'next/server';
import chartsRaw from '@/data/scans/topmover_charts.json';

interface Bar { date: string; open: number; high: number; low: number; close: number; }
interface ChartEntry { bars: Bar[]; ema200: (number | null)[]; }
interface ChartsJson { generated_at: string; days: number; ema_period: number; data: Record<string, ChartEntry>; }

const charts = chartsRaw as unknown as ChartsJson;

// The full bundle (~2MB, every ticker in the universe) stays server-side only -
// this route hands the client just the handful of tickers actually visible in
// a Top Movers panel, same "one batched request, no per-ticker fetch" idea as
// /api/sector-fundamentals, just backed by a local pipeline file instead of an
// upstream API.
export async function GET(req: NextRequest) {
  const tickersParam = req.nextUrl.searchParams.get('tickers');
  if (!tickersParam) {
    return Response.json({ error: 'missing_tickers' }, { status: 400 });
  }
  const tickers = tickersParam.split(',').map(t => t.trim().toUpperCase()).filter(Boolean);

  const data: Record<string, ChartEntry> = {};
  for (const t of tickers) {
    const entry = charts.data[t];
    if (entry) data[t] = entry;
  }

  return Response.json(
    { days: charts.days, ema_period: charts.ema_period, data },
    { headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=60' } }
  );
}
