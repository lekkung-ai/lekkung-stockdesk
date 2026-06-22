import Link from 'next/link';
import rawStage from '@/data/scans/market_stage.json';
import rawSectorMap from '@/data/scans/sector_map.json';
import rawCombined from '@/data/scans/combined.json';
import rawSepa from '@/data/scans/sepa.json';
import rawKell from '@/data/scans/oliver_kell.json';
import rawBreakout from '@/data/scans/breakout.json';
import TopRSTable from '@/components/TopRSTable';
import MetricCard from '@/components/MetricCard';
import { marketMetrics } from '@/lib/mockData';

interface StageEntry {
  Ticker: string;
  Stage: string;
  Price: number;
  EMA50: number;
  EMA200: number;
  Bar_Count: number;
  'ADTV(MB)': number;
}
interface ScanEntry {
  ticker: string;
  price: number;
  stage: string | null;
  rs_score: number;
  combo_score: number;
  sepa: boolean;
  kell: boolean;
  breakout: boolean;
}
interface SectorMap {
  sectors: unknown[];
  ticker_to_sector: Record<string, { sector: string; subsector: string }>;
}

const stageData = rawStage as StageEntry[];
const sectorMap = rawSectorMap as SectorMap;
const combinedData = rawCombined as ScanEntry[];

const STAGE_ORDER = ['S.Bull', 'Bull', 'Accumulation', 'Recovery', 'Warning', 'Distribution', 'Bear'];
const STAGE_COLORS: Record<string, string> = {
  'S.Bull': '#1D9E75',
  'Bull': '#27AE60',
  'Accumulation': '#378ADD',
  'Recovery': '#5B9BD5',
  'Warning': '#BA7517',
  'Distribution': '#E24B4A',
  'Bear': '#C0392B',
};
const SECTOR_COLORS: Record<string, string> = {
  'Financials': '#378ADD',
  'Energy & Utilities': '#EF9F27',
  'Technology': '#1D9E75',
  'Materials': '#9B59B6',
  'Industrials': '#E67E22',
  'Consumer Products': '#E24B4A',
  'Property': '#27AE60',
  'Services': '#7F77DD',
};

export default function OverviewPage() {
  const total = stageData.length;

  // ── Signal counts ─────────────────────────────────────────────────────
  const sepaCount = rawSepa.length;
  const kellCount = rawKell.length;
  const breakoutCount = rawBreakout.length;
  const dualPass = combinedData.filter(s => s.sepa && s.kell).length;
  const stage2Count = stageData.filter(s => s.Stage === 'S.Bull' || s.Stage === 'Bull').length;

  // ── Market Breadth ────────────────────────────────────────────────────
  const aboveEMA50 = stageData.filter(s => s.Price > s.EMA50).length;
  const aboveEMA200 = stageData.filter(s => s.Price > s.EMA200).length;
  const pctEMA50 = (aboveEMA50 / total) * 100;
  const pctEMA200 = (aboveEMA200 / total) * 100;

  // ── Stage Distribution ────────────────────────────────────────────────
  const stageCounts: Record<string, number> = {};
  for (const s of stageData) {
    stageCounts[s.Stage] = (stageCounts[s.Stage] ?? 0) + 1;
  }
  const stageSegments = STAGE_ORDER.filter(st => (stageCounts[st] ?? 0) > 0).map(st => ({
    stage: st,
    count: stageCounts[st] ?? 0,
    pct: ((stageCounts[st] ?? 0) / total) * 100,
    color: STAGE_COLORS[st] ?? '#6b7280',
  }));

  // ── Sector Breadth (with stage breakdown) ─────────────────────────────
  const sectorStats: Record<string, {
    aboveEMA50: number;
    total: number;
    bullish: number;
    accum: number;
    warn: number;
  }> = {};
  for (const s of stageData) {
    const sec = sectorMap.ticker_to_sector[s.Ticker]?.sector;
    if (!sec) continue;
    if (!sectorStats[sec]) sectorStats[sec] = { aboveEMA50: 0, total: 0, bullish: 0, accum: 0, warn: 0 };
    sectorStats[sec].total += 1;
    if (s.Price > s.EMA50) sectorStats[sec].aboveEMA50 += 1;
    if (s.Stage === 'S.Bull' || s.Stage === 'Bull') sectorStats[sec].bullish += 1;
    else if (s.Stage === 'Accumulation' || s.Stage === 'Recovery') sectorStats[sec].accum += 1;
    else sectorStats[sec].warn += 1;
  }
  const sectorBreadth = Object.entries(sectorStats)
    .map(([sector, d]) => ({
      sector,
      pct: (d.aboveEMA50 / d.total) * 100,
      above: d.aboveEMA50,
      total: d.total,
      bullishPct: (d.bullish / d.total) * 100,
      accumPct: (d.accum / d.total) * 100,
      warnPct: (d.warn / d.total) * 100,
    }))
    .sort((a, b) => b.pct - a.pct);

  // ── Top RS ────────────────────────────────────────────────────────────
  const stageMap = new Map(stageData.map(s => [s.Ticker, s.Stage]));
  const combinedMap = new Map(combinedData.map(s => [s.ticker, s]));
  const topRS = [...combinedData]
    .sort((a, b) => b.rs_score - a.rs_score)
    .slice(0, 10);

  const topRSRows = topRS.map(entry => ({
    ticker: entry.ticker,
    sector: sectorMap.ticker_to_sector[entry.ticker]?.sector ?? null,
    rsScore: entry.rs_score,
    stage: stageMap.get(entry.ticker) ?? entry.stage,
    signals: {
      sepa: combinedMap.get(entry.ticker)?.sepa ?? false,
      kell: combinedMap.get(entry.ticker)?.kell ?? false,
      breakout: combinedMap.get(entry.ticker)?.breakout ?? false,
      combo: combinedMap.get(entry.ticker)?.combo_score ?? 0,
    },
  }));

  const m = marketMetrics;

  const signals = [
    { label: 'SEPA Pass',       count: sepaCount,     href: '/sepa',         color: '#1D9E75',  bg: 'bg-[#1D9E75]/[0.08] border-[#1D9E75]/20 hover:border-[#1D9E75]/40' },
    { label: 'Oliver Kell',     count: kellCount,     href: '/kell',         color: '#378ADD',  bg: 'bg-[#378ADD]/[0.08] border-[#378ADD]/20 hover:border-[#378ADD]/40' },
    { label: 'Breakout Setup',  count: breakoutCount, href: '/breakout',     color: '#EF9F27',  bg: 'bg-[#EF9F27]/[0.08] border-[#EF9F27]/20 hover:border-[#EF9F27]/40' },
    { label: 'Dual Pass',       count: dualPass,      href: '/combo',        color: '#7F77DD',  bg: 'bg-[#7F77DD]/[0.08] border-[#7F77DD]/20 hover:border-[#7F77DD]/40' },
    { label: 'Stage 2 (Bull)',  count: stage2Count,   href: '/market-stage', color: '#27AE60',  bg: 'bg-[#27AE60]/[0.08] border-[#27AE60]/20 hover:border-[#27AE60]/40' },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-[18px] font-bold text-white">Market Overview</h1>
        <p className="text-[12px] text-white/35 mt-0.5">SET · Universe: {total} stocks</p>
      </div>

      {/* ── Metric bar ── */}
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 md:mx-0 px-4 md:px-0">
        <MetricCard
          label="SET Index"
          value={m.setIndex.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          sub={`${m.setChange >= 0 ? '+' : ''}${m.setChangeAmt.toFixed(2)} (${m.setChange >= 0 ? '+' : ''}${m.setChange.toFixed(2)}%)`}
          subColor={m.setChange >= 0 ? 'green' : 'red'}
        />
        <MetricCard
          label="Volume (พันล้าน ฿)"
          value={m.volumeBillion.toFixed(1)}
          sub="วันนี้"
          subColor="gray"
        />
        <MetricCard
          label="Gainers / Losers"
          value={`${m.gainers} / ${m.losers}`}
          sub={`Unchanged ${m.unchanged}`}
          subColor={m.gainers > m.losers ? 'green' : 'red'}
        />
        <MetricCard
          label="SEPA Pass"
          value={String(m.sepaPassCount)}
          sub={`จาก ${m.sepaTotal} ตัว (${((m.sepaPassCount / m.sepaTotal) * 100).toFixed(1)}%)`}
          subColor="gray"
        />
      </div>

      {/* ── Scanner Signal Summary ── */}
      <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-white/25 mb-3">Scanner Signals</p>
        <div className="flex flex-wrap gap-2">
          {signals.map(sig => (
            <Link
              key={sig.label}
              href={sig.href}
              className={`flex items-center gap-2.5 px-3.5 py-2 rounded-xl border transition-all ${sig.bg}`}
            >
              <span className="text-[22px] font-bold tabular-nums leading-none" style={{ color: sig.color }}>
                {sig.count}
              </span>
              <span className="text-[11px] font-medium text-white/55 whitespace-nowrap">{sig.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* ── SET Market Breadth ── */}
      <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-5">
        <h2 className="text-[13px] font-semibold text-white mb-4">SET Market Breadth</h2>
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#EF9F27' }} />
                <span className="text-[12px] text-white/60">% หุ้นเหนือ EMA 50</span>
              </div>
              <div className="text-right">
                <span className="text-[20px] font-bold" style={{ color: '#EF9F27' }}>
                  {pctEMA50.toFixed(1)}%
                </span>
                <span className="text-[11px] text-white/30 ml-2">{aboveEMA50}/{total}</span>
              </div>
            </div>
            <div className="h-3 bg-white/[0.06] rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${pctEMA50}%`, background: '#EF9F27' }} />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#7F77DD' }} />
                <span className="text-[12px] text-white/60">% หุ้นเหนือ EMA 200</span>
              </div>
              <div className="text-right">
                <span className="text-[20px] font-bold" style={{ color: '#7F77DD' }}>
                  {pctEMA200.toFixed(1)}%
                </span>
                <span className="text-[11px] text-white/30 ml-2">{aboveEMA200}/{total}</span>
              </div>
            </div>
            <div className="h-3 bg-white/[0.06] rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${pctEMA200}%`, background: '#7F77DD' }} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Stage Distribution ── */}
      <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-5">
        <h2 className="text-[13px] font-semibold text-white mb-4">Stage Distribution</h2>
        <div className="flex h-8 rounded-lg overflow-hidden gap-0.5 mb-4">
          {stageSegments.map(s => (
            <div
              key={s.stage}
              className="h-full"
              style={{ width: `${s.pct}%`, background: s.color }}
              title={`${s.stage}: ${s.count} (${s.pct.toFixed(1)}%)`}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {stageSegments.map(s => (
            <div key={s.stage} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: s.color }} />
              <span className="text-[11px] text-white/50">{s.stage}</span>
              <span className="text-[11px] font-semibold text-white/70 tabular-nums">{s.count}</span>
              <span className="text-[10px] text-white/25 tabular-nums">({s.pct.toFixed(0)}%)</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Sector Breadth ── */}
      <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-5">
        <h2 className="text-[13px] font-semibold text-white mb-4">Sector Breadth</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {sectorBreadth.map(s => {
            const accent =
              s.pct >= 60 ? '#1D9E75' :
              s.pct >= 40 ? '#BA7517' :
              '#E24B4A';
            const bgCls =
              s.pct >= 60 ? 'bg-[#1D9E75]/[0.05] border-[#1D9E75]/12' :
              s.pct >= 40 ? 'bg-[#BA7517]/[0.05] border-[#BA7517]/12' :
              'bg-[#E24B4A]/[0.05] border-[#E24B4A]/12';
            const sectorColor = SECTOR_COLORS[s.sector] ?? '#6b7280';
            return (
              <div key={s.sector} className={`rounded-xl border p-4 ${bgCls}`}>
                {/* Header row */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-4 rounded-full flex-shrink-0" style={{ background: sectorColor }} />
                    <span className="text-[12px] font-semibold text-white/80">{s.sector}</span>
                  </div>
                  <span className="text-[11px] text-white/30 tabular-nums">{s.total} หุ้น</span>
                </div>

                {/* EMA50 breadth */}
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-[28px] font-bold leading-none tabular-nums" style={{ color: accent }}>
                    {s.pct.toFixed(0)}%
                  </span>
                  <div className="flex-1">
                    <div className="text-[10px] text-white/30 mb-1">เหนือ EMA50</div>
                    <div className="h-1.5 bg-white/[0.07] rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${s.pct}%`, background: accent }} />
                    </div>
                    <div className="text-[10px] text-white/20 mt-0.5 tabular-nums">{s.above}/{s.total}</div>
                  </div>
                </div>

                {/* Stage mini bar */}
                <div>
                  <div className="text-[10px] text-white/20 mb-1.5">Stage distribution</div>
                  <div className="flex h-2 rounded-full overflow-hidden gap-px">
                    {s.bullishPct > 0 && (
                      <div
                        className="h-full rounded-l-full"
                        style={{ width: `${s.bullishPct}%`, background: '#1D9E75' }}
                        title={`Bull/S.Bull: ${s.bullishPct.toFixed(0)}%`}
                      />
                    )}
                    {s.accumPct > 0 && (
                      <div
                        className="h-full"
                        style={{ width: `${s.accumPct}%`, background: '#378ADD' }}
                        title={`Accum/Recovery: ${s.accumPct.toFixed(0)}%`}
                      />
                    )}
                    {s.warnPct > 0 && (
                      <div
                        className="h-full rounded-r-full"
                        style={{ width: `${s.warnPct}%`, background: '#E24B4A' }}
                        title={`Warning/Bear: ${s.warnPct.toFixed(0)}%`}
                      />
                    )}
                  </div>
                  <div className="flex gap-3 mt-1.5">
                    <span className="text-[10px] tabular-nums" style={{ color: '#1D9E75' }}>
                      {s.bullishPct.toFixed(0)}% Bull
                    </span>
                    <span className="text-[10px] tabular-nums" style={{ color: '#378ADD' }}>
                      {s.accumPct.toFixed(0)}% Accum
                    </span>
                    <span className="text-[10px] tabular-nums" style={{ color: '#E24B4A' }}>
                      {s.warnPct.toFixed(0)}% Warn
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Top RS Leaders ── */}
      <div className="bg-[#13161e] border border-white/[0.07] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/[0.06]">
          <h2 className="text-[13px] font-semibold text-white">Top RS Leaders</h2>
          <p className="text-[11px] text-white/30 mt-0.5">10 หุ้น RS Score สูงสุด</p>
        </div>
        <TopRSTable rows={topRSRows} />
      </div>
    </div>
  );
}
