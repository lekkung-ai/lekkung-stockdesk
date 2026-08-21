'use client';

import { useState, useMemo } from 'react';
import { lekkungData } from '@/lib/strategyData';
import { daysInScan } from '@/lib/scanDays';
import { getScanGeneratedAt } from '@/lib/scanGeneratedAt';
import { formatThaiDate } from '@/lib/utils';
import { useLivePrices } from '@/lib/useLivePrices';
import { useInfiniteRows } from '@/lib/useInfiniteRows';
import MobileScanProgress from '@/components/MobileScanProgress';
import ScrollToTopButton from '@/components/ScrollToTopButton';
import {
  SectorChip, Th, Td, TableWrap, FilterBar, PageHeader, LivePriceCell, SortableTh, SortConfig,
  formatPE, ExportCSVButton, AddMyStockButton,
} from '@/components/StrategyTable';
import StockChart from '@/components/StockChart';
import ScanHistoryView from '@/components/ScanHistoryView';
import ModeToggle from '@/components/ModeToggle';
import StaleDataBanner from '@/components/StaleDataBanner';
import IncompletePopover from '@/components/IncompletePopover';
import ScanDiffChips, { DiffFilter } from '@/components/ScanDiffChips';
import DroppedTickersList from '@/components/DroppedTickersList';
import NewBadge from '@/components/NewBadge';
import ReportCardBar from '@/components/ReportCardBar';
import ReportCardButton from '@/components/ReportCardButton';
import { getScanDiff } from '@/lib/scanDiff';
import { getScanHistory } from '@/lib/scanHistory';
import { computeScanMarkers } from '@/lib/scanMarkers';
import rawIncomplete from '@/data/scans/lekkung_incomplete.json';
import React from 'react';

const incompleteItems = Array.isArray(rawIncomplete) ? rawIncomplete : [];

export default function LekkungPage() {
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const [mode, setMode] = useState<'today' | 'history'>('today');
  const [historyInitialTicker, setHistoryInitialTicker] = useState<string | null>(null);
  const [diffFilter, setDiffFilter] = useState<DiffFilter>('all');
  const [chartCollapsed, setChartCollapsed] = useState(false);
  const { priceMap, fetchDone } = useLivePrices(lekkungData.map(s => s.Ticker));
  const newSet = useMemo(() => new Set(getScanDiff('lekkung')?.newTickers ?? []), []);

  const lekkungHistory = useMemo(() => getScanHistory('lekkung'), []);

  const goToHistory = (ticker: string) => {
    setHistoryInitialTicker(ticker);
    setMode('history');
  };

  const handleSort = (key: string) => {
    setSortConfig(prev => prev?.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' });
  };

  const filtered = useMemo(() => {
    let result = lekkungData
      .filter(s => diffFilter !== 'new' || newSet.has(s.Ticker));

    if (sortConfig) {
      result = result.sort((a, b) => {
        if (sortConfig.key === '__days') {
          const aVal = daysInScan('lekkung', a.Ticker) ?? -1;
          const bVal = daysInScan('lekkung', b.Ticker) ?? -1;
          return sortConfig.dir === 'asc' ? aVal - bVal : bVal - aVal;
        }
        if (sortConfig.key === '__ema10diff') {
          const aVal = (a.Close != null && a.EMA_10 != null) ? (a.Close - a.EMA_10) : -Infinity;
          const bVal = (b.Close != null && b.EMA_10 != null) ? (b.Close - b.EMA_10) : -Infinity;
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
      result = result.sort((a, b) => b.NetProfit_Growth_QoQY - a.NetProfit_Growth_QoQY);
    }
    return result;
  }, [sortConfig, diffFilter, newSet]);

  const { isMobile, visibleRows, visibleCount, totalCount, sentinelRef } = useInfiniteRows(
    filtered,
    [sortConfig, diffFilter, newSet]
  );
  const displayRows = isMobile ? visibleRows : filtered;
  // No chart until a row is clicked — the top chart used to default to the
  // first row, which read as "this stock matters most" when it only meant
  // "this one sorted first".
  const activeTicker = selectedTicker;
  const scanMarkers = useMemo(() => {
    if (!activeTicker || !lekkungHistory) return { firstSeen: null, reentries: [] };
    const match = lekkungHistory.tickers.find(t => t.ticker === activeTicker);
    return computeScanMarkers(match?.hitDates);
  }, [activeTicker, lekkungHistory]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader
          title="Lekkung Growth"
          subtitle="Growth Stocks Focus Strategy"
          count={filtered.length}
          updatedAt={formatThaiDate(getScanGeneratedAt('lekkung'))}
          total={lekkungData.length}
        />
        <div className="flex items-center gap-3">
          <ReportCardButton scanKey="lekkung_growth" />
          <ExportCSVButton data={filtered} filename="lekkung_growth.csv" />
          <IncompletePopover items={incompleteItems} />
          <ModeToggle mode={mode} onChange={setMode} />
        </div>
      </div>

      <StaleDataBanner generatedAt={getScanGeneratedAt('lekkung')} />
      <ReportCardBar scanKey="lekkung_growth" />

      {mode === 'history' ? (
        <ScanHistoryView scanName="lekkung" initialTicker={historyInitialTicker} />
      ) : (
      <>
      <FilterBar>
        <ScanDiffChips scanName="lekkung" filter={diffFilter} onChange={setDiffFilter} />
      </FilterBar>

      {diffFilter === 'dropped' ? (
        <DroppedTickersList scanName="lekkung" />
      ) : (
      <div className="space-y-4">
      {/* Top Chart Section (Single chart at top, updates on row click) */}
      {activeTicker ? (
        <div className="bg-[#13161e] border border-emerald-500/30 rounded-xl p-4 shadow-xl space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap border-b border-white/[0.06] pb-3">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-[18px] font-extrabold text-white tracking-wide">{activeTicker}</h2>
              <span className="text-[11.5px] text-white/40">Technical Chart (Lekkung Strategy)</span>
              {scanMarkers.firstSeen && (
                <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1">
                  <span>📍 เจอครั้งแรก:</span>
                  <span>{formatThaiDate(scanMarkers.firstSeen)}</span>
                </span>
              )}
              {scanMarkers.reentries.length > 0 && (
                <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 flex items-center gap-1">
                  <span>🔄 เจอใหม่:</span>
                  <span>{formatThaiDate(scanMarkers.reentries[scanMarkers.reentries.length - 1])}</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {selectedTicker && (
                <button
                  onClick={() => setSelectedTicker(null)}
                  className="text-[11px] font-medium text-white/50 hover:text-white px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                >
                  ปิดกราฟ
                </button>
              )}
              <button
                onClick={() => setChartCollapsed(prev => !prev)}
                title="ย่อ/ขยายกราฟ"
                className="text-[12px] text-white/40 hover:text-white/70 px-2 py-1 rounded bg-white/5 hover:bg-white/10 transition-colors"
              >
                {chartCollapsed ? '▼' : '▲'}
              </button>
            </div>
          </div>
          {!chartCollapsed && (
            <StockChart
              ticker={activeTicker}
              height={340}
              showEma10={true}
              highlightDates={scanMarkers.firstSeen ? [scanMarkers.firstSeen] : undefined}
              reentryDates={scanMarkers.reentries.length ? scanMarkers.reentries : undefined}
            />
          )}
        </div>
      ) : (
        <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-8 text-center">
          <p className="text-[12px] text-white/40">คลิกชื่อหุ้นในตารางเพื่อดูกราฟ</p>
        </div>
      )}

      <MobileScanProgress shown={visibleCount} total={totalCount} />
      <TableWrap>
        <thead className="border-b border-white/[0.06] bg-white/[0.015]">
          <tr>
            <Th>#</Th>
            <SortableTh sortKey="Ticker" currentSort={sortConfig} onSort={handleSort}>Symbol</SortableTh>
            <SortableTh right sortKey="Close" currentSort={sortConfig} onSort={handleSort}>Price</SortableTh>
            <SortableTh right sortKey="__days" currentSort={sortConfig} onSort={handleSort}>Days</SortableTh>
            <SortableTh right sortKey="PE_Ratio" currentSort={sortConfig} onSort={handleSort}>P/E</SortableTh>
            <SortableTh right sortKey="ROE" currentSort={sortConfig} onSort={handleSort}>ROE</SortableTh>
            <SortableTh right sortKey="Revenue_Growth_YoY" currentSort={sortConfig} onSort={handleSort}>Rev Gr (YoY)</SortableTh>
            <SortableTh right sortKey="NetProfit_Growth_QoQY" currentSort={sortConfig} onSort={handleSort}>Profit Gr (QoQY)</SortableTh>
            <SortableTh right sortKey="52W_High" currentSort={sortConfig} onSort={handleSort}>52w H/L</SortableTh>
            <SortableTh right sortKey="__ema10diff" currentSort={sortConfig} onSort={handleSort}>vs EMA10</SortableTh>
            <SortableTh right sortKey="Market_Cap" currentSort={sortConfig} onSort={handleSort}>Market Cap (MB)</SortableTh>
            <SortableTh right sortKey="ADTV_MB" currentSort={sortConfig} onSort={handleSort}>ADTV (MB)</SortableTh>
          </tr>
        </thead>
        <tbody>
          {displayRows.map((s, i) => {
            const isActive = activeTicker === s.Ticker;
            const isLowLiquidity = (s.ADTV_MB || 0) < 5;
            return (
              <tr
                key={s.Ticker}
                onClick={() => setSelectedTicker(s.Ticker)}
                className={`border-b border-white/[0.04] transition-colors cursor-pointer group ${
                  isActive ? 'bg-emerald-500/10 border-l-4 border-l-emerald-500 font-medium' : 'hover:bg-white/[0.02]'
                }`}
              >
                <Td className="text-white/40"><span className="text-white/30 tabular-nums">{i + 1}</span></Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <div className={`font-bold flex items-center gap-1.5 ${isActive ? 'text-emerald-400' : 'text-white'}`}>
                      {s.Ticker}
                      {newSet.has(s.Ticker) && <NewBadge />}
                    </div>
                    <AddMyStockButton ticker={s.Ticker} />
                    {isActive && <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300">กำลังดูอยู่</span>}
                  </div>
                  <SectorChip ticker={s.Ticker} />
                </Td>
                <Td right mono>
                  <LivePriceCell jsonPrice={s.Close} livePrice={priceMap[s.Ticker]} fetchDone={fetchDone} />
                </Td>
                <Td right mono>
                  <span
                    onClick={(e) => { e.stopPropagation(); goToHistory(s.Ticker); }}
                    title="ดูประวัติการติด scan ย้อนหลัง"
                    className="text-white/60 hover:text-white underline decoration-dotted underline-offset-2 cursor-pointer"
                  >
                    {daysInScan('lekkung', s.Ticker) ?? '—'}
                  </span>
                </Td>
                <Td right mono>{formatPE(s.PE_Ratio)}</Td>
                <Td right mono>
                  <span className={s.ROE > 0.15 ? 'text-[#1D9E75]' : 'text-white'}>
                    {s.ROE ? (s.ROE * 100).toFixed(1) + '%' : '-'}
                  </span>
                </Td>
                <Td right mono>
                  <span className={s.Revenue_Growth_YoY > 20 ? 'text-[#1D9E75]' : 'text-white'}>
                    {s.Revenue_Growth_YoY?.toFixed(1) || '-'}%
                  </span>
                </Td>
                <Td right mono>
                  <span className={s.NetProfit_Growth_QoQY > 20 ? 'text-[#1D9E75]' : 'text-white'}>
                    {s.NetProfit_Growth_QoQY != null ? s.NetProfit_Growth_QoQY.toFixed(1) + '%' : '-'}
                  </span>
                </Td>
                <Td right mono>
                  <div className="flex flex-col items-end leading-tight text-label">
                    <span className="text-[#E24B4A]">{s['52W_High']?.toFixed(2) || '-'}</span>
                    <span className="text-[#1D9E75]">{s['52W_Low']?.toFixed(2) || '-'}</span>
                  </div>
                </Td>
                <Td right mono>
                  {(s.EMA_10 != null && s.Close != null) ? (
                    <div className="flex flex-col items-end leading-tight text-label">
                      <span className={s.Close >= s.EMA_10 ? 'text-[#1D9E75]' : 'text-[#3B9EFF]'}>
                        {(s.Close - s.EMA_10 >= 0 ? '+' : '') + (s.Close - s.EMA_10).toFixed(2)}
                      </span>
                      <span className={s.Close >= s.EMA_10 ? 'text-[#1D9E75]' : 'text-[#3B9EFF]'}>
                        {(((s.Close - s.EMA_10) / s.EMA_10) * 100 >= 0 ? '+' : '') + (((s.Close - s.EMA_10) / s.EMA_10) * 100).toFixed(1) + '%'}
                      </span>
                    </div>
                  ) : <span className="text-white/30">—</span>}
                </Td>
                <Td right mono>
                  <span className="text-white/70">
                    {s.Market_Cap ? (s.Market_Cap / 1e6).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '-'}
                  </span>
                </Td>
                <Td right mono>
                  <span className={isLowLiquidity ? 'text-amber-400 font-semibold' : 'text-white/70'} title={isLowLiquidity ? 'สภาพคล่องต่ำกว่า 5 ลบ./วัน' : undefined}>
                    {s.ADTV_MB?.toFixed(0) || '-'} {isLowLiquidity && '⚠️'}
                  </span>
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
          {filtered.length === 0 && (
            <tr>
              <td colSpan={12} className="py-12 text-center text-[13px] text-white/25">
                ไม่พบหุ้นที่ตรงกับ filter
              </td>
            </tr>
          )}
        </tbody>
      </TableWrap>
      </div>
      )}
      </>
      )}
      <ScrollToTopButton />
    </div>
  );
}
