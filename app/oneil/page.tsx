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
  rsColor, SectorChip, Th, Td, TableWrap, FilterBar, SliderField, Divider, PageHeader, LivePriceCell, SortableTh, SortConfig,
} from '@/components/StrategyTable';
import ScanHistoryView from '@/components/ScanHistoryView';
import ModeToggle from '@/components/ModeToggle';
import TrendSparkline from '@/components/TrendSparkline';
import { sparklineMap } from '@/lib/sparklineData';
import ScanDiffChips, { DiffFilter } from '@/components/ScanDiffChips';
import DroppedTickersList from '@/components/DroppedTickersList';
import NewBadge from '@/components/NewBadge';
import { getScanDiff } from '@/lib/scanDiff';
import ReportCardBar from '@/components/ReportCardBar';

export default function OneilPage() {
  const [rsMin, setRsMin] = useState(80);
  const [profitMin, setProfitMin] = useState(20);
  const [roeMin, setRoeMin] = useState(15);
  const [mcapMin, setMcapMin] = useState(0);
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const [mode, setMode] = useState<'today' | 'history'>('today');
  const [diffFilter, setDiffFilter] = useState<DiffFilter>('all');
  const { priceMap, fetchDone } = useLivePrices(oneilData.map(s => s.Ticker));
  const newSet = useMemo(() => new Set(getScanDiff('oneil')?.newTickers ?? []), []);

  const handleSort = (key: string) => {
    setSortConfig(prev => prev?.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' });
  };

  const filtered = useMemo(() => {
    let result = oneilData
      .filter(s => s.RS_Rating >= rsMin)
      .filter(s => s.Profit_Growth_YoY >= profitMin)
      .filter(s => (s.ROE * 100) >= roeMin)
      .filter(s => mcapMin === 0 || ((s.Market_Cap || 0) / 1e6) >= mcapMin)
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
  }, [rsMin, profitMin, roeMin, mcapMin, sortConfig, diffFilter, newSet]);

  const { isMobile, visibleRows, visibleCount, totalCount, sentinelRef } = useInfiniteRows(
    filtered,
    [rsMin, profitMin, roeMin, mcapMin, sortConfig, diffFilter, newSet]
  );
  const displayRows = isMobile ? visibleRows : filtered;

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
        <ModeToggle mode={mode} onChange={setMode} />
      </div>
      <StaleDataBanner generatedAt={getScanGeneratedAt('oneil')} />
      <ReportCardBar scanKey="oneil" />

      {mode === 'history' ? (
        <ScanHistoryView scanName="oneil" />
      ) : (
      <>
      <FilterBar>
        <SliderField label="RS Rating" min={50} max={99} value={rsMin} onChange={setRsMin} />
        <Divider />
        <SliderField label="Profit Growth %" min={0} max={100} value={profitMin} onChange={setProfitMin} />
        <Divider />
        <SliderField label="ROE %" min={15} max={50} value={roeMin} onChange={setRoeMin} />
        <Divider />
        <SliderField label="Market Cap (MB)" min={0} max={50000} value={mcapMin} onChange={setMcapMin} step={1000} />
        <Divider />
        <ScanDiffChips scanName="oneil" filter={diffFilter} onChange={setDiffFilter} />
      </FilterBar>

      {diffFilter === 'dropped' ? (
        <DroppedTickersList scanName="oneil" />
      ) : (
      <div>
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
          {displayRows.map((s, i) => (
            <tr key={s.Ticker} className="border-b border-white/[0.04] hover:bg-white/[0.025] transition-colors">
              <Td><span className="text-white/20 tabular-nums">{i + 1}</span></Td>
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
              <Td right mono>{s.PE_Ratio?.toFixed(2) || '-'}</Td>
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
          ))}
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
