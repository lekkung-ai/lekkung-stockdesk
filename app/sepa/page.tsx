'use client';

import React, { useState, useMemo } from 'react';
import { Check, X } from 'lucide-react';
import { sepaData, SepaEntry } from '@/lib/strategyData';
import { daysInScan } from '@/lib/scanDays';
import { getScanGeneratedAt } from '@/lib/scanGeneratedAt';
import StaleDataBanner from '@/components/StaleDataBanner';
import ScanWarningBanner from '@/components/ScanWarningBanner';
import { formatThaiDate } from '@/lib/utils';
import { useLivePrices } from '@/lib/useLivePrices';
import { useInfiniteRows } from '@/lib/useInfiniteRows';
import MobileScanProgress from '@/components/MobileScanProgress';
import ScrollToTopButton from '@/components/ScrollToTopButton';
import {
  rsColor, SectorChip, Th, Td, TableWrap, FilterBar, SliderField, Divider, PageHeader, LivePriceCell, SortableTh, SortConfig,
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
import { getScanHistory } from '@/lib/scanHistory';
import { computeScanMarkers } from '@/lib/scanMarkers';
import ReportCardBar from '@/components/ReportCardBar';
import ReportCardButton from '@/components/ReportCardButton';

// Trend Template — 8 เงื่อนไขตาม Minervini (Trade Like a Stock Market Wizard, p.79)
const TREND_TEMPLATE_CONDITIONS: { key: keyof SepaEntry; label: string }[] = [
  { key: 'T1_Price_Above_150_200', label: 'T1: ราคา > SMA150 และ SMA200' },
  { key: 'T2_SMA50_Above_150_200', label: 'T2: SMA50 > SMA150 และ SMA200' },
  { key: 'T3_SMA150_Above_SMA200', label: 'T3: SMA150 > SMA200' },
  { key: 'T4_SMA200_Trending_Up', label: 'T4: SMA200 เทรนด์ขึ้น ≥ 1 เดือน' },
  { key: 'T5_Price_Above_SMA50', label: 'T5: ราคา > SMA50' },
  { key: 'T6_Above_52wLow_30pct', label: 'T6: ราคา ≥ 52w Low × 1.30' },
  { key: 'T7_Within_52wHigh_25pct', label: 'T7: ราคา ≥ 52w High × 0.75' },
  { key: 'T8_RS_At_Least_70', label: 'T8: RS Rating ≥ 70' },
];

function TrendTemplateChecks({ entry }: { entry: SepaEntry }) {
  return (
    <div className="flex items-center gap-[3px]" title="Trend Template 8 เงื่อนไข (Minervini)">
      {TREND_TEMPLATE_CONDITIONS.map(({ key, label }) => {
        const pass = entry[key];
        return (
          <span
            key={key}
            title={label}
            className={`flex items-center justify-center w-4 h-4 rounded-sm ${
              pass ? 'bg-[#1D9E75]/20 text-[#1D9E75]' : 'bg-white/[0.05] text-white/20'
            }`}
          >
            {pass ? <Check size={10} strokeWidth={3} /> : <X size={10} strokeWidth={3} />}
          </span>
        );
      })}
    </div>
  );
}

function RSBar({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, (score / 99) * 100));
  const color = rsColor(score);
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="w-12 h-1.5 bg-white/[0.08] rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="font-bold text-[14px] tabular-nums w-6 text-right" style={{ color }}>
        {score}
      </span>
    </div>
  );
}

function FundamentalBadge({ pass }: { pass: boolean | null | undefined }) {
  if (pass !== true) return null;
  return (
    <span
      title="ผ่าน Fundamental Filter: EPS YoY > 20%, Revenue YoY > 15%, EPS Accelerating"
      className="inline-flex items-center px-1 py-0 rounded text-[9px] font-bold bg-[#7F77DD]/20 text-[#7F77DD] ml-1.5 align-middle"
    >
      F+
    </span>
  );
}

export default function SepaPage() {
  const [rsMin, setRsMin] = useState(60);
  const [fromHighMax, setFromHighMax] = useState(15);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const [mode, setMode] = useState<'today' | 'history'>('today');
  const [diffFilter, setDiffFilter] = useState<DiffFilter>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 10;
  const { priceMap, fetchDone } = useLivePrices(sepaData.map(s => s.Ticker));
  const newSet = useMemo(() => new Set(getScanDiff('sepa')?.newTickers ?? []), []);

  const sepaHistory = useMemo(() => getScanHistory('sepa'), []);

  const handleSort = (key: string) => {
    setCurrentPage(1);
    setSortConfig(prev => prev?.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' });
  };

  const handleRsChange = (val: number) => {
    setCurrentPage(1);
    setRsMin(val);
  };

  const handleFromHighChange = (val: number) => {
    setCurrentPage(1);
    setFromHighMax(val);
  };

  const handleDiffFilterChange = (val: DiffFilter) => {
    setCurrentPage(1);
    setDiffFilter(val);
  };

  const filtered = useMemo(() => {
    let result = sepaData
      .filter(s => s.RS_Rating >= rsMin)
      .filter(s => s['%_From_High'] >= -fromHighMax)
      .filter(s => diffFilter !== 'new' || newSet.has(s.Ticker));

    if (sortConfig) {
      result = result.sort((a, b) => {
        if (sortConfig.key === '__days') {
          const aVal = daysInScan('sepa', a.Ticker) ?? -1;
          const bVal = daysInScan('sepa', b.Ticker) ?? -1;
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
  }, [rsMin, fromHighMax, sortConfig, diffFilter, newSet]);

  const { isMobile, visibleRows, visibleCount, totalCount, sentinelRef } = useInfiniteRows(
    filtered,
    [rsMin, fromHighMax, sortConfig, diffFilter, newSet]
  );

  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const safePage = Math.min(currentPage, totalPages);
  const displayRows = isMobile
    ? visibleRows
    : filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  // No chart until a row is clicked — the top chart used to default to the
  // first row, which read as "this stock matters most" when it only meant
  // "this one sorted first".
  const activeTicker = selectedTicker;
  const scanMarkers = useMemo(() => {
    if (!activeTicker || !sepaHistory) return { firstSeen: null, reentries: [] };
    const match = sepaHistory.tickers.find(t => t.ticker === activeTicker);
    return computeScanMarkers(match?.hitDates);
  }, [activeTicker, sepaHistory]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader
          title="SEPA Trend Template"
          subtitle="Stan Weinstein + O'Neil SEPA criteria"
          count={filtered.length}
          updatedAt={formatThaiDate(getScanGeneratedAt('sepa'))}
          total={sepaData.length}
        />
        <div className="flex items-center gap-3">
          <ReportCardButton scanKey="sepa" />
          <ExportCSVButton data={filtered} filename="sepa_trend_template.csv" />
          <ModeToggle mode={mode} onChange={setMode} />
        </div>
      </div>
      <StaleDataBanner generatedAt={getScanGeneratedAt('sepa')} />
      <ScanWarningBanner scanKey="sepa" label="SEPA" />
      <ReportCardBar scanKey="sepa" />

      {mode === 'history' ? (
        <ScanHistoryView scanName="sepa" />
      ) : (
      <>
      <FilterBar>
        <SliderField label="RS Rating" min={50} max={99} value={rsMin} onChange={handleRsChange} />
        <button
          onClick={() => handleRsChange(rsMin >= 80 ? 60 : 80)}
          title="Minervini แนะนำ RS ≥ 80 สำหรับหุ้นเกรด A"
          className={`px-2.5 py-1 rounded text-label font-semibold transition-all ${
            rsMin >= 80 ? 'bg-[#1D9E75]/20 text-[#1D9E75]' : 'bg-white/[0.04] text-white/30 hover:text-white/60'
          }`}
        >
          RS ≥ 80 (A-grade)
        </button>
        <Divider />
        <SliderField
          label="% From 52W High"
          min={1}
          max={30}
          value={fromHighMax}
          onChange={handleFromHighChange}
          unit="%"
          dir="lte"
        />
        <span className="text-label text-[#ffffff]/25 ml-auto">
          ยิ่งใกล้ High = momentum แข็ง
        </span>
        <Divider />
        <ScanDiffChips scanName="sepa" filter={diffFilter} onChange={handleDiffFilterChange} />
      </FilterBar>

      {diffFilter === 'dropped' ? (
        <DroppedTickersList scanName="sepa" />
      ) : (
      <div className="space-y-4">
      <MobileScanProgress shown={visibleCount} total={totalCount} />
      <TableWrap>
        <thead className="border-b border-white/[0.06] bg-white/[0.015]">
          <tr>
            <Th>#</Th>
            <SortableTh sortKey="Ticker" currentSort={sortConfig} onSort={handleSort}>Symbol</SortableTh>
            <SortableTh right sortKey="Price" currentSort={sortConfig} onSort={handleSort}>Price</SortableTh>
            <Th right>Trend</Th>
            <SortableTh right sortKey="__days" currentSort={sortConfig} onSort={handleSort}>Days</SortableTh>
            <SortableTh right sortKey="SMA_50" currentSort={sortConfig} onSort={handleSort}>SMA 50</SortableTh>
            <SortableTh right sortKey="SMA_200" currentSort={sortConfig} onSort={handleSort}>SMA 200</SortableTh>
            <SortableTh right sortKey="52W_High" currentSort={sortConfig} onSort={handleSort}>52W High</SortableTh>
            <SortableTh right sortKey="%_From_High" currentSort={sortConfig} onSort={handleSort}>% From High</SortableTh>
            <Th>Trend Template</Th>
            <SortableTh right sortKey="RS_Rating" currentSort={sortConfig} onSort={handleSort}>RS Rating</SortableTh>
          </tr>
        </thead>
        <tbody>
          {displayRows.map((s, idx) => {
            const globalIndex = isMobile ? idx : (safePage - 1) * pageSize + idx;
            const isActive = activeTicker === s.Ticker;
            return (
              <React.Fragment key={s.Ticker}>
              <tr
                onClick={() => setSelectedTicker(activeTicker === s.Ticker ? null : s.Ticker)}
                className={`border-b border-white/[0.04] transition-colors cursor-pointer ${
                  isActive ? 'bg-emerald-500/10 border-l-4 border-l-emerald-500 font-medium' : 'hover:bg-white/[0.02]'
                }`}
              >
                <Td><span className="text-white/30 tabular-nums">{globalIndex + 1}</span></Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <div className={`font-bold ${isActive ? 'text-emerald-400' : 'text-white'}`}>
                      {s.Ticker}
                      <FundamentalBadge pass={s.Fundamental_Pass} />
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
                <span className="text-white/60">{daysInScan('sepa', s.Ticker) ?? 1}</span>
              </Td>
              <Td right mono>
                <span className={s.Price > s.SMA_50 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}>
                  {s.SMA_50.toFixed(2)}
                </span>
              </Td>
              <Td right mono>
                <span className={s.Price > s.SMA_200 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}>
                  {s.SMA_200.toFixed(2)}
                </span>
              </Td>
              <Td right mono>{s['52W_High'].toFixed(2)}</Td>
              <Td right mono>
                <span className={s['%_From_High'] >= -5 ? 'text-[#1D9E75]' : s['%_From_High'] >= -10 ? 'text-[#EF9F27]' : 'text-white/50'}>
                  {s['%_From_High'].toFixed(1)}%
                </span>
              </Td>
              <Td><TrendTemplateChecks entry={s} /></Td>
              <Td right mono><RSBar score={s.RS_Rating} /></Td>
            </tr>
            {activeTicker === s.Ticker && (
              <tr key={`${s.Ticker}-chart`} className="bg-black/20 border-b border-white/[0.04]">
                <td colSpan={11} className="p-4">
                  <div className="bg-[#13161e] border border-emerald-500/25 rounded-xl p-4 shadow-xl space-y-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap border-b border-white/[0.06] pb-3">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h2 className="text-[18px] font-extrabold text-white tracking-wide">{s.Ticker}</h2>
                        <span className="text-[11.5px] text-white/40">Technical Chart (SEPA Trend Template)</span>
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
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedTicker(null); }}
                        className="text-[11px] font-medium text-white/50 hover:text-white px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                      >
                        ปิดกราฟ
                      </button>
                    </div>
                    <StockChart
                      ticker={s.Ticker}
                      height={340}
                      showEma10={true}
                      highlightDates={scanMarkers.firstSeen ? [scanMarkers.firstSeen] : undefined}
                      reentryDates={scanMarkers.reentries.length ? scanMarkers.reentries : undefined}
                    />
                  </div>
                </td>
              </tr>
            )}
            </React.Fragment>
          );
        })}
          {isMobile && visibleCount < totalCount && (
            <tr ref={sentinelRef}>
              <td colSpan={11} className="py-3 text-center text-[11px] text-white/25">
                กำลังโหลดเพิ่ม…
              </td>
            </tr>
          )}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={11} className="py-12 text-center text-[13px] text-white/25">
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
