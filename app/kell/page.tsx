'use client';

import { useState, useMemo } from 'react';
import { kellData } from '@/lib/strategyData';
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
import ReportCardBar from '@/components/ReportCardBar';

const SIGNALS = ['ทั้งหมด', 'EMAC Buy', 'Trend Riding'] as const;
type SignalFilter = (typeof SIGNALS)[number];

function distColor(dist: number): string {
  if (dist <= 2) return '#1D9E75';
  if (dist <= 5) return '#EF9F27';
  return '#E24B4A';
}

export default function KellPage() {
  const [signalFilter, setSignalFilter] = useState<SignalFilter>('ทั้งหมด');
  const [distMax, setDistMax] = useState(8);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const [mode, setMode] = useState<'today' | 'history'>('today');
  const [diffFilter, setDiffFilter] = useState<DiffFilter>('all');
  const { priceMap, fetchDone } = useLivePrices(kellData.map(s => s.Ticker));
  const newSet = useMemo(() => new Set(getScanDiff('kell')?.newTickers ?? []), []);

  const kellHistory = useMemo(() => getScanHistory('kell'), []);

  const handleSort = (key: string) => {
    setSortConfig(prev => prev?.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' });
  };

  const filtered = useMemo(() => {
    let result = kellData
      .filter(s => signalFilter === 'ทั้งหมด' || s.Signal === signalFilter)
      .filter(s => s['Dist_EMA10_%'] <= distMax)
      .filter(s => diffFilter !== 'new' || newSet.has(s.Ticker));

    if (sortConfig) {
      result = result.sort((a, b) => {
        if (sortConfig.key === '__days') {
          const aVal = daysInScan('kell', a.Ticker) ?? -1;
          const bVal = daysInScan('kell', b.Ticker) ?? -1;
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
      result = result.sort((a, b) => Math.abs(a['Dist_EMA10_%']) - Math.abs(b['Dist_EMA10_%']));
    }
    return result;
  }, [signalFilter, distMax, sortConfig, diffFilter, newSet]);

  const { isMobile, visibleRows, visibleCount, totalCount, sentinelRef } = useInfiniteRows(
    filtered,
    [signalFilter, distMax, sortConfig, diffFilter, newSet]
  );
  const displayRows = isMobile ? visibleRows : filtered;
  const activeTicker = selectedTicker ?? filtered[0]?.Ticker ?? null;
  const firstSeenDate = useMemo(() => {
    if (!activeTicker || !kellHistory) return null;
    const match = kellHistory.tickers.find(t => t.ticker === activeTicker);
    return match?.firstSeen ?? null;
  }, [activeTicker, kellHistory]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader
          title="Oliver Kell EMAC"
          subtitle="EMA 10 Channel — ยิ่งแนบ EMA ยิ่งดี"
          count={filtered.length}
          updatedAt={formatThaiDate(getScanGeneratedAt('oliver_kell'))}
          total={kellData.length}
        />
        <ModeToggle mode={mode} onChange={setMode} />
      </div>
      <StaleDataBanner generatedAt={getScanGeneratedAt('oliver_kell')} />
      <ReportCardBar scanKey="kell" />

      {mode === 'history' ? (
        <ScanHistoryView scanName="kell" />
      ) : (
      <>
      <FilterBar>
        <div className="flex items-center gap-1.5">
          <span className="text-label text-white/40 mr-1">Signal</span>
          {SIGNALS.map(sig => (
            <button
              key={sig}
              onClick={() => setSignalFilter(sig)}
              className={`px-2.5 py-1 rounded-lg text-label font-medium transition-all border ${
                signalFilter === sig
                  ? 'bg-[#1D9E75]/10 text-[#1D9E75] border-[#1D9E75]/25'
                  : 'bg-white/[0.04] text-white/35 border-white/[0.06] hover:text-white/60'
              }`}
            >
              {sig}
            </button>
          ))}
        </div>
        <Divider />
        <SliderField
          label="Dist EMA10"
          min={1}
          max={15}
          value={distMax}
          onChange={setDistMax}
          unit="%"
          dir="lte"
        />
        <Divider />
        <ScanDiffChips scanName="kell" filter={diffFilter} onChange={setDiffFilter} />
      </FilterBar>

      {diffFilter === 'dropped' ? (
        <DroppedTickersList scanName="kell" />
      ) : (
      <div className="space-y-4">
      {/* Top Chart Section */}
      {activeTicker && (
        <div className="bg-[#13161e] border border-emerald-500/30 rounded-xl p-4 shadow-xl space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap border-b border-white/[0.06] pb-3">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-[18px] font-extrabold text-white tracking-wide">{activeTicker}</h2>
              <span className="text-[11.5px] text-white/40">Technical Chart (Oliver Kell Strategy)</span>
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
            <SortableTh sortKey="Signal" currentSort={sortConfig} onSort={handleSort}>Signal</SortableTh>
            <SortableTh right sortKey="Price" currentSort={sortConfig} onSort={handleSort}>Price</SortableTh>
            <Th right>Trend</Th>
            <SortableTh right sortKey="__days" currentSort={sortConfig} onSort={handleSort}>Days</SortableTh>
            <SortableTh right sortKey="EMA10" currentSort={sortConfig} onSort={handleSort}>EMA10</SortableTh>
            <SortableTh right sortKey="Dist_EMA10_%" currentSort={sortConfig} onSort={handleSort}>% Dist EMA10</SortableTh>
            <SortableTh right sortKey="ADTV(MB)" currentSort={sortConfig} onSort={handleSort}>ADTV (MB)</SortableTh>
            <Th>Status</Th>
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
                    {isActive && <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300">กำลังดูอยู่</span>}
                  </div>
                  <SectorChip ticker={s.Ticker} />
                </Td>
                <Td>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
                    s.Signal === 'EMAC Buy'
                      ? 'bg-[#EAF3DE] text-[#27500A]'
                      : 'bg-[#E6F1FB] text-[#0C447C]'
                  }`}>
                    {s.Signal}
                  </span>
                </Td>
                <Td right mono>
                  <LivePriceCell jsonPrice={s.Price} livePrice={priceMap[s.Ticker]} fetchDone={fetchDone} />
                </Td>
                <Td right>
                  <div className="flex justify-end"><TrendSparkline data={sparklineMap[s.Ticker]} /></div>
                </Td>
                <Td right mono>
                  <span className="text-white/60">{daysInScan('kell', s.Ticker) ?? 1}</span>
                </Td>
                <Td right mono>{s.EMA10.toFixed(2)}</Td>
                <Td right mono>
                  <span className="font-semibold" style={{ color: distColor(s['Dist_EMA10_%']) }}>
                    {s['Dist_EMA10_%'].toFixed(1)}%
                  </span>
                </Td>
                <Td right mono>{s['ADTV(MB)'].toFixed(0)}</Td>
                <Td>
                  <span className={`text-label ${
                    s.Status === 'ชิด EMA' ? 'text-[#1D9E75]'
                    : s.Status === 'Trend OK' ? 'text-[#EF9F27]'
                    : 'text-white/35'
                  }`}>
                    {s.Status}
                  </span>
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
      </div>
      )}
      </>
      )}
      <ScrollToTopButton />
    </div>
  );
}
