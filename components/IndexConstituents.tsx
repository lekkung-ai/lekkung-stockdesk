'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import MiniCandleChart from '@/components/MiniCandleChart';
import { scanData } from '@/lib/scanData';
import { getSectorForTicker } from '@/lib/sectorData';
import { peColor } from '@/lib/utils';
import marketStageRaw from '@/data/scans/market_stage.json';

interface Item {
  symbol: string;
  last: number;
  change: number;
  percentChange: number;
  marketCap: number | null;
  pe: number | null;
  pb: number | null;
  divYield: number | null;
  sectorCode: string;
  nameTH: string;
}

const INDEX_NAMES: Record<string, string> = { set50: 'SET50', set100: 'SET100' };

const sigMap = new Map(scanData.map(e => [e.ticker.toUpperCase(), e]));
const stageMap = new Map(
  (marketStageRaw as Array<{ Ticker: string; Stage: string }>).map(e => [e.Ticker.toUpperCase(), e.Stage])
);

const STAGE: Record<string, { color: string; bg: string }> = {
  'S.Bull':       { color: '#1D9E75', bg: 'rgba(29,158,117,.15)' },
  'Bull':         { color: '#4CAF50', bg: 'rgba(76,175,80,.15)' },
  'Recovery':     { color: '#EF9F27', bg: 'rgba(239,159,39,.15)' },
  'Accumulation': { color: '#378ADD', bg: 'rgba(55,138,221,.15)' },
  'Distribution': { color: '#BA7517', bg: 'rgba(186,117,23,.15)' },
  'Warning':      { color: '#EF9F27', bg: 'rgba(239,159,39,.15)' },
  'Bear':         { color: '#E24B4A', bg: 'rgba(226,75,74,.15)' },
  'UNKNOWN':      { color: '#9CA3AF', bg: 'rgba(156,163,175,.15)' },
  'Unknown':      { color: '#9CA3AF', bg: 'rgba(156,163,175,.15)' },
};

type SortCol = 'symbol' | 'price' | 'change' | 'pe' | 'marketCap' | 'sector';

function fmtPrice(n: number | null): string {
  if (n == null) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtMktCap(v: number | null): string {
  if (v == null) return '—';
  if (v >= 1e12) return (v / 1e12).toFixed(2) + 'T';
  if (v >= 1e9)  return (v / 1e9).toFixed(1) + 'B';
  if (v >= 1e6)  return (v / 1e6).toFixed(0) + 'M';
  return v.toFixed(0);
}

function getStage(sym: string): string {
  const key = sym.toUpperCase();
  return sigMap.get(key)?.stage || stageMap.get(key) || '';
}

const mkBadge = (text: string, color: string, bg: string) => (
  <span
    style={{
      color,
      background: bg,
      border: `1px solid ${color}55`,
      borderRadius: 3,
      padding: '0 3px',
      fontSize: 9,
      fontWeight: 700,
      lineHeight: '14px',
    }}
  >
    {text}
  </span>
);

function ScanBadges({ sym }: { sym: string }) {
  const e = sigMap.get(sym.toUpperCase());
  if (!e || (!e.sepa && !e.kell && !e.breakout)) {
    return <span className="text-[11px] text-white/20">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-[3px]">
      {e.sepa     && mkBadge('SEPA', '#1D9E75', 'rgba(29,158,117,.15)')}
      {e.kell     && mkBadge('Kell', '#4CAF50', 'rgba(76,175,80,.15)')}
      {e.breakout && mkBadge('BO',   '#378ADD', 'rgba(55,138,221,.15)')}
    </div>
  );
}

function StageBadge({ sym }: { sym: string }) {
  const stage = getStage(sym);
  const style = stage ? STAGE[stage] : null;
  if (!stage || !style) return <span className="text-[11px] text-white/20">—</span>;
  return mkBadge(stage, style.color, style.bg);
}

export default function IndexConstituents({ index }: { index: string }) {
  const router = useRouter();
  const idxName = INDEX_NAMES[index.toLowerCase()] ?? index.toUpperCase();

  const [items, setItems]     = useState<Item[] | null>(null);
  const [error, setError]     = useState(false);
  const [filterSym, setFilterSym]       = useState('');
  const [filterScan, setFilterScan]     = useState<Set<string>>(new Set());
  const [filterStage, setFilterStage]   = useState('');
  const [filterSector, setFilterSector] = useState('');
  const [sortCol, setSortCol]   = useState<SortCol>('marketCap');
  const [sortDir, setSortDir]   = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    let active = true;
    setItems(null);
    setError(false);
    fetch(`/api/index-composition/${index}`)
      .then(r => r.json())
      .then(d => {
        if (!active) return;
        if (Array.isArray(d.items) && d.items.length) setItems(d.items);
        else { setItems([]); setError(true); }
      })
      .catch(() => { if (active) { setItems([]); setError(true); } });
    return () => { active = false; };
  }, [index]);

  const allStages = useMemo(() => {
    if (!items) return [];
    const s = new Set<string>();
    items.forEach(r => { const st = getStage(r.symbol); if (st) s.add(st); });
    return Array.from(s).sort();
  }, [items]);

  const toggleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  };

  const toggleScan = (s: string) => {
    setFilterScan(prev => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
  };

  const hasFilter = filterSym || filterScan.size > 0 || filterStage || filterSector;

  const clearFilters = () => {
    setFilterSym('');
    setFilterScan(new Set());
    setFilterStage('');
    setFilterSector('');
  };

  const sortIcon = (col: SortCol) => {
    if (sortCol !== col) return <ArrowUpDown size={9} className="text-white/20 shrink-0" />;
    return sortDir === 'asc'
      ? <ArrowUp   size={9} className="text-[#1D9E75] shrink-0" />
      : <ArrowDown size={9} className="text-[#1D9E75] shrink-0" />;
  };

  const rows = useMemo(() => {
    if (!items) return [];
    let result = [...items];

    if (filterSym.trim()) {
      const q = filterSym.trim().toUpperCase();
      result = result.filter(r => r.symbol.toUpperCase().includes(q));
    }
    if (filterScan.size > 0) {
      result = result.filter(r => {
        const e = sigMap.get(r.symbol.toUpperCase());
        if (!e) return false;
        if (filterScan.has('SEPA') && e.sepa)     return true;
        if (filterScan.has('Kell') && e.kell)     return true;
        if (filterScan.has('BO')   && e.breakout) return true;
        return false;
      });
    }
    if (filterStage) {
      result = result.filter(r => getStage(r.symbol) === filterStage);
    }
    if (filterSector.trim()) {
      const q = filterSector.trim().toUpperCase();
      result = result.filter(r => {
        const sec = getSectorForTicker(r.symbol.toUpperCase())?.sector ?? r.sectorCode;
        return sec.toUpperCase().includes(q);
      });
    }

    result.sort((a, b) => {
      let av: number | string;
      let bv: number | string;
      switch (sortCol) {
        case 'symbol':    av = a.symbol;         bv = b.symbol;         break;
        case 'price':     av = a.last;            bv = b.last;           break;
        case 'change':    av = a.percentChange ?? 0; bv = b.percentChange ?? 0; break;
        case 'pe':        av = a.pe ?? -Infinity; bv = b.pe ?? -Infinity; break;
        case 'sector': {
          av = getSectorForTicker(a.symbol.toUpperCase())?.sector ?? a.sectorCode;
          bv = getSectorForTicker(b.symbol.toUpperCase())?.sector ?? b.sectorCode;
          break;
        }
        default:          av = a.marketCap ?? 0; bv = b.marketCap ?? 0;
      }
      if (typeof av === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
      }
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });

    return result;
  }, [items, filterSym, filterScan, filterStage, filterSector, sortCol, sortDir]);

  const thBase  = 'px-2 pt-2.5 pb-2 text-left text-[12px] font-semibold uppercase tracking-wider text-white/25 align-top';
  const thRight = 'px-2 pt-2.5 pb-2 text-right text-[12px] font-semibold uppercase tracking-wider text-white/25 align-top';
  const inputCls  = 'mt-1 block text-[12px] bg-white/[0.05] border border-white/10 rounded px-1.5 py-[1px] text-white/55 placeholder-white/20 outline-none focus:border-white/25 transition-colors';
  const selectCls = 'mt-1 block w-full text-[12px] bg-[#0d0f16] border border-white/10 rounded px-1 py-[1px] text-white/55 outline-none focus:border-white/25 transition-colors';

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-2 -ml-2 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/[0.05] transition-colors"
          aria-label="ย้อนกลับ"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <h1 className="text-[18px] font-bold text-white">{idxName}</h1>
          <p className="text-[12px] text-white/35 mt-0.5">
            หุ้นในดัชนี {idxName}
            {items && items.length > 0
              ? ` · แสดง ${rows.length}/${items.length} ตัว`
              : ''}
          </p>
        </div>
        {hasFilter && (
          <button
            onClick={clearFilters}
            className="text-[11px] text-white/40 hover:text-white/70 border border-white/15 hover:border-white/30 rounded-lg px-2.5 py-1 transition-colors shrink-0"
          >
            ล้างตัวกรอง
          </button>
        )}
      </div>

      <div className="bg-[#13161e] border border-white/[0.07] rounded-xl overflow-hidden">
        {items === null ? (
          <div className="px-5 py-12 text-center">
            <span className="text-[12px] text-white/25 animate-pulse">กำลังโหลด...</span>
          </div>
        ) : error && items.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-[13px] text-white/30">โหลดรายชื่อหุ้นไม่สำเร็จ ลองใหม่อีกครั้ง</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                  {/* # */}
                  <th className={thBase} style={{ width: 32 }}>#</th>

                  {/* SYMBOL — sortable + text filter */}
                  <th className={thBase} style={{ minWidth: 90 }}>
                    <div
                      className="flex items-center gap-1 cursor-pointer select-none"
                      onClick={() => toggleSort('symbol')}
                    >
                      Symbol {sortIcon('symbol')}
                    </div>
                    <input
                      value={filterSym}
                      onChange={e => setFilterSym(e.target.value)}
                      placeholder="ค้นหา..."
                      className={inputCls}
                      style={{ width: 62 }}
                      onClick={e => e.stopPropagation()}
                    />
                  </th>

                  {/* PRICE — sortable */}
                  <th className={thRight} style={{ minWidth: 80 }}>
                    <div
                      className="flex items-center justify-end gap-1 cursor-pointer select-none"
                      onClick={() => toggleSort('price')}
                    >
                      {sortIcon('price')} Price
                    </div>
                  </th>

                  {/* %CHG — sortable */}
                  <th className={thRight} style={{ minWidth: 70 }}>
                    <div
                      className="flex items-center justify-end gap-1 cursor-pointer select-none"
                      onClick={() => toggleSort('change')}
                    >
                      {sortIcon('change')} %Chg
                    </div>
                  </th>

                  {/* SCAN — chip filter */}
                  <th className={`${thBase} hidden sm:table-cell`} style={{ minWidth: 108 }}>
                    Scan
                    <div className="flex gap-1 mt-1.5">
                      {(['SEPA', 'Kell', 'BO'] as const).map(s => (
                        <button
                          key={s}
                          onClick={() => toggleScan(s)}
                          className="text-[11px] px-1.5 py-0.5 rounded font-bold border transition-colors"
                          style={
                            filterScan.has(s)
                              ? { background: '#1D9E75', color: '#fff', borderColor: '#1D9E75' }
                              : { background: 'transparent', color: 'rgba(255,255,255,0.35)', borderColor: 'rgba(255,255,255,0.15)' }
                          }
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </th>

                  {/* STAGE — select filter */}
                  <th className={thBase} style={{ minWidth: 115 }}>
                    Stage
                    <select
                      value={filterStage}
                      onChange={e => setFilterStage(e.target.value)}
                      className={selectCls}
                    >
                      <option value="">ทั้งหมด</option>
                      {allStages.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </th>

                  {/* P/E — sortable */}
                  <th className={`${thRight} hidden sm:table-cell`} style={{ minWidth: 60 }}>
                    <div
                      className="flex items-center justify-end gap-1 cursor-pointer select-none"
                      onClick={() => toggleSort('pe')}
                    >
                      {sortIcon('pe')} P/E
                    </div>
                  </th>

                  {/* MKT CAP — sortable */}
                  <th className={`${thRight} hidden sm:table-cell`} style={{ minWidth: 82 }}>
                    <div
                      className="flex items-center justify-end gap-1 cursor-pointer select-none whitespace-nowrap"
                      onClick={() => toggleSort('marketCap')}
                    >
                      {sortIcon('marketCap')} Mkt Cap
                    </div>
                  </th>

                  {/* SECTOR — sortable + text filter (hidden on mobile) */}
                  <th className={`${thBase} hidden sm:table-cell`} style={{ minWidth: 95 }}>
                    <div
                      className="flex items-center gap-1 cursor-pointer select-none"
                      onClick={() => toggleSort('sector')}
                    >
                      Sector {sortIcon('sector')}
                    </div>
                    <input
                      value={filterSector}
                      onChange={e => setFilterSector(e.target.value)}
                      placeholder="ค้นหา..."
                      className={inputCls}
                      style={{ width: 82 }}
                      onClick={e => e.stopPropagation()}
                    />
                  </th>

                  {/* CHART — no filter, no sort */}
                  <th className={`${thBase} hidden lg:table-cell`} style={{ minWidth: 160 }}>
                    Chart
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-5 py-10 text-center text-[13px] text-white/30">
                      ไม่พบหุ้นที่ตรงกับเงื่อนไข
                    </td>
                  </tr>
                ) : (
                  rows.map((r, i) => {
                    const pct = r.percentChange ?? 0;
                    const up = pct >= 0;
                    const sector = getSectorForTicker(r.symbol.toUpperCase())?.sector ?? r.sectorCode ?? '';
                    return (
                      <tr
                        key={r.symbol}
                        onClick={() => router.push(`/stock/${r.symbol}`)}
                        className="cursor-pointer transition-colors hover:bg-white/[0.025]"
                        style={{ borderBottom: '1px solid rgba(255,255,255,.04)' }}
                      >
                        <td className="px-2 py-2.5 text-[13px] text-white/25 tabular-nums">{i + 1}</td>
                        <td className="px-2 py-2.5">
                          <span className="text-[14px] font-bold text-white">{r.symbol}</span>
                        </td>
                        <td className="px-2 py-2.5 text-[14px] text-white/75 text-right tabular-nums whitespace-nowrap">
                          {fmtPrice(r.last)}
                        </td>
                        <td
                          className="px-2 py-2.5 text-[14px] text-right tabular-nums font-semibold whitespace-nowrap"
                          style={{ color: up ? '#1D9E75' : '#E24B4A' }}
                        >
                          {r.percentChange != null ? `${up ? '+' : ''}${pct.toFixed(2)}%` : '—'}
                        </td>
                        <td className="px-2 py-2.5 hidden sm:table-cell">
                          <ScanBadges sym={r.symbol} />
                        </td>
                        <td className="px-2 py-2.5">
                          <StageBadge sym={r.symbol} />
                        </td>
                        <td
                          className="px-2 py-2.5 text-[13px] text-right tabular-nums whitespace-nowrap hidden sm:table-cell"
                          style={{ color: peColor(r.pe) || 'rgba(255,255,255,0.6)' }}
                        >
                          {r.pe != null ? r.pe.toFixed(2) : '—'}
                        </td>
                        <td className="px-2 py-2.5 text-[13px] text-white/60 text-right tabular-nums whitespace-nowrap hidden sm:table-cell">
                          {fmtMktCap(r.marketCap)}
                        </td>
                        <td className="px-2 py-2.5 text-[12px] text-white/45 hidden sm:table-cell whitespace-nowrap">
                          {sector}
                        </td>
                        <td
                          className="hidden lg:table-cell"
                          style={{ paddingTop: 4, paddingBottom: 4, paddingLeft: 8, paddingRight: 8 }}
                        >
                          <MiniCandleChart ticker={r.symbol} width="100%" height={64} />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
