'use client';

import { useState, useMemo, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { stageData, weinsteinData } from '@/lib/strategyData';
import { getScanGeneratedAt, hasScanKey } from '@/lib/scanGeneratedAt';
import StaleDataBanner from '@/components/StaleDataBanner';
import { formatThaiDate } from '@/lib/utils';
import { useLivePrices } from '@/lib/useLivePrices';
import { useInfiniteRows } from '@/lib/useInfiniteRows';
import MobileScanProgress from '@/components/MobileScanProgress';
import ScrollToTopButton from '@/components/ScrollToTopButton';
import {
  stageCls, SectorChip, Th, Td, TableWrap, FilterBar, PageHeader, LivePriceCell, SortableTh, SortConfig,
  ExportCSVButton, AddMyStockButton,
} from '@/components/StrategyTable';
import StageSelect, { STAGE_ALL } from '@/components/StageSelect';
import Pagination from '@/components/Pagination';
import StockChart from '@/components/StockChart';
import ScanHistoryView from '@/components/ScanHistoryView';
import ModeToggle from '@/components/ModeToggle';
import TrendSparkline from '@/components/TrendSparkline';
import { sparklineMap } from '@/lib/sparklineData';
import ScanDiffChips, { DiffFilter } from '@/components/ScanDiffChips';
import DroppedTickersList from '@/components/DroppedTickersList';
import NewBadge from '@/components/NewBadge';
import { getScanDiff } from '@/lib/scanDiff';
import ReportCardBar from '@/components/ReportCardBar';
import AssetTypeToggle from '@/components/AssetTypeToggle';
import { parseAssetType, matchesAssetType, countByAssetType, DEFAULT_ASSET_TYPE, type AssetType } from '@/lib/fundFilter';
import React from 'react';

const ALL_STAGES = ['S.Bull', 'Bull', 'Accumulation', 'Recovery', 'Warning', 'Distribution', 'Bear', 'UNKNOWN'];

const STAGE_ORDER: Record<string, number> = {
  'S.Bull': 0,
  'Bull': 1,
  'Accumulation': 2,
  'Recovery': 3,
  'Warning': 4,
  'Bear': 5,
  'Distribution': 6,
  'UNKNOWN': 7,
};

const PAGE_SIZE = 20;
const SORT_KEYS = ['Ticker', 'Price', 'Stage', 'Bar_Count', 'EMA50', 'EMA200', '52W_FromHigh', 'ADTV(MB)'];

// 52W H/L comes from the same weinstein.json the /stage-analysis page reads
// (engine: rolling 252-day max High / min Low). A 0.0 there is the engine's
// fallback for "no value", so it's treated as missing just like null.
const WEEK52_SORT_KEY = '52W_FromHigh';
const week52Map = new Map<string, { high: number; low: number }>();
for (const w of weinsteinData) {
  const high = w['52W_High'];
  const low = w['52W_Low'];
  if (high != null && high > 0 && low != null && low > 0) week52Map.set(w.Ticker, { high, low });
}
const pctFromHigh = (ticker: string, price: number): number | null => {
  const w = week52Map.get(ticker);
  return w && price > 0 ? ((price - w.high) / w.high) * 100 : null;
};

export default function MarketStagePage() {
  return (
    <Suspense fallback={null}>
      <MarketStageContent />
    </Suspense>
  );
}

// Same layout/colors as the 52w H/L cell on /stage-analysis: High (red) over Low (green).
function Week52Cell({ ticker, price }: { ticker: string; price: number }) {
  const w = week52Map.get(ticker);
  if (!w) return <span className="text-white/40">—</span>;
  const pct = pctFromHigh(ticker, price);
  return (
    <div
      className="flex flex-col items-end leading-tight text-label"
      title={pct != null ? `ห่างจาก 52W High ${pct.toFixed(1)}%` : undefined}
    >
      <span className="text-[#E24B4A]">{w.high.toFixed(2)}</span>
      <span className="text-[#1D9E75]">{w.low.toFixed(2)}</span>
    </div>
  );
}

function MarketStageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawStage = searchParams.get('stage');
  const stage = rawStage && ALL_STAGES.includes(rawStage) ? rawStage : STAGE_ALL;
  const requestedPage = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
  // ?type=stock|fund|all - default stock (กองทุน/REIT ซ่อน) is dropped from the URL like the other defaults.
  const assetType = parseAssetType(searchParams.get('type'));
  // ?sort=<column>&dir=asc|desc - anything invalid/missing = default sort.
  const rawSort = searchParams.get('sort');
  const rawDir = searchParams.get('dir');
  const sortKey = rawSort && SORT_KEYS.includes(rawSort) && (rawDir === 'asc' || rawDir === 'desc') ? rawSort : null;
  const sortDir = rawDir === 'asc' ? 'asc' : 'desc';
  // Memoized on the strings so it stays referentially stable for useInfiniteRows' resetDeps.
  const sortConfig = useMemo<SortConfig>(() => (sortKey ? { key: sortKey, dir: sortDir } : null), [sortKey, sortDir]);

  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [mode, setMode] = useState<'today' | 'history'>('today');
  const [diffFilter, setDiffFilter] = useState<DiffFilter>('all');
  const { priceMap, fetchDone } = useLivePrices(stageData.map(s => s.Ticker));
  const newSet = useMemo(() => new Set(getScanDiff('market-stage')?.newTickers ?? []), []);
  const tableTopRef = useRef<HTMLDivElement>(null);

  // stage + page live in the URL (?stage=&page=) so a refresh / shared link
  // lands on the same view; defaults are dropped to keep the URL clean.
  function setParams(next: { stage?: string; page?: number; sort?: SortConfig; type?: AssetType }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.sort !== undefined) {
      if (next.sort) {
        params.set('sort', next.sort.key);
        params.set('dir', next.sort.dir);
      } else {
        params.delete('sort');
        params.delete('dir');
      }
    }
    if (next.stage !== undefined) {
      if (next.stage === STAGE_ALL) params.delete('stage');
      else params.set('stage', next.stage);
    }
    if (next.type !== undefined) {
      if (next.type === DEFAULT_ASSET_TYPE) params.delete('type');
      else params.set('type', next.type);
    }
    if (next.page !== undefined) {
      if (next.page <= 1) params.delete('page');
      else params.set('page', String(next.page));
    }
    const qs = params.toString();
    router.replace(qs ? `/market-stage?${qs}` : '/market-stage', { scroll: false });
  }

  // Any change to what's listed or its order goes back to page 1.
  const handleSort = (key: string) => {
    const prev = sortConfig;
    const next: SortConfig = prev?.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' };
    setParams({ sort: next, page: 1 });
  };
  const handleDiffFilter = (f: DiffFilter) => {
    setDiffFilter(f);
    setParams({ page: 1 });
  };
  const handleStage = (s: string) => setParams({ stage: s, page: 1 });
  const handleAssetType = (t: AssetType) => setParams({ type: t, page: 1 });

  // Per-stage counts for the dropdown - taken after the new/dropped filter so
  // each count matches the row total that choosing it would show.
  const diffRows = useMemo(
    () => stageData.filter(s => diffFilter !== 'new' || newSet.has(s.Ticker)),
    [diffFilter, newSet]
  );
  // หุ้น / กองทุน & REIT / ทั้งหมด: counts after the new/dropped + stage filters;
  // stage counts after new/dropped + type, so both dropdowns match what they'd show.
  const typeRows = useMemo(() => diffRows.filter(s => matchesAssetType(s.Ticker, assetType)), [diffRows, assetType]);
  const typeCounts = useMemo(
    () => countByAssetType(diffRows.filter(s => stage === STAGE_ALL || s.Stage === stage).map(s => s.Ticker)),
    [diffRows, stage]
  );
  const stageCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of typeRows) c[s.Stage] = (c[s.Stage] ?? 0) + 1;
    return c;
  }, [typeRows]);

  const filtered = useMemo(() => {
    let result = typeRows.filter(s => stage === STAGE_ALL || s.Stage === stage);
    if (sortConfig?.key === WEEK52_SORT_KEY) {
      // % from 52W High - tickers without 52W data stay last in both directions.
      result = result.sort((a, b) => {
        const aVal = pctFromHigh(a.Ticker, a.Price);
        const bVal = pctFromHigh(b.Ticker, b.Price);
        if (aVal == null && bVal == null) return 0;
        if (aVal == null) return 1;
        if (bVal == null) return -1;
        return sortConfig.dir === 'asc' ? aVal - bVal : bVal - aVal;
      });
    } else if (sortConfig) {
      result = result.sort((a, b) => {
        const aVal = (a as any)[sortConfig.key] || 0;
        const bVal = (b as any)[sortConfig.key] || 0;
        if (sortConfig.key === 'Stage') {
          const soA = STAGE_ORDER[a.Stage] ?? 99;
          const soB = STAGE_ORDER[b.Stage] ?? 99;
          return sortConfig.dir === 'asc' ? soA - soB : soB - soA;
        }
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return sortConfig.dir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }
        return sortConfig.dir === 'asc' ? (aVal || 0) - (bVal || 0) : (bVal || 0) - (aVal || 0);
      });
    } else {
      result = result.sort((a, b) => {
        const so = (STAGE_ORDER[a.Stage] ?? 99) - (STAGE_ORDER[b.Stage] ?? 99);
        if (so !== 0) return so;
        return b.Bar_Count - a.Bar_Count;
      });
    }
    return result;
  }, [typeRows, stage, sortConfig]);

  // Desktop: pages of 20 over the full filtered+sorted list (an out-of-range
  // ?page= shows the last page). Mobile keeps its infinite-scroll batches.
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const pageStart = (page - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  useEffect(() => {
    if (requestedPage !== page) setParams({ page });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedPage, page]);

  const goToPage = (p: number) => {
    setParams({ page: p });
    tableTopRef.current?.scrollIntoView({ block: 'start' });
  };

  const { isMobile, visibleRows, visibleCount, totalCount, sentinelRef } = useInfiniteRows(
    filtered,
    [stage, sortConfig, diffFilter, newSet, assetType]
  );
  const displayRows = isMobile ? visibleRows : pageRows;
  const rowOffset = isMobile ? 0 : pageStart;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader
          title="Market Stage"
          subtitle="Wyckoff/Weinstein Stage Analysis"
          count={filtered.length}
          updatedAt={formatThaiDate(getScanGeneratedAt('market_stage'))}
          total={stageData.length}
        />
        <div className="flex items-center gap-3">
          <ExportCSVButton data={filtered} filename="market_stage.csv" />
          <ModeToggle mode={mode} onChange={setMode} />
        </div>
      </div>
      <StaleDataBanner generatedAt={getScanGeneratedAt('market_stage')} missing={!hasScanKey('market_stage')} />
      <ReportCardBar scanKey="market-stage" />

      {mode === 'history' ? (
        <ScanHistoryView scanName="market-stage" />
      ) : (
      <>
      <FilterBar>
        <AssetTypeToggle value={assetType} counts={typeCounts} onChange={handleAssetType} />
        <span className="text-[10px] text-white/20 uppercase tracking-wider flex-shrink-0">Stage</span>
        <StageSelect
          stages={ALL_STAGES}
          counts={stageCounts}
          totalCount={typeRows.length}
          value={stage}
          onChange={handleStage}
        />
        {stage !== STAGE_ALL && (
          <button
            onClick={() => handleStage(STAGE_ALL)}
            className="text-label text-white/25 hover:text-white/60 transition-colors"
          >
            ล้างทั้งหมด
          </button>
        )}
        <div className="ml-auto">
          <ScanDiffChips scanName="market-stage" filter={diffFilter} onChange={handleDiffFilter} />
        </div>
      </FilterBar>

      {diffFilter === 'dropped' ? (
        <DroppedTickersList scanName="market-stage" />
      ) : (
      <>
      <MobileScanProgress shown={visibleCount} total={totalCount} />
      <div ref={tableTopRef} className="scroll-mt-4" />
      <TableWrap>
        <thead className="border-b border-white/[0.06] bg-white/[0.015]">
          {/* responsive: # รวมเข้า Symbol (sticky) · EMA50/EMA200 ซ่อน ≤1200 (ครอบ iPad Air)
              เก็บ Stage + Days In Stage ที่เป็นหัวใจของหน้านี้ · strip ใน expand */}
          <tr>
            <SortableTh sortKey="Ticker" currentSort={sortConfig} onSort={handleSort}>Symbol</SortableTh>
            <SortableTh right sortKey="Price" currentSort={sortConfig} onSort={handleSort}>Price</SortableTh>
            <Th right>Trend</Th>
            <SortableTh sortKey="Stage" currentSort={sortConfig} onSort={handleSort}>Stage</SortableTh>
            <SortableTh right sortKey="Bar_Count" currentSort={sortConfig} onSort={handleSort}>Days In Stage</SortableTh>
            <SortableTh right className="hidden min-[1201px]:table-cell" sortKey="EMA50" currentSort={sortConfig} onSort={handleSort}>EMA50</SortableTh>
            <SortableTh right className="hidden min-[1201px]:table-cell" sortKey="EMA200" currentSort={sortConfig} onSort={handleSort}>EMA200</SortableTh>
            <SortableTh right className="hidden min-[1201px]:table-cell" sortKey={WEEK52_SORT_KEY} currentSort={sortConfig} onSort={handleSort}>52w H/L</SortableTh>
            <SortableTh right sortKey="ADTV(MB)" currentSort={sortConfig} onSort={handleSort}>ADTV (MB)</SortableTh>
          </tr>
        </thead>
        <tbody>
          {displayRows.map((s, i) => (
            <React.Fragment key={s.Ticker}>
            <tr
              onClick={() => setSelectedTicker(selectedTicker === s.Ticker ? null : s.Ticker)}
              className={`border-b border-white/[0.04] transition-colors cursor-pointer ${
                selectedTicker === s.Ticker ? 'bg-white/[0.08]' : 'hover:bg-white/[0.025]'
              }`}
            >
              <Td>
                <div className="flex items-center gap-2 font-bold text-white">
                  <span className="text-white/25 tabular-nums text-[11px] font-normal shrink-0">{rowOffset + i + 1}</span>
                  {s.Ticker}
                  <AddMyStockButton ticker={s.Ticker} />
                  {newSet.has(s.Ticker) && <NewBadge />}
                </div>
                <SectorChip ticker={s.Ticker} />
              </Td>
              <Td right mono>
                <LivePriceCell jsonPrice={s.Price} livePrice={priceMap[s.Ticker]} fetchDone={fetchDone} />
              </Td>
              <Td right>
                <div className="flex justify-end"><TrendSparkline data={sparklineMap[s.Ticker]} /></div>
              </Td>
              <Td>
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${stageCls(s.Stage)}`}>
                  {s.Stage}
                </span>
              </Td>
              <Td right mono>
                <span className="text-white/60">{s.Bar_Count != null ? s.Bar_Count : '-'} วัน</span>
              </Td>
              <Td right mono className="hidden min-[1201px]:table-cell">
                <span className={s.Price > (s.EMA50 || 0) ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}>
                  {s.EMA50 != null ? s.EMA50.toFixed(2) : '-'}
                </span>
              </Td>
              <Td right mono className="hidden min-[1201px]:table-cell">
                <span className={s.Price > (s.EMA200 || 0) ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}>
                  {s.EMA200 != null ? s.EMA200.toFixed(2) : '-'}
                </span>
              </Td>
              <Td right mono className="hidden min-[1201px]:table-cell">
                <Week52Cell ticker={s.Ticker} price={s.Price} />
              </Td>
              <Td right mono>{s['ADTV(MB)'] != null ? s['ADTV(MB)'].toFixed(0) : '-'}</Td>
            </tr>
            {selectedTicker === s.Ticker && (
              <tr key={`${s.Ticker}-chart`} className="bg-black/20 border-b border-white/[0.04]">
                <td colSpan={9} className="p-4">
                  <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-4 shadow-lg relative">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-baseline gap-2">
                        <h2 className="text-[16px] font-bold text-white tracking-wide">{s.Ticker}</h2>
                        <span className="text-label text-white/40">EMA10 / EMA50 / EMA200</span>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedTicker(null); }}
                        className="text-label text-white/40 hover:text-white px-2 py-1 rounded bg-white/5 hover:bg-white/10 transition-colors"
                      >
                        ปิดกราฟ
                      </button>
                    </div>
                    {/* คอลัมน์รองที่ซ่อน ≤1200 (iPad Air) — โชว์ตรงนี้แทน */}
                    <div className="min-[1201px]:hidden flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] border-b border-white/[0.06] pb-3 mb-3">
                      <span className="text-white/40">EMA50: <span className={`tabular-nums font-semibold ${s.EMA50 != null && s.Price > s.EMA50 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>{s.EMA50 != null ? s.EMA50.toFixed(2) : '-'}</span></span>
                      <span className="text-white/40">EMA200: <span className={`tabular-nums font-semibold ${s.EMA200 != null && s.Price > s.EMA200 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>{s.EMA200 != null ? s.EMA200.toFixed(2) : '-'}</span></span>
                      <span className="text-white/40">52w H/L: <span className="tabular-nums font-semibold">{week52Map.has(s.Ticker) ? <><span className="text-[#E24B4A]">{week52Map.get(s.Ticker)!.high.toFixed(2)}</span> / <span className="text-[#1D9E75]">{week52Map.get(s.Ticker)!.low.toFixed(2)}</span></> : <span className="text-white/40">—</span>}</span></span>
                    </div>
                    <StockChart ticker={s.Ticker} height={350} showEma10={true} stageMarker={true} defaultTimeframe="1Y" />
                    <p className="text-[10px] text-white/25 mt-2 leading-relaxed">
                      📍 หมุดสีชมพู = วันแรกที่ status เปลี่ยนมาเป็น {s.Stage} (คำนวณจากราคาย้อนหลังทีละแท่ง)
                      {s.Stage === 'Bull' && (
                        <> · หมายเหตุ: ตัวเลข {s.Bar_Count} วันในตารางนับรวมช่วง S.Bull ก่อนหน้าด้วย หมุดจึงอาจไม่ตรงกัน</>
                      )}
                    </p>
                  </div>
                </td>
              </tr>
            )}
            </React.Fragment>
          ))}
          {isMobile && visibleCount < totalCount && (
            <tr ref={sentinelRef}>
              <td colSpan={9} className="py-3 text-center text-[11px] text-white/25">
                กำลังโหลดเพิ่ม…
              </td>
            </tr>
          )}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={9} className="py-12 text-center text-[13px] text-white/25">
                ไม่พบหุ้นที่ตรงกับ filter
              </td>
            </tr>
          )}
        </tbody>
      </TableWrap>
      {!isMobile && totalPages > 1 && (
        <div className="flex flex-col items-center gap-1">
          <Pagination page={page} totalPages={totalPages} onChange={goToPage} />
          <span className="text-[11px] text-white/35 tabular-nums">
            แสดง {pageStart + 1}–{pageStart + pageRows.length} จาก {filtered.length}
          </span>
        </div>
      )}
      </>
      )}
      </>
      )}
      <ScrollToTopButton />
    </div>
  );
}
