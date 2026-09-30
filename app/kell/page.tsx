'use client';

import React, { useState, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { kellData } from '@/lib/strategyData';
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
import { scanData } from '@/lib/scanData';

function distColor(dist: number): string {
  if (dist <= 2) return '#1D9E75';
  if (dist <= 5) return '#EF9F27';
  return '#E24B4A';
}

// ADTV ของหุ้นเป็นตัวเลขจางใต้ชื่อ แทนป้าย "ADTV ต่ำ" (floor 10 ลบ./วัน ของ pipeline) — ป้ายนั้น
// ขัดกับชุดสภาพคล่องของหน้านี้ (หุ้น 6–10 MB อยู่ชุด "สูง" แต่ติดป้าย "ต่ำ") · ไม่มีค่า → ไม่แสดง
// Kell คำนวณ ADTV เฉลี่ย 5 วัน (scan_oliver_kell.py) ต่างจาก SEPA ที่ใช้ 50 วัน
function AdtvCaption({ adtvMb }: { adtvMb: number | null | undefined }) {
  if (adtvMb == null) return null;
  return (
    <div className="text-[10px] text-white/30 tabular-nums" title="ADTV เฉลี่ย 5 วัน (ล้านบาท/วัน)">
      ADTV {adtvMb.toFixed(1)} MB
    </div>
  );
}

// oliver_kell.json ไม่มี RS_Rating — ดึง rs_score จาก combined.json (ตัวเดียวกับที่ SEPA ใช้;
// ตรวจแล้ว rs_score ครบทุก ticker ใน Kell และตรงกับ RS_Rating ของ SEPA 100%)
const RS_BY_TICKER = new Map(scanData.map(s => [s.ticker, s.rs_score]));
const rsOf = (ticker: string): number | null => RS_BY_TICKER.get(ticker) ?? null;

// ชุดสภาพคล่องตาม ADTV(MB) (ลบ./วัน) — เลือกได้ทีละชุด ผูกกับ ?liq= ใน URL (ค่าเดียวกับ /sepa)
// ขอบเขต: สูง ≥ LIQ_HIGH_MB · กลาง LIQ_MID_MB ถึง < LIQ_HIGH_MB · ต่ำ < LIQ_MID_MB
// หุ้นที่ไม่มีค่า ADTV อยู่ในชุด "ทั้งหมด" เท่านั้น · ADTV ของแต่ละตัวแสดงเป็นตัวเลขใต้ชื่อ (AdtvCaption)
const LIQ_HIGH_MB = 6;
const LIQ_MID_MB = 3;
type LiqSet = 'all' | 'high' | 'mid' | 'low';
const LIQ_SETS: LiqSet[] = ['all', 'high', 'mid', 'low'];
const LIQ_DEFAULT: LiqSet = 'high';
const LIQ_LABELS: Record<LiqSet, string> = {
  all: 'ทั้งหมด',
  high: `สูง ≥${LIQ_HIGH_MB} MB`,
  mid: `กลาง ${LIQ_MID_MB}–${LIQ_HIGH_MB} MB`,
  low: `ต่ำ <${LIQ_MID_MB} MB`,
};

function inLiqSet(adtv: number | null | undefined, set: LiqSet): boolean {
  if (set === 'all') return true;
  if (adtv == null) return false;
  if (set === 'high') return adtv >= LIQ_HIGH_MB;
  if (set === 'mid') return adtv >= LIQ_MID_MB && adtv < LIQ_HIGH_MB;
  return adtv < LIQ_MID_MB;
}

// Kell ไม่มีเกณฑ์ RS ในสแกน (RS ของหุ้นใน Kell มีตั้งแต่ 30 กว่าถึง 99 และเปลี่ยนทุกวัน) — ค่าต่ำสุด
// ของ slider = ค่าเริ่มต้น = RS ต่ำสุดในข้อมูลวันนี้ (ปัดลง) → เปิดหน้ามาไม่ซ่อนหุ้นตัวไหน · ไม่มี RS เลย → 0
const RS_VALUES = kellData.map(s => rsOf(s.Ticker)).filter((v): v is number => v != null && Number.isFinite(v));
const RS_FLOOR = RS_VALUES.length ? Math.floor(Math.min(...RS_VALUES)) : 0;

type SortMode = 'tight' | 'rs' | 'adtv';
const SORT_LABELS: Record<SortMode, string> = {
  tight: 'แนบ EMA10 (ค่าเริ่มต้น)',
  rs: 'RS Rating',
  adtv: 'ADTV (สภาพคล่อง)',
};

export default function KellPage() {
  return (
    <Suspense fallback={null}>
      <KellContent />
    </Suspense>
  );
}

function KellContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawLiq = searchParams.get('liq');
  const liq: LiqSet = rawLiq && (LIQ_SETS as string[]).includes(rawLiq) ? (rawLiq as LiqSet) : LIQ_DEFAULT;
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const [mode, setMode] = useState<'today' | 'history'>('today');
  const [diffFilter, setDiffFilter] = useState<DiffFilter>('all');
  const [rsMin, setRsMin] = useState(RS_FLOOR);
  const [sortMode, setSortMode] = useState<SortMode>('tight');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 10;
  const { priceMap, fetchDone } = useLivePrices(kellData.map(s => s.Ticker));
  const newSet = useMemo(() => new Set(getScanDiff('kell')?.newTickers ?? []), []);

  const kellHistory = useMemo(() => getScanHistory('kell'), []);

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

  // ?liq= ใน URL ให้ refresh / แชร์ลิงก์แล้วได้ชุดเดิม · ค่าเริ่มต้น (high) ไม่ใส่ใน URL
  const handleLiqChange = (val: LiqSet) => {
    setCurrentPage(1);
    const params = new URLSearchParams(searchParams.toString());
    if (val === LIQ_DEFAULT) params.delete('liq');
    else params.set('liq', val);
    const qs = params.toString();
    router.replace(qs ? `/kell?${qs}` : '/kell', { scroll: false });
  };

  const handleSortModeChange = (val: SortMode) => {
    setCurrentPage(1);
    setSortConfig(null); // เลือกโหมดจาก dropdown = ยกเลิกการเรียงตามหัวคอลัมน์
    setSortMode(val);
  };

  const handleShowAll = () => {
    setCurrentPage(1);
    setRsMin(RS_FLOOR);
  };

  // RS slider = "ซ่อน" ฝั่ง client เท่านั้น (ไม่ลบ row) · RS ที่ไม่มีข้อมูลไม่ถูกซ่อนโดยอัตโนมัติ
  // ("ไม่ทราบ" ≠ "ต่ำ") — RS ที่ไม่มีข้อมูลผ่านเฉพาะตอน slider อยู่ค่าต่ำสุด
  const controlled = useMemo(
    () =>
      kellData.filter(s => {
        const rs = rsOf(s.Ticker);
        return rs == null ? rsMin <= RS_FLOOR : rs >= rsMin;
      }),
    [rsMin]
  );
  const hiddenByRs = kellData.length - controlled.length;

  // ตัวกรองอื่น (RS / เข้าใหม่) ก่อน → นับ n ของแต่ละชุดสภาพคล่องจากตรงนี้ → แล้วค่อยกรองชุดที่เลือก
  const preLiq = useMemo(
    () => controlled.filter(s => diffFilter !== 'new' || newSet.has(s.Ticker)),
    [controlled, diffFilter, newSet]
  );
  const liqCounts = useMemo(() => {
    const c: Record<LiqSet, number> = { all: 0, high: 0, mid: 0, low: 0 };
    for (const s of preLiq) for (const k of LIQ_SETS) if (inLiqSet(s['ADTV(MB)'], k)) c[k]++;
    return c;
  }, [preLiq]);

  const filtered = useMemo(() => {
    let result = preLiq.filter(s => inLiqSet(s['ADTV(MB)'], liq));

    if (sortConfig) {
      result = result.sort((a, b) => {
        if (sortConfig.key === '__days') {
          const aVal = daysInScan('kell', a.Ticker) ?? -1;
          const bVal = daysInScan('kell', b.Ticker) ?? -1;
          return sortConfig.dir === 'asc' ? aVal - bVal : bVal - aVal;
        }
        if (sortConfig.key === '__rs') {
          const aVal = rsOf(a.Ticker) ?? -1;
          const bVal = rsOf(b.Ticker) ?? -1;
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
      const tight = (a: (typeof result)[number], b: (typeof result)[number]) =>
        Math.abs(a['Dist_EMA10_%']) - Math.abs(b['Dist_EMA10_%']);
      result = result.sort((a, b) => {
        switch (sortMode) {
          case 'rs':
            return (rsOf(b.Ticker) ?? -1) - (rsOf(a.Ticker) ?? -1) || tight(a, b);
          case 'adtv':
            return (b['ADTV(MB)'] ?? -1) - (a['ADTV(MB)'] ?? -1) || tight(a, b);
          default:
            return tight(a, b);
        }
      });
    }
    return result;
  }, [preLiq, liq, sortConfig, sortMode]);

  const { isMobile, visibleRows, visibleCount, totalCount, sentinelRef } = useInfiniteRows(
    filtered,
    [sortConfig, sortMode, diffFilter, newSet, rsMin, liq]
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
    if (!activeTicker || !kellHistory) return { firstSeen: null, reentries: [] };
    const match = kellHistory.tickers.find(t => t.ticker === activeTicker);
    return computeScanMarkers(match?.hitDates);
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
        <div className="flex items-center gap-3">
          <ReportCardButton scanKey="kell" />
          <ExportCSVButton data={filtered} filename="kell_emac.csv" />
          <ModeToggle mode={mode} onChange={setMode} />
        </div>
      </div>
      <StaleDataBanner generatedAt={getScanGeneratedAt('oliver_kell')} />
      <ScanWarningBanner scanKey="kell" label="Oliver Kell" />
      <ReportCardBar scanKey="kell" />

      {mode === 'history' ? (
        <ScanHistoryView scanName="kell" />
      ) : (
      <>
      <FilterBar>
        <SliderField label="RS Rating" min={RS_FLOOR} max={90} step={10} value={rsMin} onChange={handleRsMinChange} />
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
        <ScanDiffChips scanName="kell" filter={diffFilter} onChange={handleDiffFilterChange} />
        <Divider />
        <div className="flex items-center gap-1.5 flex-wrap" title="ชุดสภาพคล่องตาม ADTV (ลบ./วัน เฉลี่ย 5 วัน) · หุ้นที่ไม่มีค่า ADTV อยู่ในชุด ทั้งหมด เท่านั้น">
          {LIQ_SETS.map(k => (
            <button
              key={k}
              onClick={() => handleLiqChange(k)}
              className={`px-2.5 py-1 rounded-lg text-label font-medium transition-all border ${
                liq === k
                  ? 'bg-[#7F77DD]/15 text-[#7F77DD] border-[#7F77DD]/30'
                  : 'bg-white/[0.04] text-white/35 border-white/[0.06] hover:text-white/60'
              }`}
            >
              {LIQ_LABELS[k]} ({liqCounts[k]})
            </button>
          ))}
        </div>
        <div className="basis-full flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/35">
          {hiddenByRs > 0 && (
            <>
              <span className="text-amber-400/90">
                ซ่อนด้วยตัวกรอง RS {hiddenByRs} ตัว
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
            Composite Score มีเฉพาะ /sepa (เฟส 1) — Kell ยังไม่มี Fundamental / 52W High ใน JSON · RS ดึงจาก combined.json
          </span>
        </div>
      </FilterBar>

      {diffFilter === 'dropped' ? (
        <DroppedTickersList scanName="kell" />
      ) : (
      <div className="space-y-4">
      <MobileScanProgress shown={visibleCount} total={totalCount} />
      <TableWrap>
        <thead className="border-b border-white/[0.06] bg-white/[0.015]">
          {/* responsive: # รวมเข้า Symbol (sticky) · EMA10/ADTV ซ่อน ≤1200 (ครอบ iPad Air)
              เก็บ Signal + %Dist EMA10 + Status ที่เป็นหัวใจ Kell EMAC · strip ใน expand */}
          <tr>
            <SortableTh sortKey="Ticker" currentSort={sortConfig} onSort={handleSort}>Symbol</SortableTh>
            <SortableTh sortKey="Signal" currentSort={sortConfig} onSort={handleSort}>Signal</SortableTh>
            <SortableTh right sortKey="Price" currentSort={sortConfig} onSort={handleSort}>Price</SortableTh>
            <Th right>Trend</Th>
            <SortableTh right sortKey="__days" currentSort={sortConfig} onSort={handleSort}>Days</SortableTh>
            <SortableTh right className="hidden min-[1201px]:table-cell" sortKey="EMA10" currentSort={sortConfig} onSort={handleSort}>EMA10</SortableTh>
            <SortableTh right sortKey="Dist_EMA10_%" currentSort={sortConfig} onSort={handleSort}>% Dist EMA10</SortableTh>
            <SortableTh right className="hidden min-[1201px]:table-cell" sortKey="ADTV(MB)" currentSort={sortConfig} onSort={handleSort}>ADTV (MB)</SortableTh>
            <SortableTh right sortKey="__rs" currentSort={sortConfig} onSort={handleSort}>RS</SortableTh>
            <Th>Status</Th>
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
                      {newSet.has(s.Ticker) && <NewBadge />}
                    </div>
                    <AddMyStockButton ticker={s.Ticker} />
                    {isActive && <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300">กำลังดูอยู่</span>}
                  </div>
                  <AdtvCaption adtvMb={s['ADTV(MB)']} />
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
                <Td right mono className="hidden min-[1201px]:table-cell">{s.EMA10.toFixed(2)}</Td>
                <Td right mono>
                  <span className="font-semibold" style={{ color: distColor(s['Dist_EMA10_%']) }}>
                    {s['Dist_EMA10_%'].toFixed(1)}%
                  </span>
                </Td>
                <Td right mono className="hidden min-[1201px]:table-cell">{s['ADTV(MB)'].toFixed(0)}</Td>
                <Td right mono>
                  {rsOf(s.Ticker) != null ? (
                    <span className="font-semibold" style={{ color: rsColor(rsOf(s.Ticker) as number) }}>{rsOf(s.Ticker)}</span>
                  ) : (
                    <span className="text-white/20">—</span>
                  )}
                </Td>
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
              {activeTicker === s.Ticker && (
                <tr key={`${s.Ticker}-chart`} className="bg-black/20 border-b border-white/[0.04]">
                  <td colSpan={10} className="p-4">
                    <div className="bg-[#13161e] border border-emerald-500/25 rounded-xl p-4 shadow-xl space-y-3">
                      <div className="flex items-center justify-between gap-3 flex-wrap border-b border-white/[0.06] pb-3">
                        <div className="flex items-center gap-3 flex-wrap">
                          <h2 className="text-[18px] font-extrabold text-white tracking-wide">{s.Ticker}</h2>
                          <span className="text-[11.5px] text-white/40">Technical Chart (Oliver Kell Strategy)</span>
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
                        <span className="text-white/40">EMA10: <span className="tabular-nums font-semibold text-white/80">{s.EMA10 != null ? s.EMA10.toFixed(2) : '-'}</span></span>
                        <span className="text-white/40">ADTV: <span className="tabular-nums font-semibold text-white/80">{s['ADTV(MB)'] != null ? s['ADTV(MB)'].toFixed(0) + ' ลบ.' : '-'}</span></span>
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
