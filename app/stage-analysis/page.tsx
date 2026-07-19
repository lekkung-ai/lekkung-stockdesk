'use client';

import { useState, useMemo } from 'react';
import { weinsteinData } from '@/lib/strategyData';
import { getScanGeneratedAt } from '@/lib/scanGeneratedAt';
import StaleDataBanner from '@/components/StaleDataBanner';
import { formatThaiDate } from '@/lib/utils';
import { useLivePrices } from '@/lib/useLivePrices';
import { useInfiniteRows } from '@/lib/useInfiniteRows';
import MobileScanProgress from '@/components/MobileScanProgress';
import ScrollToTopButton from '@/components/ScrollToTopButton';
import {
  SectorChip, Th, Td, TableWrap, FilterBar, SliderField, Divider, PageHeader, LivePriceCell, SortableTh, SortConfig,
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
import ReportCardBar from '@/components/ReportCardBar';
import React from 'react';

export default function StageAnalysisPage() {
  const [stageFilter, setStageFilter] = useState<string>('All');
  const [rsMin, setRsMin] = useState(0);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const [mode, setMode] = useState<'today' | 'history'>('today');
  const [diffFilter, setDiffFilter] = useState<DiffFilter>('all');
  const newSet = useMemo(() => new Set(getScanDiff('stage-analysis')?.newTickers ?? []), []);
  const { priceMap, fetchDone } = useLivePrices(weinsteinData.map(s => s.Ticker));

  const handleSort = (key: string) => {
    setSortConfig(prev => prev?.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' });
  };

  const filtered = useMemo(() => {
    let result = weinsteinData
      .filter(s => stageFilter === 'All' || s.Stage.includes(stageFilter))
      .filter(s => s.RS_Rating >= rsMin)
      .filter(s => diffFilter !== 'new' || newSet.has(s.Ticker));

    if (sortConfig) {
      result = result.sort((a, b) => {
        const aVal = (a as any)[sortConfig.key];
        const bVal = (b as any)[sortConfig.key];
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return sortConfig.dir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }
        return sortConfig.dir === 'asc' ? (aVal || 0) - (bVal || 0) : (bVal || 0) - (aVal || 0);
      });
    } else {
      // Default sort by Stage Rank (Breakout first, then 2), then RS
      result = result.sort((a, b) => {
        const getRank = (s: string) => {
            if (s.includes('Stage 2A')) return 1;
            if (s.includes('Stage 2')) return 2;
            if (s.includes('Stage 1')) return 3;
            if (s.includes('Stage 3')) return 4;
            return 5;
        }
        const rankA = getRank(a.Stage);
        const rankB = getRank(b.Stage);
        if (rankA !== rankB) return rankA - rankB;
        return b.RS_Rating - a.RS_Rating;
      });
    }
    return result;
  }, [stageFilter, rsMin, sortConfig, diffFilter, newSet]);

  const { isMobile, visibleRows, visibleCount, totalCount, sentinelRef } = useInfiniteRows(
    filtered,
    [stageFilter, rsMin, sortConfig, diffFilter, newSet]
  );
  const displayRows = isMobile ? visibleRows : filtered;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader
          title="Stage Analysis"
          subtitle="Stan Weinstein's Market Stages (Weekly 30-MA & 10-MA)"
          count={filtered.length}
          updatedAt={formatThaiDate(getScanGeneratedAt('weinstein'))}
          total={weinsteinData.length}
        />
        <ModeToggle mode={mode} onChange={setMode} />
      </div>
      <StaleDataBanner generatedAt={getScanGeneratedAt('weinstein')} />
      <ReportCardBar scanKey="stage-analysis" />

      {mode === 'history' ? (
        <ScanHistoryView scanName="stage-analysis" />
      ) : (
      <>
      <FilterBar>
        <div className="flex flex-col gap-1.5 min-w-[120px]">
          <span className="text-label text-white/40 font-medium tracking-wide uppercase">Stage</span>
          <select
            value={stageFilter}
            onChange={e => setStageFilter(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-md px-2 py-1 text-label text-white outline-none focus:border-white/20"
          >
            <option value="All" className="bg-[#13161e]">All Stages</option>
            <option value="Stage 2A" className="bg-[#13161e]">Stage 2A (Breakout)</option>
            <option value="Stage 2" className="bg-[#13161e]">Stage 2 (Advancing)</option>
            <option value="Stage 1" className="bg-[#13161e]">Stage 1 (Basing)</option>
            <option value="Stage 3" className="bg-[#13161e]">Stage 3 (Topping)</option>
            <option value="Stage 4" className="bg-[#13161e]">Stage 4 (Declining)</option>
          </select>
        </div>
        <Divider />
        <SliderField label="Min RS Rating" min={0} max={99} value={rsMin} onChange={setRsMin} />
        <Divider />
        <ScanDiffChips scanName="stage-analysis" filter={diffFilter} onChange={setDiffFilter} />
      </FilterBar>

      {diffFilter === 'dropped' ? (
        <DroppedTickersList scanName="stage-analysis" />
      ) : (
      <>
      <MobileScanProgress shown={visibleCount} total={totalCount} />
      <TableWrap>
        <thead className="border-b border-white/[0.06] bg-white/[0.015]">
          <tr>
            <Th>#</Th>
            <SortableTh sortKey="Ticker" currentSort={sortConfig} onSort={handleSort}>Symbol</SortableTh>
            <SortableTh right sortKey="Close" currentSort={sortConfig} onSort={handleSort}>Price</SortableTh>
            <Th right>Trend</Th>
            <SortableTh right sortKey="Stage" currentSort={sortConfig} onSort={handleSort}>Stage</SortableTh>
            <SortableTh right sortKey="MA30" currentSort={sortConfig} onSort={handleSort}>30-W MA</SortableTh>
            <SortableTh right sortKey="Slope_4W_%" currentSort={sortConfig} onSort={handleSort}>Slope %</SortableTh>
            <SortableTh right sortKey="Vol10" currentSort={sortConfig} onSort={handleSort}>10-W Vol Avg</SortableTh>
            <SortableTh right sortKey="PE_Ratio" currentSort={sortConfig} onSort={handleSort}>P/E</SortableTh>
            <SortableTh right sortKey="ROE" currentSort={sortConfig} onSort={handleSort}>ROE</SortableTh>
            <SortableTh right sortKey="52W_High" currentSort={sortConfig} onSort={handleSort}>52w H/L</SortableTh>
            <SortableTh right sortKey="RS_Rating" currentSort={sortConfig} onSort={handleSort}>RS</SortableTh>
          </tr>
        </thead>
        <tbody>
          {displayRows.map((s, i) => (
            <React.Fragment key={s.Ticker}>
            <tr
              onClick={() => setSelectedTicker(selectedTicker === s.Ticker ? null : s.Ticker)}
              className={`border-b border-white/[0.04] transition-colors cursor-pointer ${
                selectedTicker === s.Ticker ? 'bg-white/[0.08]' : 'hover:bg-white/[0.02]'
              }`}
            >
              <Td className="text-white/40"><span className="text-white/20 tabular-nums">{i + 1}</span></Td>
              <Td>
                <div className="font-bold text-white">
                  {s.Ticker}
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
              <Td right mono>
                <span className={s.Stage.includes('2A') ? 'text-[#00BFFF] font-bold' : s.Stage.includes('Stage 2') ? 'text-[#1D9E75]' : s.Stage.includes('Stage 4') ? 'text-[#E24B4A]' : 'text-white/60'}>
                  {s.Stage}
                </span>
              </Td>
              <Td right mono>{s.MA30?.toFixed(2) || '-'}</Td>
              <Td right mono>
                <span className={s['Slope_4W_%'] > 1.0 ? 'text-[#1D9E75]' : s['Slope_4W_%'] < -1.0 ? 'text-[#E24B4A]' : 'text-white/60'}>
                  {s['Slope_4W_%'] > 0 ? '+' : ''}{s['Slope_4W_%']?.toFixed(1)}%
                </span>
              </Td>
              <Td right mono>
                <span className="text-white/70">
                  {s.Vol10 ? (s.Vol10).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '-'}
                </span>
              </Td>
              <Td right mono>{s.PE_Ratio ? s.PE_Ratio.toFixed(2) : '-'}</Td>
              <Td right mono>
                <span className={s.ROE > 0.15 ? 'text-[#1D9E75]' : 'text-white'}>
                  {s.ROE ? (s.ROE * 100).toFixed(1) + '%' : '-'}
                </span>
              </Td>
              <Td right mono>
                <div className="flex flex-col items-end leading-tight text-label">
                  <span className="text-[#E24B4A]">{s['52W_High']?.toFixed(2) || '-'}</span>
                  <span className="text-[#1D9E75]">{s['52W_Low']?.toFixed(2) || '-'}</span>
                </div>
              </Td>
              <Td right mono>
                <span className={s.RS_Rating >= 80 ? 'text-[#00BFFF] font-bold' : s.RS_Rating >= 70 ? 'text-[#1D9E75]' : 'text-white/70'}>
                  {s.RS_Rating}
                </span>
              </Td>
            </tr>
            {selectedTicker === s.Ticker && (
              <tr key={`${s.Ticker}-chart`} className="bg-black/20 border-b border-white/[0.04]">
                <td colSpan={12} className="p-4">
                  <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-4 shadow-lg relative">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-baseline gap-2">
                        <h2 className="text-[16px] font-bold text-white tracking-wide">{s.Ticker}</h2>
                        <span className="text-label text-white/40">Daily Chart - Stage Analysis (SMA50, SMA150)</span>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedTicker(null); }}
                        className="text-label text-white/40 hover:text-white px-2 py-1 rounded bg-white/5 hover:bg-white/10 transition-colors"
                      >
                        ปิดกราฟ
                      </button>
                    </div>
                    <StockChart ticker={s.Ticker} height={350} showSma50={true} showSma150={true} />
                  </div>
                </td>
              </tr>
            )}
          </React.Fragment>
          ))}
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
      </>
      )}
      </>
      )}
      <ScrollToTopButton />
    </div>
  );
}
