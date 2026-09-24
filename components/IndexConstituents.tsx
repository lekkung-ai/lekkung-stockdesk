'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import MiniCandleChart from '@/components/MiniCandleChart';
import { scanData, type ScanEntry } from '@/lib/scanData';
import { getSectorForTicker } from '@/lib/sectorData';
import { peColor } from '@/lib/utils';
import marketStageRaw from '@/data/scans/market_stage.json';

interface Item {
  symbol: string;
  last: number | null;
  change: number | null;
  percentChange: number | null;
  marketCap: number | null;
  pe: number | null;
  pb: number | null;
  divYield: number | null;
  sectorCode: string;
  nameTH: string;
}

const INDEX_TABS = [
  { key: 'set50', label: 'SET50' },
  { key: 'set100', label: 'SET100' },
] as const;

const INDEX_NAMES: Record<string, string> = { set50: 'SET50', set100: 'SET100' };

type MarketStageRow = { Ticker: string; Stage: string; 'ADTV(MB)'?: number | null };

const sigMap = new Map(scanData.map(e => [e.ticker.toUpperCase(), e]));
const stageMap = new Map(
  (marketStageRaw as MarketStageRow[]).map(e => [e.Ticker.toUpperCase(), e])
);

// Same order as the Overview stage bar / PeerComparisonTable (strongest → weakest).
const STAGE_ORDER = ['S.Bull', 'Bull', 'Accumulation', 'Recovery', 'Warning', 'Distribution', 'Bear'];

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

// One row = composition item (always present) + whatever joins from the scan data.
// `scan` is null when the ticker isn't in combined.json — the row is still shown.
interface Row {
  rank: number; // position by market cap within the index
  item: Item;
  scan: ScanEntry | null;
  sector: string;
  stage: string | null;
  adtv: number | null;
}

type SortValue = number | string | null;

interface Column {
  key: string;
  label: string;
  title?: string; // header tooltip
  align: 'left' | 'right' | 'center';
  minWidth: number;
  className?: string; // extra th/td classes (e.g. responsive hide)
  sortValue?: (r: Row) => SortValue; // omit for non-sortable columns
  render: (r: Row) => React.ReactNode;
}

const DASH = <span className="text-white/20">—</span>;

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

function fmtAdtv(v: number | null): string {
  if (v == null) return '—';
  return v >= 100 ? v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : v.toFixed(1);
}

const mkBadge = (text: string, color: string, bg: string) => (
  <span
    style={{
      color,
      background: bg,
      border: `1px solid ${color}55`,
      borderRadius: 3,
      padding: '0 3px',
      fontSize: 10,
      fontWeight: 700,
      lineHeight: '15px',
    }}
  >
    {text}
  </span>
);

function stageRank(stage: string | null): number | null {
  if (!stage) return null;
  const i = STAGE_ORDER.indexOf(stage);
  return i === -1 ? STAGE_ORDER.length : i; // unrecognised labels sort after known stages
}

function boolFlag(scan: ScanEntry | null, key: 'sepa' | 'kell'): number | null {
  return scan ? (scan[key] ? 1 : 0) : null;
}

// Add a column here (e.g. TFEX) and it gets header, sort and null-last handling for free.
const COLUMNS: Column[] = [
  {
    key: 'rank', label: 'Rank', title: 'อันดับตาม Market Cap ในดัชนี', align: 'left', minWidth: 52,
    sortValue: r => r.rank,
    render: r => <span className="text-[13px] text-white/30 tabular-nums">{r.rank}</span>,
  },
  {
    key: 'symbol', label: 'Symbol', align: 'left', minWidth: 80,
    sortValue: r => r.item.symbol,
    render: r => <span className="text-[14px] font-bold text-white">{r.item.symbol}</span>,
  },
  {
    key: 'sector', label: 'Sector', align: 'left', minWidth: 110,
    sortValue: r => r.sector || null,
    render: r => r.sector
      ? <span className="text-[12px] text-white/50 whitespace-nowrap">{r.sector}</span>
      : DASH,
  },
  {
    key: 'price', label: 'Price', align: 'right', minWidth: 72,
    sortValue: r => r.item.last,
    render: r => <span className="text-[14px] text-white/75 tabular-nums">{fmtPrice(r.item.last)}</span>,
  },
  {
    key: 'change', label: '1D%', align: 'right', minWidth: 68,
    sortValue: r => r.item.percentChange,
    render: r => {
      const p = r.item.percentChange;
      if (p == null) return DASH;
      const up = p >= 0;
      return (
        <span className="text-[14px] font-semibold tabular-nums" style={{ color: up ? '#1D9E75' : '#E24B4A' }}>
          {`${up ? '+' : ''}${p.toFixed(2)}%`}
        </span>
      );
    },
  },
  {
    key: 'stage', label: 'Stage', align: 'left', minWidth: 96,
    sortValue: r => stageRank(r.stage),
    render: r => {
      const style = r.stage ? STAGE[r.stage] : null;
      return r.stage && style ? mkBadge(r.stage, style.color, style.bg) : DASH;
    },
  },
  {
    key: 'rs', label: 'RS', align: 'right', minWidth: 48,
    sortValue: r => r.scan?.rs_score ?? null,
    render: r => r.scan?.rs_score != null
      ? <span className="text-[13px] text-white/80 tabular-nums font-semibold">{r.scan.rs_score}</span>
      : DASH,
  },
  {
    key: 'sepa', label: 'SEPA', align: 'center', minWidth: 56,
    sortValue: r => boolFlag(r.scan, 'sepa'),
    render: r => !r.scan ? DASH
      : r.scan.sepa ? mkBadge('SEPA', '#1D9E75', 'rgba(29,158,117,.15)')
      : <span className="text-white/15">·</span>,
  },
  {
    key: 'kell', label: 'Kell', align: 'center', minWidth: 52,
    sortValue: r => boolFlag(r.scan, 'kell'),
    render: r => !r.scan ? DASH
      : r.scan.kell ? mkBadge('Kell', '#4CAF50', 'rgba(76,175,80,.15)')
      : <span className="text-white/15">·</span>,
  },
  {
    key: 'adtv', label: 'ADTV (MB)', align: 'right', minWidth: 84,
    sortValue: r => r.adtv,
    render: r => r.adtv != null
      ? <span className="text-[13px] text-white/60 tabular-nums">{fmtAdtv(r.adtv)}</span>
      : DASH,
  },
  {
    key: 'pe', label: 'P/E', align: 'right', minWidth: 56,
    sortValue: r => r.item.pe,
    render: r => r.item.pe != null
      ? <span className="text-[13px] tabular-nums" style={{ color: peColor(r.item.pe) || 'rgba(255,255,255,0.6)' }}>{r.item.pe.toFixed(2)}</span>
      : DASH,
  },
  {
    key: 'marketCap', label: 'Mkt Cap', align: 'right', minWidth: 76,
    sortValue: r => r.item.marketCap,
    render: r => <span className="text-[13px] text-white/60 tabular-nums">{fmtMktCap(r.item.marketCap)}</span>,
  },
  {
    key: 'chart', label: 'Chart', align: 'left', minWidth: 160, className: 'hidden lg:table-cell',
    render: r => <MiniCandleChart ticker={r.item.symbol} width="100%" height={56} />,
  },
];

// Nulls always go last regardless of direction; ties fall back to market-cap rank.
function compareRows(a: Row, b: Row, col: Column, dir: 'asc' | 'desc'): number {
  if (!col.sortValue) return a.rank - b.rank;
  const av = col.sortValue(a);
  const bv = col.sortValue(b);
  if (av == null && bv == null) return a.rank - b.rank;
  if (av == null) return 1;
  if (bv == null) return -1;
  const cmp = typeof av === 'string' && typeof bv === 'string'
    ? av.localeCompare(bv)
    : (av as number) - (bv as number);
  if (cmp === 0) return a.rank - b.rank;
  return dir === 'asc' ? cmp : -cmp;
}

export default function IndexConstituents({ index }: { index: string }) {
  const router = useRouter();
  const indexKey = index.toLowerCase();
  const idxName = INDEX_NAMES[indexKey] ?? index.toUpperCase();

  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState(false);
  const [sortKey, setSortKey] = useState('rank');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  // Filters default to "all" so the page always opens with every constituent visible.
  const [filterSym, setFilterSym]       = useState('');
  const [filterScan, setFilterScan]     = useState<Set<string>>(new Set());
  const [filterStage, setFilterStage]   = useState('');
  const [filterSector, setFilterSector] = useState('');

  useEffect(() => {
    let active = true;
    setItems(null);
    setError(false);
    fetch(`/api/index-composition/${indexKey}`)
      .then(r => r.json())
      .then(d => {
        if (!active) return;
        if (Array.isArray(d.items) && d.items.length) setItems(d.items);
        else { setItems([]); setError(true); }
      })
      .catch(() => { if (active) { setItems([]); setError(true); } });
    return () => { active = false; };
  }, [indexKey]);

  const baseRows = useMemo<Row[]>(() => {
    if (!items) return [];
    return [...items]
      .sort((a, b) => (b.marketCap ?? -Infinity) - (a.marketCap ?? -Infinity))
      .map((item, i) => {
        const key = item.symbol.toUpperCase();
        const scan = sigMap.get(key) ?? null;
        const ms = stageMap.get(key);
        return {
          rank: i + 1,
          item,
          scan,
          sector: getSectorForTicker(key)?.sector ?? item.sectorCode ?? '',
          stage: scan?.stage || ms?.Stage || null,
          adtv: typeof ms?.['ADTV(MB)'] === 'number' ? ms['ADTV(MB)'] : null,
        };
      });
  }, [items]);

  const unmatched = useMemo(() => baseRows.filter(r => !r.scan).map(r => r.item.symbol), [baseRows]);

  const allStages = useMemo(() => {
    const s = new Set<string>();
    baseRows.forEach(r => { if (r.stage) s.add(r.stage); });
    return Array.from(s).sort((a, b) => (stageRank(a) ?? 99) - (stageRank(b) ?? 99));
  }, [baseRows]);

  const hasFilter = Boolean(filterSym.trim() || filterScan.size > 0 || filterStage || filterSector.trim());

  const clearFilters = () => {
    setFilterSym('');
    setFilterScan(new Set());
    setFilterStage('');
    setFilterSector('');
  };

  const toggleScan = (s: string) => {
    setFilterScan(prev => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  const rows = useMemo(() => {
    let result = baseRows;
    const sym = filterSym.trim().toUpperCase();
    if (sym) result = result.filter(r => r.item.symbol.toUpperCase().includes(sym));
    if (filterScan.size > 0) {
      result = result.filter(r =>
        !!r.scan && (
          (filterScan.has('SEPA') && r.scan.sepa) ||
          (filterScan.has('Kell') && r.scan.kell) ||
          (filterScan.has('BO') && r.scan.breakout)
        )
      );
    }
    if (filterStage) result = result.filter(r => r.stage === filterStage);
    const sec = filterSector.trim().toUpperCase();
    if (sec) result = result.filter(r => r.sector.toUpperCase().includes(sec));

    const col = COLUMNS.find(c => c.key === sortKey) ?? COLUMNS[0];
    return [...result].sort((a, b) => compareRows(a, b, col, sortDir));
  }, [baseRows, filterSym, filterScan, filterStage, filterSector, sortKey, sortDir]);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      // Text-like columns start A→Z / best-first; numeric columns start high→low.
      setSortDir(key === 'rank' || key === 'symbol' || key === 'sector' || key === 'stage' ? 'asc' : 'desc');
    }
  };

  const sortIcon = (key: string) => {
    if (sortKey !== key) return <ArrowUpDown size={9} className="text-white/20 shrink-0" />;
    return sortDir === 'asc'
      ? <ArrowUp   size={9} className="text-[#1D9E75] shrink-0" />
      : <ArrowDown size={9} className="text-[#1D9E75] shrink-0" />;
  };

  const inputCls = 'bg-white/[0.05] border border-white/10 rounded px-2 py-1 text-white/60 placeholder-white/25 outline-none focus:border-white/25 transition-colors';

  const alignCls = (a: Column['align']) =>
    a === 'right' ? 'text-right justify-end' : a === 'center' ? 'text-center justify-center' : 'text-left justify-start';

  return (
    <div className="p-4 md:p-6 space-y-4 min-w-0">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-2 -ml-2 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/[0.05] transition-colors"
          aria-label="ย้อนกลับ"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-[18px] font-bold text-white">{idxName}</h1>
          <p className="text-[12px] text-white/35 mt-0.5">
            หุ้นในดัชนี {idxName}
            {items && items.length > 0
              ? hasFilter ? ` · แสดง ${rows.length} / ${baseRows.length}` : ` · ${baseRows.length} ตัว`
              : ''}
            {unmatched.length > 0 && (
              <span className="text-amber-300/70" title={unmatched.join(', ')}>
                {` · ไม่มีข้อมูลสแกน ${unmatched.length} ตัว`}
              </span>
            )}
          </p>
        </div>

        {/* SET50 / SET100 tabs — the active tab is the [index] URL segment */}
        <div className="flex gap-1.5 bg-white/[0.04] p-1 rounded-xl border border-white/[0.08]">
          {INDEX_TABS.map(t => (
            <Link
              key={t.key}
              href={`/set-index/${t.key}`}
              replace
              className={[
                'px-3.5 py-1 rounded-lg text-[12px] font-bold transition-all',
                indexKey === t.key ? 'bg-white text-black shadow-sm' : 'text-white/50 hover:text-white',
              ].join(' ')}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Filters — all empty by default */}
      {items && items.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <input
            value={filterSym}
            onChange={e => setFilterSym(e.target.value)}
            placeholder="ค้นหา Symbol..."
            className={inputCls}
            style={{ width: 130 }}
          />
          <div className="flex items-center gap-1">
            <span className="text-white/30 mr-0.5">Scan</span>
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
          <select
            value={filterStage}
            onChange={e => setFilterStage(e.target.value)}
            className={`${inputCls} bg-[#0d0f16]`}
            aria-label="Stage"
          >
            <option value="">Stage: ทั้งหมด</option>
            {allStages.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <input
            value={filterSector}
            onChange={e => setFilterSector(e.target.value)}
            placeholder="ค้นหา Sector..."
            className={inputCls}
            style={{ width: 130 }}
          />
          {hasFilter && (
            <button
              onClick={clearFilters}
              className="text-[11px] text-white/40 hover:text-white/70 border border-white/15 hover:border-white/30 rounded-lg px-2.5 py-1 transition-colors"
            >
              ล้างตัวกรอง
            </button>
          )}
        </div>
      )}

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
          // Wide tables scroll inside this frame, never the page body.
          <div className="overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                  {COLUMNS.map(c => (
                    <th
                      key={c.key}
                      title={c.title}
                      className={`px-2 py-2.5 text-[12px] font-semibold uppercase tracking-wider text-white/25 whitespace-nowrap ${c.className ?? ''}`}
                      style={{ minWidth: c.minWidth }}
                      aria-sort={sortKey === c.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                    >
                      {c.sortValue ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(c.key)}
                          className={`flex w-full items-center gap-1 select-none uppercase hover:text-white/50 ${alignCls(c.align)}`}
                        >
                          {c.align === 'right' && sortIcon(c.key)}
                          {c.label}
                          {c.align !== 'right' && sortIcon(c.key)}
                        </button>
                      ) : (
                        <span className={`flex ${alignCls(c.align)}`}>{c.label}</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={COLUMNS.length} className="px-5 py-10 text-center text-[13px] text-white/30">
                      ไม่พบหุ้นที่ตรงกับเงื่อนไข
                    </td>
                  </tr>
                )}
                {rows.map(r => (
                  <tr
                    key={r.item.symbol}
                    onClick={() => router.push(`/stock/${r.item.symbol}`)}
                    className="cursor-pointer transition-colors hover:bg-white/[0.025]"
                    style={{ borderBottom: '1px solid rgba(255,255,255,.04)' }}
                  >
                    {COLUMNS.map(c => (
                      <td
                        key={c.key}
                        className={`px-2 py-2 whitespace-nowrap ${alignCls(c.align)} ${c.className ?? ''}`}
                        style={c.key === 'chart' ? { paddingTop: 4, paddingBottom: 4 } : undefined}
                      >
                        {c.render(r)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
