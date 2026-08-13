'use client';

import { useState, useMemo } from 'react';
import { breakoutData } from '@/lib/strategyData';
import { daysInScan } from '@/lib/scanDays';
import { getScanGeneratedAt } from '@/lib/scanGeneratedAt';
import StaleDataBanner from '@/components/StaleDataBanner';
import { formatThaiDate } from '@/lib/utils';
import { useLivePrices } from '@/lib/useLivePrices';
import { useInfiniteRows } from '@/lib/useInfiniteRows';
import MobileScanProgress from '@/components/MobileScanProgress';
import ScrollToTopButton from '@/components/ScrollToTopButton';
import {
  SectorChip, Th, Td, TableWrap, FilterBar, SliderField, Divider, PageHeader, LivePriceCell, SortableTh, SortConfig,
  ExportCSVButton, AddMyStockButton,
} from '@/components/StrategyTable';
import ScanHistoryView from '@/components/ScanHistoryView';
import ModeToggle from '@/components/ModeToggle';
import TrendSparkline from '@/components/TrendSparkline';
import { sparklineMap } from '@/lib/sparklineData';
import ScanDiffChips, { DiffFilter } from '@/components/ScanDiffChips';
import DroppedTickersList from '@/components/DroppedTickersList';
import NewBadge from '@/components/NewBadge';
import { getScanDiff } from '@/lib/scanDiff';
import { getScanHistory } from '@/lib/scanHistory';
import StockChart from '@/components/StockChart';
import ReportCardBar from '@/components/ReportCardBar';
import ReportCardButton from '@/components/ReportCardButton';

export default function BreakoutPage() {
  const [toBreakMax, setToBreakMax] = useState(10);
  const [boxWidthMax, setBoxWidthMax] = useState(20);
  const [adtvMin, setAdtvMin] = useState(0);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const [mode, setMode] = useState<'today' | 'history'>('today');
  const [diffFilter, setDiffFilter] = useState<DiffFilter>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 10;
  const { priceMap, fetchDone } = useLivePrices(breakoutData.map(s => s.Ticker));
  const newSet = useMemo(() => new Set(getScanDiff('breakout')?.newTickers ?? []), []);
  const breakoutHistory = useMemo(() => getScanHistory('breakout'), []);

  const handleSort = (key: string) => {
    setCurrentPage(1);
    setSortConfig(prev => prev?.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' });
  };

  const handleToBreakChange = (val: number) => {
    setCurrentPage(1);
    setToBreakMax(val);
  };

  const handleBoxWidthChange = (val: number) => {
    setCurrentPage(1);
    setBoxWidthMax(val);
  };

  const handleAdtvChange = (val: number) => {
    setCurrentPage(1);
    setAdtvMin(val);
  };

  const handleDiffFilterChange = (val: DiffFilter) => {
    setCurrentPage(1);
    setDiffFilter(val);
  };

  const filtered = useMemo(() => {
    let result = breakoutData
      .filter(s => s['To_Break'] <= toBreakMax)
      .filter(s => s['Box_Width'] <= boxWidthMax)
      .filter(s => adtvMin === 0 || (s['ADTV(MB)'] || 0) >= adtvMin)
      .filter(s => diffFilter !== 'new' || newSet.has(s.Ticker));

    if (sortConfig) {
      result = result.sort((a, b) => {
        if (sortConfig.key === '__days') {
          const aVal = daysInScan('breakout', a.Ticker) ?? -1;
          const bVal = daysInScan('breakout', b.Ticker) ?? -1;
          return sortConfig.dir === 'asc' ? aVal - bVal : bVal - aVal;
        }
        const aVal = (a as any)[sortConfig.key];
        const bVal = (b as any)[sortConfig.key];
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return sortConfig.dir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }
        return sortConfig.dir === 'asc' ? (aVal || 0) - (bVal || 0) : (bVal || 0) - (aVal || 0);
      });
    } else {
      result = result.sort((a, b) => a['To_Break'] - b['To_Break']);
    }
    return result;
  }, [toBreakMax, boxWidthMax, adtvMin, sortConfig, diffFilter, newSet]);

  const { isMobile, visibleRows, visibleCount, totalCount, sentinelRef } = useInfiniteRows(
    filtered,
    [toBreakMax, boxWidthMax, adtvMin, sortConfig, diffFilter, newSet]
  );

  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const safePage = Math.min(currentPage, totalPages);
  const displayRows = isMobile
    ? visibleRows
    : filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const activeTicker = selectedTicker ?? filtered[0]?.Ticker ?? null;
  const firstSeenDate = useMemo(() => {
    if (!activeTicker || !breakoutHistory) return null;
    const match = breakoutHistory.tickers.find(t => t.ticker === activeTicker);
    return match?.firstSeen ?? null;
  }, [activeTicker, breakoutHistory]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader
          title="Breakout Setup"
          subtitle="VDU / Box Pattern — ยิ่ง To_Break น้อย ยิ่งจ่อ break"
          count={filtered.length}
          updatedAt={formatThaiDate(getScanGeneratedAt('breakout'))}
          total={breakoutData.length}
        />
        <div className="flex items-center gap-3">
          <ReportCardButton scanKey="breakout" />
          <ExportCSVButton data={filtered} filename="breakout_setup.csv" />
          <ModeToggle mode={mode} onChange={setMode} />
        </div>
      </div>
      <StaleDataBanner generatedAt={getScanGeneratedAt('breakout')} />
      <ReportCardBar scanKey="breakout" />

      {mode === 'history' ? (
        <ScanHistoryView scanName="breakout" />
      ) : (
      <>
      <FilterBar>
        <SliderField
          label="To Break"
          min={-10}
          max={20}
          value={toBreakMax}
          onChange={handleToBreakChange}
          unit="%"
          dir="lte"
        />
        <Divider />
        <SliderField
          label="Box Width"
          min={3}
          max={30}
          value={boxWidthMax}
          onChange={handleBoxWidthChange}
          unit="%"
          dir="lte"
        />
        <Divider />
        <SliderField label="สภาพคล่องขั้นต่ำ ADTV (MB)" min={0} max={50} value={adtvMin} onChange={handleAdtvChange} step={5} />
        <span className="text-label text-white/25 ml-auto">
          ค่าติดลบ = broke แล้ว
        </span>
        <Divider />
        <ScanDiffChips scanName="breakout" filter={diffFilter} onChange={handleDiffFilterChange} />
      </FilterBar>

      {diffFilter === 'dropped' ? (
        <DroppedTickersList scanName="breakout" />
      ) : (
      <div className="space-y-4">
      {/* Top Chart Section */}
      {activeTicker && (
        <div className="bg-[#13161e] border border-emerald-500/30 rounded-xl p-4 shadow-xl space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap border-b border-white/[0.06] pb-3">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-[18px] font-extrabold text-white tracking-wide">{activeTicker}</h2>
              <span className="text-[11.5px] text-white/40">Technical Chart (Breakout Setup)</span>
              {firstSeenDate && (
                <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1">
                  <span>📍 เจอครั้งแรก:</span>
                  <span>{formatThaiDate(firstSeenDate)}</span>
                </span>
              )}
            </div>
            {selectedTicker && (
              <button
                onClick={() => setSelectedTicker(null)}
                className="text-[11px] font-medium text-white/50 hover:text-white px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
              >
                ย้อนกลับไปตัวแรก
              </button>
            )}
          </div>
          <StockChart
            ticker={activeTicker}
            height={340}
            showEma10={true}
            highlightDates={firstSeenDate ? [firstSeenDate] : undefined}
          />
        </div>
      )}

      <MobileScanProgress shown={visibleCount} total={totalCount} />
      <TableWrap>
        <thead className="border-b border-white/[0.06] bg-white/[0.015]">
          <tr>
            <Th>#</Th>
            <SortableTh sortKey="Ticker" currentSort={sortConfig} onSort={handleSort}>Symbol</SortableTh>
            <SortableTh right sortKey="Price" currentSort={sortConfig} onSort={handleSort}>Price</SortableTh>
            <Th right>Trend</Th>
            <SortableTh right sortKey="__days" currentSort={sortConfig} onSort={handleSort}>Days</SortableTh>
            <SortableTh right sortKey="Box_High(Break)" currentSort={sortConfig} onSort={handleSort}>Break Price</SortableTh>
            <SortableTh right sortKey="To_Break" currentSort={sortConfig} onSort={handleSort}>% To Break</SortableTh>
            <SortableTh right sortKey="Box_Width" currentSort={sortConfig} onSort={handleSort}>Box Width</SortableTh>
            <SortableTh right sortKey="ADTV(MB)" currentSort={sortConfig} onSort={handleSort}>ADTV (MB)</SortableTh>
            <Th right>SMA150 Chg</Th>
          </tr>
        </thead>
        <tbody>
          {displayRows.map((s, idx) => {
            const globalIndex = isMobile ? idx : (safePage - 1) * pageSize + idx;
            const toBrk = s['To_Break'];
            const broke = toBrk <= 0;
            const isActive = activeTicker === s.Ticker;
            return (
              <tr
                key={s.Ticker}
                onClick={() => setSelectedTicker(s.Ticker)}
                className={`border-b border-white/[0.04] transition-colors cursor-pointer ${
                  isActive ? 'bg-emerald-500/10 border-l-4 border-l-emerald-500 font-medium' : 'hover:bg-white/[0.025]'
                }`}
              >
                <Td><span className="text-white/20 tabular-nums">{globalIndex + 1}</span></Td>
                <Td>
                  <div className="flex items-center gap-1.5">
                    <span className={`font-bold ${isActive ? 'text-emerald-400' : 'text-white'}`}>{s.Ticker}</span>
                    <AddMyStockButton ticker={s.Ticker} />
                    {broke && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#EAF3DE] text-[#27500A] leading-none">
                        BROKE
                      </span>
                    )}
                    {newSet.has(s.Ticker) && <NewBadge />}
                    {isActive && <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300">กำลังดูอยู่</span>}
                  </div>
                  <SectorChip ticker={s.Ticker} />
                </Td>
                <Td right mono>
                  <LivePriceCell jsonPrice={s.Price} livePrice={priceMap[s.Ticker]} fetchDone={fetchDone} />
                </Td>
                <Td right>
                  <div className="flex justify-end"><TrendSparkline data={sparklineMap[s.Ticker]} /></div>
                </Td>
                <Td right mono>
                  <span className="text-white/60">{daysInScan('breakout', s.Ticker) ?? 1}</span>
                </Td>
                <Td right mono>
                  <span className="text-white/50">{s['Box_High(Break)'].toFixed(2)}</span>
                </Td>
                <Td right mono>
                  <span className={`font-semibold ${
                    broke ? 'text-[#1D9E75]' : toBrk <= 3 ? 'text-[#EF9F27]' : 'text-white/50'
                  }`}>
                    {toBrk >= 0 ? '+' : ''}{toBrk.toFixed(1)}%
                  </span>
                </Td>
                <Td right mono>
                  <span className={s['Box_Width'] <= 8 ? 'text-[#1D9E75]' : 'text-white/50'}>
                    {s['Box_Width'].toFixed(1)}%
                  </span>
                </Td>
                <Td right mono>{s['ADTV(MB)'].toFixed(0)}</Td>
                <Td right mono>
                  <span className="text-[#1D9E75]">+{s.SMA150_Chg.toFixed(2)}%</span>
                </Td>
              </tr>
            );
          })}
          {isMobile && visibleCount < totalCount && (
            <tr ref={sentinelRef}>
              <td colSpan={10} className="py-3 text-center text-[11px] text-white/25">
                กำลังโหลดเพิ่ม…
              </td>
            </tr>
          )}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={10} className="py-12 text-center text-[13px] text-white/25">
                ไม่พบหุ้นที่ตรงกับ filter
              </td>
            </tr>
          )}
        </tbody>
      </TableWrap>

      {/* Pagination Controls for Desktop */}
      {!isMobile && filtered.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#13161e] border border-white/[0.08] px-4 py-3 rounded-xl">
          <p className="text-[12px] text-white/40">
            แสดง <span className="font-semibold text-white">{(safePage - 1) * pageSize + 1}</span> -{' '}
            <span className="font-semibold text-white">{Math.min(safePage * pageSize, filtered.length)}</span> จากทั้งหมด{' '}
            <span className="font-semibold text-white">{filtered.length}</span> รายการ
          </p>

          {totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                disabled={safePage === 1}
                className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-white/[0.05] text-white hover:bg-white/[0.1] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                ‹ ก่อนหน้า
              </button>

              <div className="flex items-center gap-1 px-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button
                    key={p}
                    onClick={() => setCurrentPage(p)}
                    className={`w-7 h-7 rounded-lg text-[11px] font-bold transition-all ${
                      p === safePage
                        ? 'bg-emerald-500 text-black shadow-md'
                        : 'bg-white/[0.04] text-white/60 hover:bg-white/[0.09] hover:text-white'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                disabled={safePage >= totalPages}
                className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-white/[0.05] text-white hover:bg-white/[0.1] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                ถัดไป ›
              </button>
            </div>
          )}
        </div>
      )}
      </div>
      )}
      </>
      )}
      <ScrollToTopButton />
    </div>
  );
}
