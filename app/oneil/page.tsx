'use client';

import { useState, useMemo } from 'react';
import { oneilData } from '@/lib/strategyData';
import { daysInScan } from '@/lib/scanDays';
import { getScanGeneratedAt } from '@/lib/scanGeneratedAt';
import StaleDataBanner from '@/components/StaleDataBanner';
import { formatThaiDate } from '@/lib/utils';
import { useLivePrices } from '@/lib/useLivePrices';
import { useInfiniteRows } from '@/lib/useInfiniteRows';
import MobileScanProgress from '@/components/MobileScanProgress';
import ScrollToTopButton from '@/components/ScrollToTopButton';
import {
  rsColor, SectorChip, Th, Td, TableWrap, FilterBar, PageHeader, LivePriceCell, SortableTh, SortConfig,
  formatPE, ExportCSVButton, AddMyStockButton,
} from '@/components/StrategyTable';
import StockChart from '@/components/StockChart';
import ScanHistoryView from '@/components/ScanHistoryView';
import ModeToggle from '@/components/ModeToggle';
import TrendSparkline from '@/components/TrendSparkline';
import { sparklineMap } from '@/lib/sparklineData';
import ScanDiffChips, { DiffFilter } from '@/components/ScanDiffChips';
import DroppedTickersList from '@/components/DroppedTickersList';
import NewBadge from '@/components/NewBadge';
import { getScanDiff } from '@/lib/scanDiff';
import { getScanHistory } from '@/lib/scanHistory';
import { computeScanMarkers } from '@/lib/scanMarkers';
import ReportCardBar from '@/components/ReportCardBar';
import ReportCardButton from '@/components/ReportCardButton';

export default function OneilPage() {
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const [mode, setMode] = useState<'today' | 'history'>('today');
  const [diffFilter, setDiffFilter] = useState<DiffFilter>('all');
  const { priceMap, fetchDone } = useLivePrices(oneilData.map(s => s.Ticker));
  const newSet = useMemo(() => new Set(getScanDiff('oneil')?.newTickers ?? []), []);

  const oneilHistory = useMemo(() => getScanHistory('oneil'), []);

  const handleSort = (key: string) => {
    setSortConfig(prev => prev?.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' });
  };

  const filtered = useMemo(() => {
    let result = oneilData
      .filter(s => diffFilter !== 'new' || newSet.has(s.Ticker));

    if (sortConfig) {
      result = result.sort((a, b) => {
        if (sortConfig.key === '__days') {
          const aVal = daysInScan('oneil', a.Ticker) ?? -1;
          const bVal = daysInScan('oneil', b.Ticker) ?? -1;
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
      result = result.sort((a, b) => b.RS_Rating - a.RS_Rating);
    }
    return result;
  }, [sortConfig, diffFilter, newSet]);

  const { isMobile, visibleRows, visibleCount, totalCount, sentinelRef } = useInfiniteRows(
    filtered,
    [sortConfig, diffFilter, newSet]
  );
  const displayRows = isMobile ? visibleRows : filtered;
  const activeTicker = selectedTicker ?? filtered[0]?.Ticker ?? null;
  const scanMarkers = useMemo(() => {
    if (!activeTicker || !oneilHistory) return { firstSeen: null, reentries: [] };
    const match = oneilHistory.tickers.find(t => t.ticker === activeTicker);
    return computeScanMarkers(match?.hitDates);
  }, [activeTicker, oneilHistory]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader
          title="CAN SLIM (O'Neil)"
          subtitle="William O'Neil Growth Strategy"
          count={filtered.length}
          updatedAt={formatThaiDate(getScanGeneratedAt('oneil'))}
          total={oneilData.length}
        />
        <div className="flex items-center gap-3">
          <ReportCardButton scanKey="oneil" />
          <ExportCSVButton data={filtered} filename="oneil_canslim.csv" />
          <ModeToggle mode={mode} onChange={setMode} />
        </div>
      </div>
      <StaleDataBanner generatedAt={getScanGeneratedAt('oneil')} />
      <ReportCardBar scanKey="oneil" />

      {mode === 'history' ? (
        <ScanHistoryView scanName="oneil" />
      ) : (
      <>
      <FilterBar>
        <ScanDiffChips scanName="oneil" filter={diffFilter} onChange={setDiffFilter} />
      </FilterBar>

      {diffFilter === 'dropped' ? (
        <DroppedTickersList scanName="oneil" />
      ) : (
      <div className="space-y-4">
      {/* Top Chart Section */}
      {activeTicker && (
        <div className="bg-[#13161e] border border-emerald-500/30 rounded-xl p-4 shadow-xl space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap border-b border-white/[0.06] pb-3">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-[18px] font-extrabold text-white tracking-wide">{activeTicker}</h2>
              <span className="text-[11.5px] text-white/40">Technical Chart (CAN SLIM Strategy)</span>
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
            highlightDates={scanMarkers.firstSeen ? [scanMarkers.firstSeen] : undefined}
            reentryDates={scanMarkers.reentries.length ? scanMarkers.reentries : undefined}
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
            <SortableTh right sortKey="52W_High" currentSort={sortConfig} onSort={handleSort}>52W H/L</SortableTh>
            <SortableTh right sortKey="%_From_52W_High" currentSort={sortConfig} onSort={handleSort}>% From 52W High</SortableTh>
            <SortableTh right sortKey="PE_Ratio" currentSort={sortConfig} onSort={handleSort}>P/E</SortableTh>
            <SortableTh right sortKey="ROE" currentSort={sortConfig} onSort={handleSort}>ROE</SortableTh>
            <SortableTh right sortKey="Profit_Growth_YoY" currentSort={sortConfig} onSort={handleSort}>Profit Gr (YoY)</SortableTh>
            <SortableTh right sortKey="Market_Cap" currentSort={sortConfig} onSort={handleSort}>Market Cap (MB)</SortableTh>
            <Th right>ADTV (MB)</Th>
            <Th right>RS</Th>
          </tr>
        </thead>
        <tbody>
          {displayRows.map((s, i) => {
            const isActive = activeTicker === s.Ticker;
            return (
              <tr
                key={s.Ticker}
                onClick={() => setSelectedTicker(s.Ticker)}
                className={`border-b border-white/[0.04] transition-colors cursor-pointer ${
                  isActive ? 'bg-emerald-500/10 border-l-4 border-l-emerald-500 font-medium' : 'hover:bg-white/[0.02]'
                }`}
              >
                <Td><span className="text-white/30 tabular-nums">{i + 1}</span></Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <div className={`font-bold ${isActive ? 'text-emerald-400' : 'text-white'}`}>
                      {s.Ticker}
                      {newSet.has(s.Ticker) && <NewBadge />}
                    </div>
                    <AddMyStockButton ticker={s.Ticker} />
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
                <span className="text-white/60">{daysInScan('oneil', s.Ticker) ?? '—'}</span>
              </Td>
              <Td right mono>
                <div className="flex flex-col items-end leading-tight text-label">
                  <span className="text-[#E24B4A]">{s['52W_High']?.toFixed(2) || '-'}</span>
                  <span className="text-[#1D9E75]">{s['52W_Low']?.toFixed(2) || '-'}</span>
                </div>
              </Td>
              <Td right mono>
                <span className={s['%_From_52W_High'] >= -15 ? 'text-[#1D9E75]' : 'text-white'}>
                  {s['%_From_52W_High']?.toFixed(1) || '-'}%
                </span>
              </Td>
              <Td right mono>{formatPE(s.PE_Ratio)}</Td>
              <Td right mono>
                <span className={s.ROE > 0.15 ? 'text-[#1D9E75]' : 'text-white'}>
                  {s.ROE ? (s.ROE * 100).toFixed(1) + '%' : '-'}
                </span>
              </Td>
              <Td right mono>
                <span className={s.Profit_Growth_YoY > 20 ? 'text-[#1D9E75]' : 'text-white'}>
                  {s.Profit_Growth_YoY != null ? s.Profit_Growth_YoY.toFixed(1) + '%' : '-'}
                </span>
              </Td>
              <Td right mono>
                <span className="text-white/70">
                  {s.Market_Cap ? (s.Market_Cap / 1e6).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '-'}
                </span>
              </Td>
              <Td right mono>{s['ADTV(MB)']?.toFixed(0) || '-'}</Td>
              <Td right mono>
                <span className="font-bold text-[14px]" style={{ color: rsColor(s.RS_Rating) }}>
                  {s.RS_Rating}
                </span>
              </Td>
            </tr>
          );
        })}
          {isMobile && visibleCount < totalCount && (
            <tr ref={sentinelRef}>
              <td colSpan={13} className="py-3 text-center text-[11px] text-white/25">
                กำลังโหลดเพิ่ม…
              </td>
            </tr>
          )}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={13} className="py-12 text-center text-[13px] text-white/25">
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
