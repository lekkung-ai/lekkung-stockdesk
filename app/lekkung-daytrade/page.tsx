'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  lekkungDaytradeData, lekkungDaytradeGeneratedAt, lekkungDaytradeUniverse,
  techRatingLabel, analystRatingLabel, analystRatingRank,
  type LekkungDaytradeEntry,
} from '@/lib/lekkungDaytradeData';
import { daysInScan } from '@/lib/scanDays';
import { tickerToSector } from '@/lib/sectorData';
import { stockNames } from '@/lib/stockNames';
import { formatThaiDate } from '@/lib/utils';
import { useInfiniteRows } from '@/lib/useInfiniteRows';
import { getScanDiff } from '@/lib/scanDiff';
import { lekkungDaytradeHistory } from '@/lib/scanHistoryData/lekkungDaytrade';
import { computeScanMarkers } from '@/lib/scanMarkers';
import FullWidthPage from '@/components/FullWidthPage';
import MobileScanProgress from '@/components/MobileScanProgress';
import ScrollToTopButton from '@/components/ScrollToTopButton';
import {
  Td, TableWrap, FilterBar, PageHeader, SortableTh, SortConfig,
  formatPE, ExportCSVButton, AddMyStockButton,
} from '@/components/StrategyTable';
import StockChart from '@/components/StockChart';
import ScanHistoryView from '@/components/ScanHistoryView';
import ModeToggle from '@/components/ModeToggle';
import StaleDataBanner from '@/components/StaleDataBanner';
import ScanDiffChips, { DiffFilter } from '@/components/ScanDiffChips';
import DroppedTickersList from '@/components/DroppedTickersList';
import NewBadge from '@/components/NewBadge';

const SCAN_KEY = 'lekkung_daytrade';
const COLS = 11; // colSpan ของแถว chart / loading / empty

type Row = LekkungDaytradeEntry;
type SortValue = number | string | null;

const fmt = (v: number | null, nd = 2) =>
  v == null ? '—' : v.toLocaleString(undefined, { minimumFractionDigits: nd, maximumFractionDigits: nd });
const fmtInt = (v: number | null) => (v == null ? '—' : v.toLocaleString(undefined, { maximumFractionDigits: 0 }));
const fmtSigned = (v: number | null, nd = 2, suffix = '%') =>
  v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(nd)}${suffix}`;

const sectorOf = (t: string) => tickerToSector[t]?.sector ?? '';
const nameOf = (r: Row) => stockNames[r.Ticker] ?? r.Name ?? '';

// ค่าที่ใช้ sort — string field ที่ null = '' · number ที่ null = null (ไปท้ายทั้ง asc/desc)
function sortValue(r: Row, key: string): SortValue {
  switch (key) {
    case 'Ticker': return r.Ticker;
    case 'Name': return nameOf(r);
    case '__sector': return sectorOf(r.Ticker);
    case '__days': return daysInScan(SCAN_KEY, r.Ticker);
    case 'Analyst_Rating': return analystRatingRank(r.Analyst_Rating);
    default: return (r as unknown as Record<string, SortValue>)[key] ?? null;
  }
}

function compareRows(a: Row, b: Row, key: string, dir: 'asc' | 'desc'): number {
  const av = sortValue(a, key);
  const bv = sortValue(b, key);
  if (typeof av === 'string' || typeof bv === 'string') {
    const as = typeof av === 'string' ? av : '';
    const bs = typeof bv === 'string' ? bv : '';
    return dir === 'asc' ? as.localeCompare(bs) : bs.localeCompare(as);
  }
  if (av == null && bv == null) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;
  return dir === 'asc' ? av - bv : bv - av;
}

const techCls = (v: number | null) => (v != null && v > 0.5 ? 'text-[#1D9E75] font-semibold' : 'text-white/80');
const analystCls = (v: string | null) =>
  v === 'StrongBuy' ? 'text-[#1D9E75] font-semibold' : v === 'Buy' ? 'text-[#1D9E75]' : 'text-white/70';

export default function LekkungDaytradePage() {
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'Change_Pct', dir: 'desc' });
  const [mode, setMode] = useState<'today' | 'history'>('today');
  const [historyInitialTicker, setHistoryInitialTicker] = useState<string | null>(null);
  const [diffFilter, setDiffFilter] = useState<DiffFilter>('all');
  const newSet = useMemo(() => new Set(getScanDiff(SCAN_KEY)?.newTickers ?? []), []);

  const [containerWidth, setContainerWidth] = useState<number | null>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!tableContainerRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    ro.observe(tableContainerRef.current);
    return () => ro.disconnect();
  }, []);

  const goToHistory = (ticker: string) => {
    setHistoryInitialTicker(ticker);
    setMode('history');
  };

  const handleSort = (key: string) => {
    setSortConfig(prev => (prev?.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }));
  };

  const filtered = useMemo(() => {
    const rows = lekkungDaytradeData.filter(s => diffFilter !== 'new' || newSet.has(s.Ticker));
    if (!sortConfig) return rows;
    return [...rows].sort((a, b) => compareRows(a, b, sortConfig.key, sortConfig.dir));
  }, [sortConfig, diffFilter, newSet]);

  const { isMobile, visibleRows, visibleCount, totalCount, sentinelRef } = useInfiniteRows(
    filtered,
    [sortConfig, diffFilter, newSet]
  );
  const displayRows = isMobile ? visibleRows : filtered;
  const activeTicker = selectedTicker;
  const scanMarkers = useMemo(() => {
    if (!activeTicker) return { firstSeen: null, reentries: [] };
    return computeScanMarkers(lekkungDaytradeHistory.tickers.find(t => t.ticker === activeTicker)?.hitDates);
  }, [activeTicker]);

  const sortProps = { currentSort: sortConfig, onSort: handleSort };
  const secondary = 'hidden min-[1201px]:table-cell';

  return (
    <FullWidthPage className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader
          title="Lekkung Daytrade Scan"
          subtitle="TradingView Momentum Screener (Daily)"
          count={filtered.length}
          updatedAt={formatThaiDate(lekkungDaytradeGeneratedAt)}
          total={lekkungDaytradeData.length}
        />
        <div className="flex items-center gap-3">
          <ExportCSVButton data={filtered} filename="lekkung_daytrade.csv" />
          <ModeToggle mode={mode} onChange={setMode} />
        </div>
      </div>

      <div className="space-y-1 text-label text-white/45 max-w-[110ch]">
        <p>
          <span className="text-white/65 font-medium">เกณฑ์:</span>{' '}
          หุ้นสามัญ (Common stock) ตลาดหลัก · ราคา &gt; 1 บาท · ปิดเหนือ EMA200 · Chg% &gt; 0 · Volume วันนี้ &gt; 1,000,000 หุ้น ·
          RSI(7) &gt; 50 · Avg Volume 10 วัน 1–50 ล้านหุ้น · ADX(14) &gt; 20 · Tech Rating ≥ Buy (Recommend.All ≥ 0.1)
          {lekkungDaytradeUniverse != null && <> · จากหุ้นทั้งหมด {lekkungDaytradeUniverse.toLocaleString()} ตัว</>}
        </p>
        <p>
          Vol = ปริมาณซื้อขายวันนี้ (หุ้น) · Rel Vol = Volume ÷ ค่าเฉลี่ย 10 วัน (เท่า) · Mkt Cap = มูลค่าตลาด (ล้านบาท) ·
          P/E และ EPS = TTM (EPS เป็นบาท/หุ้น, pro-forma diluted) · EPS Growth = เติบโตเทียบปีก่อน (%) · Div Yield = อัตราปันผลล่าสุด (%) ·
          %เหนือ EMA200 = (ราคา ÷ EMA200 − 1) × 100
        </p>
        <p>
          Tech Rating = สัญญาณเทคนิคของ TradingView (Strong Buy เมื่อ &gt; 0.5) ·
          Analyst Rating = ความเห็นนักวิเคราะห์ — คนละตัวกัน · ข้อมูลจาก TradingView ณ เวลาที่ pipeline รัน ไม่ใช่ราคาสด
        </p>
      </div>

      <StaleDataBanner generatedAt={lekkungDaytradeGeneratedAt} />

      {mode === 'history' ? (
        <ScanHistoryView data={lekkungDaytradeHistory} initialTicker={historyInitialTicker} />
      ) : (
      <>
      <FilterBar>
        <ScanDiffChips scanName={SCAN_KEY} filter={diffFilter} onChange={setDiffFilter} />
      </FilterBar>

      {diffFilter === 'dropped' ? (
        <DroppedTickersList scanName={SCAN_KEY} />
      ) : (
      <div ref={tableContainerRef} className="space-y-4">
      <MobileScanProgress shown={visibleCount} total={totalCount} />
      <TableWrap>
        <thead className="border-b border-white/[0.06] bg-white/[0.015] [&_th]:!px-2.5">
          {/* Symbol เป็น first-child (TableWrap ปักหมุดซ้ายให้) · คอลัมน์รองซ่อนที่ ≤1200px
              (ครอบ iPad Air 1180) แล้วไปโผล่ใน strip ของแถวที่กางออก — เหมือน 7 หน้า scan เดิม */}
          <tr>
            <SortableTh sortKey="Ticker" {...sortProps}>Symbol</SortableTh>
            <SortableTh right sortKey="Close" {...sortProps} title="ราคาปิด/ล่าสุดจาก TradingView ณ เวลาที่ pipeline รัน">Price</SortableTh>
            <SortableTh right sortKey="__days" {...sortProps} title="จำนวนวันทำการติดกันที่อยู่ในสแกนนี้">Days</SortableTh>
            <SortableTh right sortKey="Change_Pct" {...sortProps} title="% เปลี่ยนแปลงวันนี้">Chg%</SortableTh>
            <SortableTh right sortKey="Volume" {...sortProps} title="ปริมาณซื้อขายวันนี้ (หุ้น)">Vol</SortableTh>
            <SortableTh right sortKey="Tech_Rating" {...sortProps} title="TradingView Technical Rating (Recommend.All) · Strong Buy > 0.5">Tech Rating</SortableTh>
            <SortableTh right className={secondary} sortKey="Market_Cap" {...sortProps} title="มูลค่าตลาด (ล้านบาท)">Mkt Cap (MB)</SortableTh>
            <SortableTh right className={secondary} sortKey="PE_Ratio" {...sortProps} title="P/E (TTM)">P/E</SortableTh>
            <SortableTh right className={secondary} sortKey="EPS_TTM" {...sortProps} title="กำไรต่อหุ้น TTM (บาท)">EPS (TTM)</SortableTh>
            <SortableTh right className={secondary} sortKey="EPS_Growth_YoY" {...sortProps} title="การเติบโตของ EPS TTM เทียบปีก่อน (%)">EPS Gr YoY</SortableTh>
            <SortableTh right className={secondary} sortKey="Div_Yield" {...sortProps} title="อัตราปันผลล่าสุด (%)">Div Yield</SortableTh>
          </tr>
        </thead>
        <tbody className="[&_td]:!px-2.5">
          {displayRows.map((s, i) => {
            const isActive = activeTicker === s.Ticker;
            const techLabel = techRatingLabel(s.Tech_Rating);
            const analyst = analystRatingLabel(s.Analyst_Rating);
            return (
              <React.Fragment key={s.Ticker}>
              <tr
                onClick={() => setSelectedTicker(isActive ? null : s.Ticker)}
                className={`border-b border-white/[0.04] transition-colors cursor-pointer group ${
                  isActive ? 'bg-emerald-500/10 border-l-4 border-l-emerald-500 font-medium' : 'hover:bg-white/[0.02]'
                }`}
              >
                <Td>
                  <div className="flex items-center gap-2">
                    <span className="text-white/25 tabular-nums text-[11px] shrink-0">{i + 1}</span>
                    <div
                      className={`font-bold flex items-center gap-1.5 ${isActive ? 'text-emerald-400' : 'text-white'}`}
                      title={nameOf(s) || s.Ticker}
                    >
                      <Link
                        href={`/stock/${s.Ticker}`}
                        onClick={e => e.stopPropagation()}
                        className="hover:underline underline-offset-2"
                        title={nameOf(s) || s.Ticker}
                      >
                        {s.Ticker}
                      </Link>
                      {newSet.has(s.Ticker) && <NewBadge />}
                    </div>
                    <AddMyStockButton ticker={s.Ticker} />
                  </div>
                </Td>
                <Td right mono>{fmt(s.Close)}</Td>
                <Td right mono>
                  <span
                    onClick={e => { e.stopPropagation(); goToHistory(s.Ticker); }}
                    title="ดูประวัติการติด scan ย้อนหลัง"
                    className="text-white/60 hover:text-white underline decoration-dotted underline-offset-2 cursor-pointer"
                  >
                    {daysInScan(SCAN_KEY, s.Ticker) ?? '—'}
                  </span>
                </Td>
                <Td right mono>
                  <span className={s.Change_Pct != null && s.Change_Pct > 0 ? 'text-[#1D9E75] font-semibold' : 'text-white/70'}>
                    {fmtSigned(s.Change_Pct)}
                  </span>
                </Td>
                <Td right mono>{fmtInt(s.Volume)}</Td>
                <Td right mono>
                  <div className="flex flex-col items-end leading-tight">
                    <span className={techCls(s.Tech_Rating)}>{techLabel ?? '—'}</span>
                    <span className="text-label text-white/35">{s.Tech_Rating != null ? s.Tech_Rating.toFixed(2) : ''}</span>
                  </div>
                </Td>
                <Td right mono className={secondary}>{s.Market_Cap != null ? fmtInt(s.Market_Cap / 1e6) : '—'}</Td>
                <Td right mono className={secondary}>{formatPE(s.PE_Ratio)}</Td>
                <Td right mono className={secondary}>{fmt(s.EPS_TTM)}</Td>
                <Td right mono className={secondary}>
                  <span className={s.EPS_Growth_YoY != null && s.EPS_Growth_YoY > 20 ? 'text-[#1D9E75]' : s.EPS_Growth_YoY != null && s.EPS_Growth_YoY < 0 ? 'text-[#E24B4A]' : ''}>
                    {fmtSigned(s.EPS_Growth_YoY, 1)}
                  </span>
                </Td>
                <Td right mono className={secondary}>{s.Div_Yield != null ? `${s.Div_Yield.toFixed(2)}%` : '—'}</Td>
              </tr>
              {isActive && (
                <tr key={`${s.Ticker}-chart`} className="bg-black/20 border-b border-white/[0.04]">
                  <td colSpan={COLS} className="py-4 px-2 sm:px-4">
                    <div
                      className="sticky left-2 sm:left-4 bg-[#13161e] border border-emerald-500/25 rounded-xl p-4 shadow-xl space-y-3"
                      style={{
                        width: containerWidth ? `${containerWidth - (isMobile ? 16 : 32)}px` : '100%',
                        maxWidth: containerWidth ? `${containerWidth - (isMobile ? 16 : 32)}px` : '100%',
                      }}
                    >
                      <div className="flex items-center justify-between gap-3 flex-wrap border-b border-white/[0.06] pb-3">
                        <div className="flex items-center gap-3 flex-wrap">
                          <h2 className="text-section font-extrabold text-white tracking-wide">{s.Ticker}</h2>
                          <span className="text-label text-white/40">{nameOf(s)}</span>
                          {scanMarkers.firstSeen && (
                            <span className="text-label font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1">
                              <span>📍 เจอครั้งแรก:</span>
                              <span>{formatThaiDate(scanMarkers.firstSeen)}</span>
                            </span>
                          )}
                          {scanMarkers.reentries.length > 0 && (
                            <span className="text-label font-semibold px-2.5 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 flex items-center gap-1">
                              <span>🔄 เจอใหม่:</span>
                              <span>{formatThaiDate(scanMarkers.reentries[scanMarkers.reentries.length - 1])}</span>
                            </span>
                          )}
                        </div>
                        <button
                          onClick={e => { e.stopPropagation(); setSelectedTicker(null); }}
                          className="text-label font-medium text-white/50 hover:text-white px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                        >
                          ปิดกราฟ
                        </button>
                      </div>
                      {/* แถบข้อมูลคอลัมน์ที่ย้ายออกจากตาราง + คอลัมน์รองที่ซ่อนบนจอแคบ */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-label border-b border-white/[0.06] pb-3">
                        <span className="text-white/40">Sector: <span className="font-semibold text-white/80">{sectorOf(s.Ticker) || '—'}</span></span>
                        <span className="text-white/40">Rel Vol: <span className={`tabular-nums font-semibold ${s.Rel_Volume != null && s.Rel_Volume >= 2 ? 'text-amber-400' : 'text-white/80'}`}>{s.Rel_Volume != null ? `${s.Rel_Volume.toFixed(2)}x` : '—'}</span></span>
                        <span className="text-white/40">RSI (7): <span className="tabular-nums font-semibold text-white/80">{fmt(s.RSI7, 1)}</span></span>
                        <span className="text-white/40">ADX (14): <span className="tabular-nums font-semibold text-white/80">{fmt(s.ADX, 1)}</span></span>
                        <span className="text-white/40">% เหนือ EMA200: <span className="tabular-nums font-semibold text-white/80">{fmtSigned(s.Pct_Above_EMA200, 1)}</span></span>
                        <span className="text-white/40">Analyst Rating: <span className={`font-semibold ${analystCls(s.Analyst_Rating)}`}>{analyst ?? '—'}</span></span>
                        {/* คอลัมน์รองที่ซ่อนบนจอ ≤1200 — โชว์ตรงนี้เพิ่มเมื่อจอแคบ */}
                        <span className="min-[1201px]:hidden text-white/40">Mkt Cap: <span className="tabular-nums font-semibold text-white/80">{s.Market_Cap != null ? `${fmtInt(s.Market_Cap / 1e6)} MB` : '—'}</span></span>
                        <span className="min-[1201px]:hidden text-white/40">P/E (TTM): <span className="tabular-nums font-semibold text-white/80">{s.PE_Ratio != null ? s.PE_Ratio.toFixed(1) : '—'}</span></span>
                        <span className="min-[1201px]:hidden text-white/40">EPS (TTM): <span className="tabular-nums font-semibold text-white/80">{fmt(s.EPS_TTM)}</span></span>
                        <span className="min-[1201px]:hidden text-white/40">EPS Gr YoY: <span className={`tabular-nums font-semibold ${s.EPS_Growth_YoY != null && s.EPS_Growth_YoY > 20 ? 'text-[#1D9E75]' : s.EPS_Growth_YoY != null && s.EPS_Growth_YoY < 0 ? 'text-[#E24B4A]' : 'text-white/80'}`}>{fmtSigned(s.EPS_Growth_YoY, 1)}</span></span>
                        <span className="min-[1201px]:hidden text-white/40">Div Yield: <span className="tabular-nums font-semibold text-white/80">{s.Div_Yield != null ? `${s.Div_Yield.toFixed(2)}%` : '—'}</span></span>
                      </div>
                      <StockChart
                        ticker={s.Ticker}
                        height={340}
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
              <td colSpan={COLS} className="py-3 text-center text-[11px] text-white/25">
                กำลังโหลดเพิ่ม…
              </td>
            </tr>
          )}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={COLS} className="py-12 text-center text-label text-white/25">
                {lekkungDaytradeData.length === 0
                  ? 'วันนี้ไม่มีหุ้นผ่านเกณฑ์ทั้งหมด'
                  : 'ไม่พบหุ้นที่ตรงกับ filter'}
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
    </FullWidthPage>
  );
}
