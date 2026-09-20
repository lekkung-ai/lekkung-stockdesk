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
import { sepaCompositeScore } from '@/lib/compositeScore';

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

// ADTV floor ไม่ใช่ส่วนหนึ่งของ Trend Template 8 ข้อ — หุ้นผ่าน 8/8 แต่สภาพคล่อง
// ต่ำกว่า floor (10 ลบ./วัน) ยังโผล่ในลิสต์แทนที่จะถูกตัดทิ้งเงียบๆ badge นี้บอก
// ว่าทำไมถึงเห็นหุ้นตัวเล็ก/เทรดไม่คล่องปนอยู่กับหุ้น SEPA ทั่วไป
function LowLiquidityBadge({ low, adtvMb }: { low: boolean | undefined; adtvMb: number | undefined }) {
  if (!low) return null;
  const adtvLabel = adtvMb != null ? adtvMb.toFixed(1) : '?';
  return (
    <span
      title={`ADTV ${adtvLabel} ลบ./วัน (< floor 10 ลบ./วัน) — สภาพคล่องต่ำ ผ่าน Trend Template 8/8 แต่ระวังเรื่องเข้า-ออกยาก`}
      className="inline-flex items-center px-1 py-0 rounded text-[9px] font-bold bg-amber-500/20 text-amber-400 ml-1.5 align-middle"
    >
      ADTV ต่ำ
    </span>
  );
}

// Composite score คำนวณครั้งเดียวต่อ row (sepaData คงที่ตลอด session) — ไม่ persist ลง JSON
const SCORES = new Map(sepaData.map(s => [s.Ticker, sepaCompositeScore(s)]));

// ค่าเริ่มต้น: ซ่อนหุ้นสภาพคล่องต่ำ (ADTV < 10 ลบ./วัน) — ลาก slider ลงเพื่อดูทั้งหมด
// ตัวกรอง = "ซ่อน" ฝั่ง client เท่านั้น ไม่ลบ row · จำนวนที่ซ่อนแสดงใน FilterBar เสมอ
const ADTV_DEFAULT_MIN = 10;
const RS_FLOOR = 70; // scan ผ่าน RS ≥ 70 ทุกตัว (T8) — ต่ำกว่านี้ไม่มีแถวให้กรอง
const FUND_PASS_COUNT = sepaData.filter(s => s.Fundamental_Pass === true).length;

type SortMode = 'composite' | 'rs' | 'adtv' | 'proximity';
const SORT_LABELS: Record<SortMode, string> = {
  composite: 'Composite Score',
  rs: 'RS Rating',
  adtv: 'ADTV (สภาพคล่อง)',
  proximity: 'ใกล้ 52W High',
};

function scoreColor(total: number): string {
  if (total >= 80) return '#1D9E75';
  if (total >= 60) return '#EF9F27';
  return 'rgba(255,255,255,0.5)';
}

function ScoreCell({ ticker }: { ticker: string }) {
  const sc = SCORES.get(ticker);
  if (!sc) return <span className="text-white/20">—</span>;
  return (
    <span
      className="font-bold text-[14px] tabular-nums"
      style={{ color: scoreColor(sc.total) }}
      title={
        sc.renormalized
          ? `ไม่มีข้อมูลงบ → ตัด Fundamental ออก · RS ${sc.rs.toFixed(0)} ×62.5% · ใกล้ 52W High ${sc.proximity.toFixed(0)} ×37.5%`
          : `RS ${sc.rs.toFixed(0)} ×50% · Fundamental ${(sc.fundamental as number).toFixed(0)} ×20% · ใกล้ 52W High ${sc.proximity.toFixed(0)} ×30%`
      }
    >
      {Math.round(sc.total)}
    </span>
  );
}

export default function SepaPage() {
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const [mode, setMode] = useState<'today' | 'history'>('today');
  const [diffFilter, setDiffFilter] = useState<DiffFilter>('all');
  const [rsMin, setRsMin] = useState(RS_FLOOR);
  const [adtvMin, setAdtvMin] = useState(ADTV_DEFAULT_MIN);
  const [fundOnly, setFundOnly] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('composite');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 10;
  const { priceMap, fetchDone } = useLivePrices(sepaData.map(s => s.Ticker));
  const newSet = useMemo(() => new Set(getScanDiff('sepa')?.newTickers ?? []), []);

  const sepaHistory = useMemo(() => getScanHistory('sepa'), []);

  const handleSort = (key: string) => {
    setCurrentPage(1);
    setSortConfig(prev => prev?.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' });
  };

  const handleDiffFilterChange = (val: DiffFilter) => {
    setCurrentPage(1);
    setDiffFilter(val);
  };

  const handleRsMinChange = (val: number) => {
    setCurrentPage(1);
    setRsMin(val);
  };

  const handleAdtvMinChange = (val: number) => {
    setCurrentPage(1);
    setAdtvMin(val);
  };

  const handleFundOnlyToggle = () => {
    setCurrentPage(1);
    setFundOnly(v => !v);
  };

  const handleSortModeChange = (val: SortMode) => {
    setCurrentPage(1);
    setSortConfig(null); // เลือกโหมดจาก dropdown = ยกเลิกการเรียงตามหัวคอลัมน์
    setSortMode(val);
  };

  const handleShowAll = () => {
    setCurrentPage(1);
    setRsMin(RS_FLOOR);
    setAdtvMin(0);
    setFundOnly(false);
  };

  // slider/toggle = "ซ่อน" ฝั่ง client เท่านั้น (ไม่ลบ row) · ADTV ที่ไม่มีข้อมูล (undefined)
  // ไม่ถูกซ่อนด้วย ADTV slider — "ไม่ทราบ" ไม่ใช่ "สภาพคล่องต่ำ"
  const controlled = useMemo(
    () =>
      sepaData.filter(
        s =>
          s.RS_Rating >= rsMin &&
          (s['ADTV(MB)'] == null || s['ADTV(MB)'] >= adtvMin) &&
          (!fundOnly || s.Fundamental_Pass === true)
      ),
    [rsMin, adtvMin, fundOnly]
  );
  const hiddenByControls = sepaData.length - controlled.length;
  const hiddenByAdtv = useMemo(
    () => sepaData.filter(s => s['ADTV(MB)'] != null && s['ADTV(MB)'] < adtvMin).length,
    [adtvMin]
  );

  const filtered = useMemo(() => {
    let result = controlled
      .filter(s => diffFilter !== 'new' || newSet.has(s.Ticker));

    if (sortConfig) {
      result = result.sort((a, b) => {
        if (sortConfig.key === '__days') {
          const aVal = daysInScan('sepa', a.Ticker) ?? -1;
          const bVal = daysInScan('sepa', b.Ticker) ?? -1;
          return sortConfig.dir === 'asc' ? aVal - bVal : bVal - aVal;
        }
        if (sortConfig.key === '__score') {
          const aVal = SCORES.get(a.Ticker)?.total ?? 0;
          const bVal = SCORES.get(b.Ticker)?.total ?? 0;
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
      const total = (t: string) => SCORES.get(t)?.total ?? 0;
      result = result.sort((a, b) => {
        switch (sortMode) {
          case 'rs':
            return b.RS_Rating - a.RS_Rating || total(b.Ticker) - total(a.Ticker);
          case 'adtv':
            return (b['ADTV(MB)'] ?? -1) - (a['ADTV(MB)'] ?? -1) || total(b.Ticker) - total(a.Ticker);
          case 'proximity': // %_From_High ≤ 0 — ยิ่งใกล้ 0 ยิ่งใกล้ High
            return b['%_From_High'] - a['%_From_High'] || total(b.Ticker) - total(a.Ticker);
          default:
            return total(b.Ticker) - total(a.Ticker) || b.RS_Rating - a.RS_Rating;
        }
      });
    }
    return result;
  }, [controlled, sortConfig, sortMode, diffFilter, newSet]);

  const { isMobile, visibleRows, visibleCount, totalCount, sentinelRef } = useInfiniteRows(
    filtered,
    [sortConfig, sortMode, diffFilter, newSet, rsMin, adtvMin, fundOnly]
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
        <SliderField label="RS Rating" min={RS_FLOOR} max={90} step={10} value={rsMin} onChange={handleRsMinChange} />
        <SliderField label="ADTV (MB)" min={0} max={10} step={1} value={adtvMin} onChange={handleAdtvMinChange} />
        <button
          onClick={handleFundOnlyToggle}
          title="เฉพาะ Fundamental_Pass = true · หุ้นที่ไม่มีข้อมูลงบ (null) จะถูกซ่อนเมื่อเปิด"
          className={`px-2.5 py-1 rounded-lg text-label font-medium transition-all border ${
            fundOnly
              ? 'bg-[#7F77DD]/15 text-[#7F77DD] border-[#7F77DD]/30'
              : 'bg-white/[0.04] text-white/35 border-white/[0.06] hover:text-white/60'
          }`}
        >
          F+ เท่านั้น ({FUND_PASS_COUNT})
        </button>
        <Divider />
        <label className="flex items-center gap-2">
          <span className="text-[10px] text-white/30 uppercase tracking-wider">เรียงตาม</span>
          <select
            value={sortConfig ? 'column' : sortMode}
            onChange={e => handleSortModeChange(e.target.value as SortMode)}
            className="bg-[#13161e] border border-white/[0.09] rounded-lg px-2 py-1 text-[12px] text-white/70 outline-none focus:border-white/25 [color-scheme:dark] cursor-pointer"
          >
            {sortConfig && <option value="column" disabled>เรียงตามหัวคอลัมน์</option>}
            {(Object.keys(SORT_LABELS) as SortMode[]).map(m => (
              <option key={m} value={m}>{SORT_LABELS[m]}</option>
            ))}
          </select>
        </label>
        <Divider />
        <ScanDiffChips scanName="sepa" filter={diffFilter} onChange={handleDiffFilterChange} />
        <div className="basis-full flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/35">
          {hiddenByControls > 0 && (
            <>
              <span className="text-amber-400/90">
                ซ่อนด้วยตัวกรอง {hiddenByControls} ตัว
                {adtvMin > 0 && hiddenByAdtv > 0 && ` (ADTV ต่ำกว่า ${adtvMin} MB: ${hiddenByAdtv})`}
              </span>
              <button
                onClick={handleShowAll}
                className="px-2.5 py-0.5 rounded-md border border-amber-500/50 bg-amber-500/10 text-amber-300 text-[11px] font-semibold hover:bg-amber-500/20 hover:border-amber-400/70 transition-colors"
              >
                แสดงทั้งหมด
              </button>
            </>
          )}
          <span className="text-white/25">
            Score เฟส 1 = RS 50% + Fundamental 20% + ใกล้ 52W High 30% (ไม่มีข้อมูลงบ → ตัด Fundamental แล้วเกลี่ยเป็น 62.5/37.5) · ไม่รวมสภาพคล่อง · คำนวณในเบราว์เซอร์
          </span>
        </div>
      </FilterBar>

      {diffFilter === 'dropped' ? (
        <DroppedTickersList scanName="sepa" />
      ) : (
      <div className="space-y-4">
      <MobileScanProgress shown={visibleCount} total={totalCount} />
      <TableWrap>
        <thead className="border-b border-white/[0.06] bg-white/[0.015]">
          {/* responsive: # รวมเข้า Symbol (sticky) · SMA50/SMA200/52W High ซ่อน ≤1200
              (ครอบ iPad Air) เก็บ Trend Template + RS ที่เป็นหัวใจ SEPA · strip ใน expand */}
          <tr>
            <SortableTh sortKey="Ticker" currentSort={sortConfig} onSort={handleSort}>Symbol</SortableTh>
            <SortableTh right sortKey="__score" currentSort={sortConfig} onSort={handleSort}>Score</SortableTh>
            <SortableTh right sortKey="Price" currentSort={sortConfig} onSort={handleSort}>Price</SortableTh>
            <Th right>Trend</Th>
            <SortableTh right sortKey="__days" currentSort={sortConfig} onSort={handleSort}>Days</SortableTh>
            <SortableTh right className="hidden min-[1201px]:table-cell" sortKey="SMA_50" currentSort={sortConfig} onSort={handleSort}>SMA 50</SortableTh>
            <SortableTh right className="hidden min-[1201px]:table-cell" sortKey="SMA_200" currentSort={sortConfig} onSort={handleSort}>SMA 200</SortableTh>
            <SortableTh right className="hidden min-[1201px]:table-cell" sortKey="52W_High" currentSort={sortConfig} onSort={handleSort}>52W High</SortableTh>
            <SortableTh right sortKey="%_From_High" currentSort={sortConfig} onSort={handleSort}>% From High</SortableTh>
            <Th className="hidden min-[1367px]:table-cell">Trend Template</Th>
            <SortableTh right className="hidden min-[1367px]:table-cell" sortKey="RS_Rating" currentSort={sortConfig} onSort={handleSort}>RS Rating</SortableTh>
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
                <Td>
                  <div className="flex items-center gap-2">
                    <span className="text-white/25 tabular-nums text-[11px] shrink-0">{globalIndex + 1}</span>
                    <div className={`font-bold ${isActive ? 'text-emerald-400' : 'text-white'}`}>
                      {s.Ticker}
                      <FundamentalBadge pass={s.Fundamental_Pass} />
                      <LowLiquidityBadge low={s.Low_Liquidity} adtvMb={s['ADTV(MB)']} />
                      {newSet.has(s.Ticker) && <NewBadge />}
                    </div>
                    <AddMyStockButton ticker={s.Ticker} />
                    {isActive && <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300">กำลังดูอยู่</span>}
                  </div>
                  <SectorChip ticker={s.Ticker} />
                </Td>
              <Td right mono><ScoreCell ticker={s.Ticker} /></Td>
              <Td right mono>
                <LivePriceCell jsonPrice={s.Price} livePrice={priceMap[s.Ticker]} fetchDone={fetchDone} />
              </Td>
              <Td right>
                <div className="flex justify-end"><TrendSparkline data={sparklineMap[s.Ticker]} /></div>
              </Td>
              <Td right mono>
                <span className="text-white/60">{daysInScan('sepa', s.Ticker) ?? 1}</span>
              </Td>
              <Td right mono className="hidden min-[1201px]:table-cell">
                <span className={s.Price > s.SMA_50 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}>
                  {s.SMA_50.toFixed(2)}
                </span>
              </Td>
              <Td right mono className="hidden min-[1201px]:table-cell">
                <span className={s.Price > s.SMA_200 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}>
                  {s.SMA_200.toFixed(2)}
                </span>
              </Td>
              <Td right mono className="hidden min-[1201px]:table-cell">{s['52W_High'].toFixed(2)}</Td>
              <Td right mono>
                <span className={s['%_From_High'] >= -5 ? 'text-[#1D9E75]' : s['%_From_High'] >= -10 ? 'text-[#EF9F27]' : 'text-white/50'}>
                  {s['%_From_High'].toFixed(1)}%
                </span>
              </Td>
              <Td className="hidden min-[1367px]:table-cell"><TrendTemplateChecks entry={s} /></Td>
              <Td right mono className="hidden min-[1367px]:table-cell"><RSBar score={s.RS_Rating} /></Td>
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
                    {/* คอลัมน์รองที่ซ่อน ≤1200 (iPad Air) — โชว์ตรงนี้แทน */}
                    <div className="min-[1201px]:hidden flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] border-b border-white/[0.06] pb-3">
                      <span className="text-white/40">SMA 50: <span className={`tabular-nums font-semibold ${s.SMA_50 != null && s.Price > s.SMA_50 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>{s.SMA_50 != null ? s.SMA_50.toFixed(2) : '-'}</span></span>
                      <span className="text-white/40">SMA 200: <span className={`tabular-nums font-semibold ${s.SMA_200 != null && s.Price > s.SMA_200 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>{s.SMA_200 != null ? s.SMA_200.toFixed(2) : '-'}</span></span>
                      <span className="text-white/40">52W High: <span className="tabular-nums font-semibold text-white/80">{s['52W_High'] != null ? s['52W_High'].toFixed(2) : '-'}</span></span>
                      <span className="text-white/40">RS: <span className="tabular-nums font-semibold" style={{ color: rsColor(s.RS_Rating) }}>{s.RS_Rating}</span></span>
                      <span className="text-white/40 flex items-center gap-1.5">Trend Template: <TrendTemplateChecks entry={s} /></span>
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
