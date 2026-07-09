import Link from 'next/link'; // Trigger Vercel Build
import rawSectorMap from '@/data/scans/sector_map.json';
import rawStageDefault from '@/data/scans/market_stage.json';
import rawCombinedDefault from '@/data/scans/combined.json';
import rawSepaDefault from '@/data/scans/sepa.json';
import rawKellDefault from '@/data/scans/oliver_kell.json';
import rawBreakoutDefault from '@/data/scans/breakout.json';
import TopRSTable from '@/components/TopRSTable';
import SetIndexCard from '@/components/SetIndexCard';
import VolumeCard from '@/components/VolumeCard';
import InvestorTypeSection from '@/components/InvestorTypeSection';
import SectorOverview from '@/components/SectorOverview';
import type { SectorBreadthInfo } from '@/components/SectorOverview';
import IndexImpactSection from '@/components/IndexImpactSection';
import { getNewSepaTickers } from '@/lib/newSepaTickers';

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

const sectorMap = rawSectorMap as SectorMap;

const STAGE_ORDER = ['S.Bull', 'Bull', 'Accumulation', 'Recovery', 'Warning', 'Distribution', 'Bear'];
const STAGE_COLORS: Record<string, string> = {
  'S.Bull': '#1b5e20',
  'Bull': '#4caf50',
  'Accumulation': '#00bcd4',
  'Recovery': '#9e9e9e',
  'Warning': '#FFEB3B',
  'Distribution': '#ff9800',
  'Bear': '#ef5350',
};
const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
function formatThaiDateShort(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return `${d.getDate()} ${THAI_MONTHS_SHORT[d.getMonth()]}`;
}

export default function OverviewPage() {
  const rawStage = rawStageDefault;
  const rawCombined = rawCombinedDefault;
  const rawSepa = rawSepaDefault as { Ticker?: string }[];
  const rawKell = rawKellDefault as { ticker?: string }[];
  const rawBreakout = rawBreakoutDefault as { ticker?: string }[];

  const stageData = rawStage as StageEntry[];
  const _c = rawCombined as ScanEntry[] | { generated_at?: string; data: ScanEntry[] };
  const combinedData: ScanEntry[] = Array.isArray(_c) ? _c : (_c.data ?? []);
  const total = stageData.length;
  const scanDateLabel = formatThaiDateShort(Array.isArray(_c) ? undefined : _c.generated_at);

  // ── Signal counts ─────────────────────────────────────────────────────
  const sepaCount = rawSepa.length;
  const kellCount = rawKell.length;
  const breakoutCount = rawBreakout.length;
  const dualPass = combinedData.filter(s => s.sepa && s.kell).length;
  const stage2Count = stageData.filter(s => s.Stage === 'S.Bull' || s.Stage === 'Bull').length;

  // ── NEW badge (Phase 5) — SEPA passers today that weren't in the most
  // recent saved history snapshot. Empty set (no crash) if there's no prior
  // snapshot to compare against.
  const newSepaTickers = getNewSepaTickers(
    rawSepa.map(r => r.Ticker).filter((t): t is string => !!t)
  );
  const newSepaCount = newSepaTickers.size;

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
  const missingSectorTickers: string[] = [];
  for (const s of stageData) {
    const sec = sectorMap.ticker_to_sector[s.Ticker]?.sector;
    if (!sec) {
      missingSectorTickers.push(s.Ticker);
      continue;
    }
    if (!sectorStats[sec]) sectorStats[sec] = { aboveEMA50: 0, total: 0, bullish: 0, accum: 0, warn: 0 };
    sectorStats[sec].total += 1;
    if (s.Price > s.EMA50) sectorStats[sec].aboveEMA50 += 1;
    if (s.Stage === 'S.Bull' || s.Stage === 'Bull') sectorStats[sec].bullish += 1;
    else if (s.Stage === 'Accumulation' || s.Stage === 'Recovery') sectorStats[sec].accum += 1;
    else sectorStats[sec].warn += 1;
  }
  if (missingSectorTickers.length > 0) {
    console.warn(
      `[Overview] ${missingSectorTickers.length} ticker(s) have no sector_map.json mapping, excluded from Sector breadth/stage: ${missingSectorTickers.join(', ')}`
    );
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
  const breadthBySector: Record<string, SectorBreadthInfo> = {};
  for (const s of sectorBreadth) {
    breadthBySector[s.sector] = {
      total: s.total,
      above: s.above,
      pct: s.pct,
      bullishPct: s.bullishPct,
      accumPct: s.accumPct,
      warnPct: s.warnPct,
    };
  }

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
      isNew: newSepaTickers.has(entry.ticker),
    },
  }));

  // ── Market Health (Phase 4) ─────────────────────────────────────────────
  // % of the whole scanned universe passing the full 8-point Trend Template
  // (sepa.json), calibrated for the Thai SET+MAI universe (~900 tickers)
  // instead of arbitrary fixed counts that don't scale with universe size.
  const sepaPassPct = total > 0 ? (sepaCount / total) * 100 : 0;
  const marketHealth: 'Bullish' | 'Neutral' | 'Bearish' =
    sepaPassPct > 15 ? 'Bullish' : sepaPassPct >= 5 ? 'Neutral' : 'Bearish';
  const marketHealthColor =
    marketHealth === 'Bullish' ? '#1D9E75' : marketHealth === 'Neutral' ? '#EF9F27' : '#E24B4A';

  const signals = [
    { label: 'SEPA Pass',      count: sepaCount,     href: '/sepa',         color: '#1D9E75', bg: 'bg-[#1D9E75]/[0.08] border-[#1D9E75]/20 hover:border-[#1D9E75]/40', newCount: newSepaCount },
    { label: 'Oliver Kell',    count: kellCount,     href: '/kell',         color: '#378ADD', bg: 'bg-[#378ADD]/[0.08] border-[#378ADD]/20 hover:border-[#378ADD]/40', newCount: 0 },
    { label: 'Breakout Setup', count: breakoutCount, href: '/breakout',     color: '#EF9F27', bg: 'bg-[#EF9F27]/[0.08] border-[#EF9F27]/20 hover:border-[#EF9F27]/40', newCount: 0 },
    { label: 'Dual Pass',      count: dualPass,      href: '/scanner',      color: '#7F77DD', bg: 'bg-[#7F77DD]/[0.08] border-[#7F77DD]/20 hover:border-[#7F77DD]/40', newCount: 0 },
    { label: 'Stage 2 (Bull)', count: stage2Count,   href: '/market-stage', color: '#27AE60', bg: 'bg-[#27AE60]/[0.08] border-[#27AE60]/20 hover:border-[#27AE60]/40', newCount: 0 },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-[18px] font-bold text-white">Market Overview</h1>
        <p className="text-[12px] text-white/35 mt-0.5">SET · Universe: {total} stocks</p>
      </div>

      {/* ── 1. Top row: SET Index / Volume / Market Health (primary), SET50/SET100 (secondary) ── */}
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <SetIndexCard large />
          <VolumeCard large />
          <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-6">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-white/35 mb-1.5">Market Health</p>
            <p className="text-[36px] font-bold leading-none tabular-nums" style={{ color: marketHealthColor }}>
              {marketHealth}
            </p>
            <p className="text-[14px] mt-1.5 text-white/40">
              {sepaPassPct.toFixed(1)}% ผ่าน SEPA ({sepaCount}/{total})
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 max-w-md">
          <SetIndexCard label="SET50" symbol="^SET50.BK" href="/set-index/set50" />
          <SetIndexCard label="SET100" symbol="^SET100.BK" href="/set-index/set100" />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        {/* ── 2. Index Impact (รวม tab รายหุ้น/รายกลุ่ม) ── */}
        <IndexImpactSection />

        {/* ── 3. แรงซื้อ-ขาย ── */}
        <InvestorTypeSection />
      </div>

      {/* ── 4. Sector (Flow + Breadth merged) ── */}
      <SectorOverview breadthBySector={breadthBySector} scanDateLabel={scanDateLabel} />

      {/* ── 5. Market Structure (EMA Breadth + Stage Distribution + Sector Breadth) ── */}
      <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-5 space-y-6">
        <h2 className="text-[13px] font-semibold text-white">Market Structure</h2>

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

        <div>
          <h3 className="text-[12px] font-semibold text-white/60 mb-3">Stage Distribution</h3>
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
      </div>

      {/* ── 6. Scanner Signal Summary ── */}
      <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-white/25 mb-3">Scanner Signals</p>
        <div className="flex flex-wrap gap-2 md:flex-nowrap md:overflow-x-auto md:pb-1 md:-mx-4 md:px-4 lg:mx-0 lg:px-0 md:scrollbar-none">
          {signals.map(sig => (
            <Link
              key={sig.label}
              href={sig.href}
              className={`flex items-center gap-2.5 px-3.5 py-2 rounded-xl border transition-all flex-shrink-0 ${sig.bg}`}
            >
              <span className="text-[22px] font-bold tabular-nums leading-none" style={{ color: sig.color }}>
                {sig.count}
              </span>
              <span className="text-[11px] font-medium text-white/55 whitespace-nowrap">
                {sig.label}
                {sig.newCount > 0 && (
                  <span className="text-[#7F77DD] font-semibold"> (+{sig.newCount} ใหม่)</span>
                )}
              </span>
            </Link>
          ))}
        </div>
      </div>

      {/* ── 7. Top RS Leaders ── */}
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
