'use client';

import { useState, useMemo, Suspense, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import rawCombined from '@/data/scans/combined.json';
import rawMarketStage from '@/data/scans/market_stage.json';
import rawPpbp from '@/data/scans/ppbp.json';
import rawStageAll from '@/data/scans/stage_all.json';
import rawWeinstein from '@/data/scans/weinstein.json';
import { scanGeneratedAt } from '@/lib/scanData';
import StaleDataBanner from '@/components/StaleDataBanner';
import { formatThaiDate } from '@/lib/utils';
import { useLivePrices } from '@/lib/useLivePrices';
import { useInfiniteRows } from '@/lib/useInfiniteRows';
import MobileScanProgress from '@/components/MobileScanProgress';
import ScrollToTopButton from '@/components/ScrollToTopButton';
import TrendSparkline from '@/components/TrendSparkline';
import { ChangeBadge } from '@/components/ChangeBadge';
import { sparklineMap } from '@/lib/sparklineData';
import Pagination from '@/components/Pagination';
import TableSkeleton from '@/components/TableSkeleton';
import GrowthScatter, { type ScatterPoint } from '@/components/scanner/GrowthScatter';
import { LayoutGrid, ScatterChart as ScatterIcon } from 'lucide-react';
import {
  rsColor,
  stageCls,
  SectorChip,
  Th,
  Td,
  TableWrap,
  FilterBar,
  Divider,
  PageHeader,
  SortableTh,
  SortConfig,
  ExportCSVButton,
  AddMyStockButton,
} from '@/components/StrategyTable';

// ─── Types ────────────────────────────────────────────────────────────────────

type CombinedEntry = {
  ticker: string;
  price: number;
  sepa: boolean;
  kell: boolean;
  breakout: boolean;
  lekkung: boolean;
  oneil: boolean;
  stage: string | null;
  rs_score: number | null;
  combo_score: number;
  growth_yoy: number | null;
  growth_qoq: number | null;
};

type MarketStageEntry = { Ticker: string; Bar_Count: number };
type PpbpEntry = { Ticker: string };
type StageAllEntry = { Ticker: string; Chg30D?: number | null };

// ─── Module-level data (computed once) ────────────────────────────────────────

const _rawC = rawCombined as unknown as CombinedEntry[] | { generated_at?: string; data: CombinedEntry[] };
const combinedData: CombinedEntry[] = Array.isArray(_rawC) ? _rawC : _rawC.data;

const barCountMap = new Map<string, number>(
  (rawMarketStage as unknown as MarketStageEntry[]).map(r => [r.Ticker, r.Bar_Count])
);

const ppbpSet = new Set<string>(
  (rawPpbp as unknown as PpbpEntry[]).map(r => r.Ticker)
);

const chg30dMap = new Map<string, number | null>(
  (rawStageAll as unknown as StageAllEntry[]).map(r => [r.Ticker, r.Chg30D ?? null])
);

// 52W High/Low map — weinstein.json covers ~all SET tickers
const w52Map = new Map<string, { high: number; low: number }>(
  (rawWeinstein as unknown as { Ticker: string; '52W_High': number; '52W_Low': number }[])
    .map(w => [w.Ticker, { high: w['52W_High'], low: w['52W_Low'] }])
);

// ─── Row type & helpers ────────────────────────────────────────────────────────

type EntryKind = 'ppbp' | 'pullback' | 'breakout' | 'none';

type Row = CombinedEntry & {
  ppbp: boolean;
  barCount: number | null;
  chg30d: number | null;
  entry: EntryKind;
};

function getEntry(ppbp: boolean, sepa: boolean, kell: boolean, breakout: boolean): EntryKind {
  if (ppbp) return 'ppbp';
  if (sepa && kell) return 'pullback';
  if (breakout) return 'breakout';
  return 'none';
}

// ── 52WH distance: (Close - 52W_High) / 52W_High, as a % (0 = ที่ high พอดี) ──

function pctFromHigh(price: number, high: number | undefined): number | null {
  if (high == null || high <= 0) return null;
  return ((price - high) / high) * 100;
}

function dist52whCls(pct: number): string {
  const abs = Math.abs(pct);
  if (abs <= 3) return 'text-[#1D9E75]';
  if (abs <= 10) return 'text-[#F9C942]';
  return 'text-white/35';
}

const ENTRY_ORDER: Record<EntryKind, number> = { ppbp: 0, pullback: 1, breakout: 2, none: 3 };

const allRows: Row[] = combinedData.map(c => {
  const ppbp = ppbpSet.has(c.ticker);
  return {
    ...c,
    ppbp,
    barCount: barCountMap.get(c.ticker) ?? null,
    chg30d: chg30dMap.get(c.ticker) ?? null,
    entry: getEntry(ppbp, c.sepa, c.kell, c.breakout),
  };
});

// ─── Filter constants ─────────────────────────────────────────────────────────

const SIGNAL_OPTS = ['ทั้งหมด', 'Lekkung', 'O\'Neil', 'PPBP', 'SEPA', 'Kell', 'BO'] as const;
type SignalOpt = (typeof SIGNAL_OPTS)[number];

const ALL_STAGES = ['S.Bull', 'Bull', 'Accumulation', 'Recovery', 'Warning', 'Distribution', 'Bear'];

const PER_PAGE = 30;

// ─── Component ────────────────────────────────────────────────────────────────

function QuantScannerContent() {
  const searchParams = useSearchParams();
  const initSignal = (searchParams.get('signal') as SignalOpt) || 'ทั้งหมด';
  
  const [sigFilter, setSigFilter] = useState<SignalOpt>(initSignal);
  
  useEffect(() => {
    const s = searchParams.get('signal') as SignalOpt;
    if (s && SIGNAL_OPTS.includes(s)) {
      setSigFilter(s);
    } else if (!s) {
      setSigFilter('ทั้งหมด');
    }
  }, [searchParams]);
  const [stages, setStages] = useState<Set<string>>(new Set(ALL_STAGES));
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<'table' | 'scatter'>('table');
  const { priceMap, changePctMap, fetchDone } = useLivePrices(allRows.map(r => r.ticker));

  const allStagesSelected = stages.size === ALL_STAGES.length;

  const handleSort = (key: string) => {
    setSortConfig(prev => prev?.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' });
  };

  const rows = useMemo(() => {
    let filtered = allRows;

    if (sigFilter !== 'ทั้งหมด') {
      filtered = filtered.filter(r => {
        if (sigFilter === 'Lekkung') return r.lekkung;
        if (sigFilter === 'O\'Neil') return r.oneil;
        if (sigFilter === 'PPBP') return r.ppbp;
        if (sigFilter === 'SEPA') return r.sepa;
        if (sigFilter === 'Kell') return r.kell;
        if (sigFilter === 'BO') return r.breakout;
        return true;
      });
    }

    if (!allStagesSelected) {
      filtered = filtered.filter(r => r.stage !== null && stages.has(r.stage));
    }

    return [...filtered].sort((a, b) => {
      if (sortConfig) {
        if (sortConfig.key === 'price') {
          const aPrice = priceMap[a.ticker] ?? a.price;
          const bPrice = priceMap[b.ticker] ?? b.price;
          return sortConfig.dir === 'asc' ? aPrice - bPrice : bPrice - aPrice;
        }
        if (sortConfig.key === 'chg1d') {
          const aChg = changePctMap[a.ticker] ?? -999;
          const bChg = changePctMap[b.ticker] ?? -999;
          return sortConfig.dir === 'asc' ? aChg - bChg : bChg - aChg;
        }
        if (sortConfig.key === 'dist52wh') {
          const aPrice = priceMap[a.ticker] ?? a.price;
          const bPrice = priceMap[b.ticker] ?? b.price;
          const aDist = pctFromHigh(aPrice, w52Map.get(a.ticker)?.high) ?? -999;
          const bDist = pctFromHigh(bPrice, w52Map.get(b.ticker)?.high) ?? -999;
          return sortConfig.dir === 'asc' ? aDist - bDist : bDist - aDist;
        }
        if (sortConfig.key === 'stage') {
           const aStage = a.stage ? ALL_STAGES.indexOf(a.stage) : 99;
           const bStage = b.stage ? ALL_STAGES.indexOf(b.stage) : 99;
           return sortConfig.dir === 'asc' ? aStage - bStage : bStage - aStage;
        }
        const aVal = (a as any)[sortConfig.key];
        const bVal = (b as any)[sortConfig.key];
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return sortConfig.dir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }
        return sortConfig.dir === 'asc' ? (aVal || 0) - (bVal || 0) : (bVal || 0) - (aVal || 0);
      }
      
      const ed = ENTRY_ORDER[a.entry] - ENTRY_ORDER[b.entry];
      if (ed !== 0) return ed;
      if (b.combo_score !== a.combo_score) return b.combo_score - a.combo_score;
      return (b.rs_score ?? 0) - (a.rs_score ?? 0);
    });
  }, [sigFilter, stages, allStagesSelected, sortConfig, priceMap, changePctMap]);

  // Reset to first page whenever the filter/sort result set changes
  useEffect(() => { setPage(1); }, [sigFilter, stages, sortConfig]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  const { isMobile, visibleRows, visibleCount, totalCount, sentinelRef } = useInfiniteRows(
    rows,
    [sigFilter, stages, sortConfig],
    'scanner'
  );
  const displayRows = isMobile ? visibleRows : pageRows;

  // scatter mode ใช้ rows ทั้งหมดที่ผ่าน filter ปัจจุบัน (ไม่ตัดหน้าเหมือนตาราง)
  const scatterPoints: ScatterPoint[] = useMemo(() => {
    return rows
      .map(r => {
        const price = priceMap[r.ticker] ?? r.price;
        const high = w52Map.get(r.ticker)?.high;
        const dist = pctFromHigh(price, high);
        if (dist == null || r.rs_score == null) return null;
        return {
          ticker: r.ticker,
          rs: r.rs_score,
          distFromHigh: Math.abs(dist),
          growthYoy: r.growth_yoy,
          growthQoq: r.growth_qoq,
        };
      })
      .filter((p): p is ScatterPoint => p !== null);
  }, [rows, priceMap]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader
          title="Quant Scanner"
          subtitle="SEPA · Oliver Kell · Breakout · Pocket Pivot"
          count={rows.length}
          total={allRows.length}
          updatedAt={formatThaiDate(scanGeneratedAt)}
        />
        <ExportCSVButton data={rows} filename="quant_scanner.csv" />
      </div>
      <StaleDataBanner generatedAt={scanGeneratedAt} />

      {/* Mobile filter toggle */}
      <button
        className="md:hidden flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/[0.05] border border-white/[0.07] text-label text-white/60 hover:text-white/80 transition-colors min-h-[44px]"
        onClick={() => setFilterOpen(f => !f)}
      >
        <span>Filter ⚙️</span>
        <span className="ml-auto text-white/30">{filterOpen ? '▲' : '▼'}</span>
      </button>

      <div className={`${filterOpen ? 'block' : 'hidden'} md:block`}>
      <FilterBar>
        <span className="text-[10px] text-white/20 uppercase tracking-wider">Signal</span>
        {SIGNAL_OPTS.map(s => (
          <button
            key={s}
            onClick={() => setSigFilter(s)}
            className={`px-2.5 py-1 rounded text-[10px] font-semibold transition-all ${
              sigFilter === s
                ? s === 'PPBP'
                  ? 'bg-[#7F77DD] text-white'
                  : 'bg-[#1D9E75] text-white'
                : 'bg-white/[0.04] text-white/30 hover:text-white/60'
            }`}
          >
            {s === 'PPBP' ? 'PPBP 🔥' : s}
          </button>
        ))}
        <Divider />
        <span className="text-[10px] text-white/20 uppercase tracking-wider">Stage</span>
        {ALL_STAGES.map(s => (
          <button
            key={s}
            onClick={() => {
              const next = new Set(stages);
              if (next.has(s)) next.delete(s);
              else next.add(s);
              setStages(next);
            }}
            className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${
              stages.has(s) ? stageCls(s) : 'bg-white/[0.04] text-white/20 hover:text-white/40'
            }`}
          >
            {s}
          </button>
        ))}
        {(sigFilter !== 'ทั้งหมด' || !allStagesSelected) && (
          <button
            onClick={() => { setSigFilter('ทั้งหมด'); setStages(new Set(ALL_STAGES)); }}
            className="ml-auto text-label text-white/25 hover:text-white/60 transition-colors"
          >
            Reset
          </button>
        )}
      </FilterBar>
      </div>

      <div className="flex justify-end">
        <div className="inline-flex rounded-lg border border-white/[0.07] overflow-hidden">
          <button
            onClick={() => setViewMode('table')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-label font-semibold transition-colors ${
              viewMode === 'table' ? 'bg-white/10 text-white' : 'text-white/35 hover:text-white/60'
            }`}
          >
            <LayoutGrid size={12} /> ตาราง
          </button>
          <button
            onClick={() => setViewMode('scatter')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-label font-semibold transition-colors border-l border-white/[0.07] ${
              viewMode === 'scatter' ? 'bg-white/10 text-white' : 'text-white/35 hover:text-white/60'
            }`}
          >
            <ScatterIcon size={12} /> Scatter
          </button>
        </div>
      </div>

      {viewMode === 'scatter' && (
        <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-4">
          <GrowthScatter points={scatterPoints} />
        </div>
      )}

      {viewMode === 'table' && (
      <>
      <MobileScanProgress shown={visibleCount} total={totalCount} />
      <TableWrap>
        <thead className="border-b border-white/[0.06] bg-white/[0.015]">
          <tr>
            <Th>#</Th>
            <SortableTh sortKey="ticker" currentSort={sortConfig} onSort={handleSort}>Symbol</SortableTh>
            <SortableTh sortKey="stage" currentSort={sortConfig} onSort={handleSort}>Stage</SortableTh>
            <Th>Signals</Th>
            <SortableTh right className="hidden md:table-cell" sortKey="price" currentSort={sortConfig} onSort={handleSort}>Price</SortableTh>
            <SortableTh right className="hidden md:table-cell" sortKey="chg1d" currentSort={sortConfig} onSort={handleSort}>1D%</SortableTh>
            <SortableTh right className="hidden md:table-cell" sortKey="chg30d" currentSort={sortConfig} onSort={handleSort}>30D%</SortableTh>
            <Th right className="hidden md:table-cell">52W H/L</Th>
            <SortableTh right sortKey="dist52wh" currentSort={sortConfig} onSort={handleSort}>52WH</SortableTh>
            <SortableTh right sortKey="rs_score" currentSort={sortConfig} onSort={handleSort}>RS</SortableTh>
            <SortableTh sortKey="entry" currentSort={sortConfig} onSort={handleSort}>จุดเข้า</SortableTh>
            <Th className="hidden lg:table-cell min-w-[90px]">Trend</Th>
          </tr>
        </thead>
        <tbody>
          {displayRows.map((row, i) => {
            const rank = isMobile ? i + 1 : (safePage - 1) * PER_PAGE + i + 1;
            const livePrice = priceMap[row.ticker];
            const changePct = changePctMap[row.ticker];
            const displayPrice = livePrice ?? row.price;
            const isStale = fetchDone && livePrice == null;

            return (
              <tr
                key={row.ticker}
                className="border-b border-white/[0.04] hover:bg-white/[0.025] transition-colors"
              >
                <Td>
                  <span className="text-white/20 tabular-nums">{rank}</span>
                </Td>

                <Td>
                  <div className="flex items-center gap-1.5">
                    <Link
                      href={`/stock/${row.ticker}`}
                      className="font-bold text-white hover:text-[#1D9E75] transition-colors"
                    >
                      {row.ticker}
                    </Link>
                    <AddMyStockButton ticker={row.ticker} />
                    {(() => {
                      const dist = pctFromHigh(displayPrice, w52Map.get(row.ticker)?.high);
                      if (dist == null || Math.abs(dist) > 0.5) return null;
                      return (
                        <span className="inline-flex items-center px-1 py-0.5 rounded text-[9px] font-bold bg-[#1D9E75] text-white align-middle">
                          NH
                        </span>
                      );
                    })()}
                  </div>
                  <SectorChip ticker={row.ticker} />
                </Td>

                <Td>
                  <div className="flex flex-col gap-0.5">
                    {row.stage ? (
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold w-fit ${stageCls(row.stage)}`}
                      >
                        {row.stage}
                      </span>
                    ) : (
                      <span className="text-white/20 text-label">—</span>
                    )}
                    {row.barCount != null && (
                      <span className="text-[10px] text-white/25 tabular-nums">{row.barCount}d</span>
                    )}
                  </div>
                </Td>

                <Td>
                  <div className="flex flex-wrap gap-1">
                    {row.ppbp && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#7F77DD] text-white">
                        PPBP 🔥
                      </span>
                    )}
                    {row.lekkung && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#FF9800] text-white">
                        Lekkung
                      </span>
                    )}
                    {row.oneil && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#E91E63] text-white">
                        CAN SLIM
                      </span>
                    )}
                    {row.sepa && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#EAF3DE] text-[#27500A]">
                        SEPA
                      </span>
                    )}
                    {row.kell && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#E6F1FB] text-[#0C447C]">
                        Kell
                      </span>
                    )}
                    {row.breakout && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#FAEEDA] text-[#633806]">
                        BO
                      </span>
                    )}
                    {!row.ppbp && !row.lekkung && !row.oneil && !row.sepa && !row.kell && !row.breakout && (
                      <span className="text-white/15 text-label">—</span>
                    )}
                  </div>
                </Td>

                <Td right mono className="hidden md:table-cell">
                  <span className={isStale ? 'text-white/40' : 'text-white'}>
                    {displayPrice.toFixed(2)}
                  </span>
                </Td>

                <Td right mono className="hidden md:table-cell">
                  {fetchDone ? (
                    <ChangeBadge value={changePct} />
                  ) : (
                    <span className="text-white/25">—</span>
                  )}
                </Td>

                <Td right mono className="hidden md:table-cell">
                  {row.chg30d != null ? (
                    <span className={row.chg30d >= 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}>
                      {row.chg30d >= 0 ? '+' : ''}
                      {row.chg30d.toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-white/25">—</span>
                  )}
                </Td>

                <Td right mono className="hidden md:table-cell">
                  {w52Map.get(row.ticker) ? (
                    <div className="flex flex-col items-end leading-tight text-label">
                      <span className="text-[#E24B4A]">{w52Map.get(row.ticker)!.high.toFixed(2)}</span>
                      <span className="text-[#1D9E75]">{w52Map.get(row.ticker)!.low.toFixed(2)}</span>
                    </div>
                  ) : (
                    <span className="text-white/25">—</span>
                  )}
                </Td>

                <Td right mono>
                  {(() => {
                    const dist = pctFromHigh(displayPrice, w52Map.get(row.ticker)?.high);
                    if (dist == null) return <span className="text-white/25">—</span>;
                    return (
                      <span className={`font-semibold ${dist52whCls(dist)}`}>
                        {dist > 0 ? '+' : ''}
                        {dist.toFixed(1)}%
                      </span>
                    );
                  })()}
                </Td>

                <Td right mono>
                  {row.rs_score != null ? (
                    <span
                      className="font-bold text-[14px]"
                      style={{ color: rsColor(row.rs_score) }}
                    >
                      {row.rs_score}
                    </span>
                  ) : (
                    <span className="text-white/25">—</span>
                  )}
                </Td>

                <Td>
                  {row.entry === 'ppbp' && (
                    <span className="text-label font-semibold text-[#7F77DD]">⚡ เข้าได้เลย</span>
                  )}
                  {row.entry === 'pullback' && (
                    <span className="text-label text-white/50">⏳ รอ pullback</span>
                  )}
                  {row.entry === 'breakout' && (
                    <span className="text-label text-white/50">⏳ รอ breakout</span>
                  )}
                  {row.entry === 'none' && (
                    <span className="text-white/15 text-label">—</span>
                  )}
                </Td>

                <Td className="hidden lg:table-cell min-w-[90px]">
                  <TrendSparkline data={sparklineMap[row.ticker]} width={72} height={20} />
                </Td>
              </tr>
            );
          })}

          {isMobile && visibleCount < totalCount && (
            <tr ref={sentinelRef}>
              <td colSpan={12} className="py-3 text-center text-[11px] text-white/25">
                กำลังโหลดเพิ่ม…
              </td>
            </tr>
          )}

          {rows.length === 0 && (
            <tr>
              <td colSpan={12} className="py-12 text-center text-[13px] text-white/25">
                ไม่พบหุ้นที่ตรงกับ filter
              </td>
            </tr>
          )}
        </tbody>
      </TableWrap>
      </>
      )}

      {viewMode === 'table' && totalPages > 1 && (
        <div className="hidden md:block">
          <Pagination page={safePage} totalPages={totalPages} onChange={setPage} />
        </div>
      )}
      <ScrollToTopButton />
    </div>
  );
}

function ScannerSkeleton() {
  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="h-6 w-40 rounded bg-white/[0.06] animate-pulse" />
      <div className="h-9 w-full rounded-xl bg-white/[0.04] animate-pulse" />
      <div className="bg-[#13161e] border border-white/[0.07] rounded-xl overflow-hidden">
        <TableSkeleton rows={10} />
      </div>
    </div>
  );
}

export default function QuantScannerPage() {
  return (
    <Suspense fallback={<ScannerSkeleton />}>
      <QuantScannerContent />
    </Suspense>
  );
}
