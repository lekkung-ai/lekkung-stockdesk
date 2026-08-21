'use client';

import { useState, useMemo } from 'react';
import { stageData } from '@/lib/strategyData';
import { getScanGeneratedAt, hasScanKey } from '@/lib/scanGeneratedAt';
import StaleDataBanner from '@/components/StaleDataBanner';
import { formatThaiDate } from '@/lib/utils';
import { useLivePrices } from '@/lib/useLivePrices';
import { useInfiniteRows } from '@/lib/useInfiniteRows';
import MobileScanProgress from '@/components/MobileScanProgress';
import ScrollToTopButton from '@/components/ScrollToTopButton';
import {
  stageCls, SectorChip, Th, Td, TableWrap, FilterBar, SliderField, Divider, PageHeader, LivePriceCell, SortableTh, SortConfig,
  ExportCSVButton, AddMyStockButton,
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

export default function MarketStagePage() {
  const [stages, setStages] = useState<Set<string>>(new Set(ALL_STAGES));
  const [adtvMin, setAdtvMin] = useState(0);
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [mode, setMode] = useState<'today' | 'history'>('today');
  const [diffFilter, setDiffFilter] = useState<DiffFilter>('all');
  const { priceMap, fetchDone } = useLivePrices(stageData.map(s => s.Ticker));
  const newSet = useMemo(() => new Set(getScanDiff('market-stage')?.newTickers ?? []), []);

  const allStagesSelected = stages.size === ALL_STAGES.length;

  const handleSort = (key: string) => {
    setSortConfig(prev => prev?.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' });
  };

  function toggleStage(s: string) {
    const next = new Set(stages);
    if (next.has(s)) next.delete(s);
    else next.add(s);
    setStages(next);
  }

  const filtered = useMemo(() => {
    let result = stageData
      .filter(s => allStagesSelected || stages.has(s.Stage))
      .filter(s => adtvMin === 0 || (s['ADTV(MB)'] || 0) >= adtvMin)
      .filter(s => diffFilter !== 'new' || newSet.has(s.Ticker));
    if (sortConfig) {
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
  }, [stages, allStagesSelected, adtvMin, sortConfig, diffFilter, newSet]);

  const { isMobile, visibleRows, visibleCount, totalCount, sentinelRef } = useInfiniteRows(
    filtered,
    [stages, allStagesSelected, adtvMin, sortConfig, diffFilter, newSet]
  );
  const displayRows = isMobile ? visibleRows : filtered;

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
        <span className="text-[10px] text-white/20 uppercase tracking-wider flex-shrink-0">Stage</span>
        {ALL_STAGES.map(s => (
          <button
            key={s}
            onClick={() => toggleStage(s)}
            className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${
              stages.has(s) ? stageCls(s) : 'bg-white/[0.04] text-white/20 hover:text-white/40'
            }`}
          >
            {s}
          </button>
        ))}
        {!allStagesSelected && (
          <button
            onClick={() => setStages(new Set(ALL_STAGES))}
            className="text-label text-white/25 hover:text-white/60 transition-colors"
          >
            Reset
          </button>
        )}
        {stages.size > 0 && (
          <button
            onClick={() => setStages(new Set())}
            className="text-label text-white/25 hover:text-white/60 transition-colors"
          >
            ล้างทั้งหมด
          </button>
        )}
        <Divider />
        <SliderField label="สภาพคล่องขั้นต่ำ ADTV (MB)" min={0} max={50} value={adtvMin} onChange={setAdtvMin} step={5} />
        <div className="ml-auto">
          <ScanDiffChips scanName="market-stage" filter={diffFilter} onChange={setDiffFilter} />
        </div>
      </FilterBar>

      {diffFilter === 'dropped' ? (
        <DroppedTickersList scanName="market-stage" />
      ) : (
      <>
      <MobileScanProgress shown={visibleCount} total={totalCount} />
      <TableWrap>
        <thead className="border-b border-white/[0.06] bg-white/[0.015]">
          <tr>
            <Th>#</Th>
            <SortableTh sortKey="Ticker" currentSort={sortConfig} onSort={handleSort}>Symbol</SortableTh>
            <SortableTh right sortKey="Price" currentSort={sortConfig} onSort={handleSort}>Price</SortableTh>
            <Th right>Trend</Th>
            <SortableTh sortKey="Stage" currentSort={sortConfig} onSort={handleSort}>Stage</SortableTh>
            <SortableTh right sortKey="Bar_Count" currentSort={sortConfig} onSort={handleSort}>Days In Stage</SortableTh>
            <SortableTh right sortKey="EMA50" currentSort={sortConfig} onSort={handleSort}>EMA50</SortableTh>
            <SortableTh right sortKey="EMA200" currentSort={sortConfig} onSort={handleSort}>EMA200</SortableTh>
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
              <Td><span className="text-white/20 tabular-nums">{i + 1}</span></Td>
              <Td>
                <div className="flex items-center gap-2 font-bold text-white">
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
              <Td right mono>
                <span className={s.Price > (s.EMA50 || 0) ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}>
                  {s.EMA50 != null ? s.EMA50.toFixed(2) : '-'}
                </span>
              </Td>
              <Td right mono>
                <span className={s.Price > (s.EMA200 || 0) ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}>
                  {s.EMA200 != null ? s.EMA200.toFixed(2) : '-'}
                </span>
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
                        <span className="text-label text-white/40">EMA50 / EMA200</span>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedTicker(null); }}
                        className="text-label text-white/40 hover:text-white px-2 py-1 rounded bg-white/5 hover:bg-white/10 transition-colors"
                      >
                        ปิดกราฟ
                      </button>
                    </div>
                    <StockChart ticker={s.Ticker} height={350} />
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
      </>
      )}
      </>
      )}
      <ScrollToTopButton />
    </div>
  );
}
