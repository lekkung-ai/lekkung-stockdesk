'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import rawSectorMap from '@/data/scans/sector_map.json';
import rawCombined from '@/data/scans/combined.json';
import rawWeinstein from '@/data/scans/weinstein.json';
import { useLivePrices } from '@/lib/useLivePrices';

// All columns come from data already loaded elsewhere in the app (sector_map,
// combined, weinstein scan JSONs) plus the same live-price hook used on the
// scanner page — no new API surface. See app/stock/[ticker]/page.tsx for how
// `sector`/`subsector` are resolved server-side for the viewed ticker.

interface SectorMapFile {
  sectors: { sector: string; subsector: string; market: string; tickers: string[]; count: number }[];
  ticker_to_sector: Record<string, { sector: string; subsector: string; market: string }>;
}
const sectorMap = rawSectorMap as unknown as SectorMapFile;

interface CombinedEntry {
  ticker: string;
  price: number;
  stage: string | null;
  rs_score: number | null;
  sepa: boolean;
  kell: boolean;
  breakout: boolean;
  growth_yoy: number | null;
  growth_qoq: number | null;
}
const _c = rawCombined as unknown as CombinedEntry[] | { data: CombinedEntry[] };
const combinedData: CombinedEntry[] = Array.isArray(_c) ? _c : _c.data;
const combinedMap = new Map(combinedData.map(r => [r.ticker, r]));

interface WeinsteinEntry {
  Ticker: string;
  PE_Ratio: number | null;
  ROE: number | null; // stored as a decimal fraction (0.48 = 48%)
  '52W_High': number | null;
}
const weinsteinMap = new Map(
  (rawWeinstein as unknown as WeinsteinEntry[]).map(r => [r.Ticker, r])
);

const STAGE_ORDER = ['S.Bull', 'Bull', 'Accumulation', 'Recovery', 'Warning', 'Distribution', 'Bear'];
const STAGE_COLORS: Record<string, string> = {
  'S.Bull': '#1b5e20', 'Bull': '#4caf50', 'Accumulation': '#00bcd4',
  'Recovery': '#9e9e9e', 'Warning': '#FFEB3B', 'Distribution': '#ff9800', 'Bear': '#ef5350',
};

interface Row {
  ticker: string;
  price: number | null;
  change1d: number | null;
  rs: number | null;
  stage: string | null;
  dist52wh: number | null;
  pe: number | null;
  roe: number | null;
  revGrowth: number | null;
  npGrowth: number | null;
  sepa: boolean;
  kell: boolean;
  breakout: boolean;
  hasScanData: boolean;
}

type SortKey = 'ticker' | 'price' | 'rs' | 'stage' | 'dist52wh' | 'pe' | 'roe' | 'revGrowth' | 'npGrowth';
const DEFAULT_WINDOW = 10;
const GROWTH_CAP = 1000; // beyond this the base is small enough that %YoY stops being a meaningful comparison

function fmt(n: number | null, digits = 2, suffix = ''): string {
  return n == null ? '—' : `${n.toFixed(digits)}${suffix}`;
}

// Growth off a tiny base (e.g. 14991.5%) isn't comparable to anything - cap
// the displayed figure but keep the real number in a tooltip.
function fmtGrowth(n: number | null): { text: string; title?: string } {
  if (n == null) return { text: '—' };
  if (n > GROWTH_CAP) return { text: `>${GROWTH_CAP}%`, title: `${n.toFixed(1)}%` };
  if (n < -GROWTH_CAP) return { text: `<-${GROWTH_CAP}%`, title: `${n.toFixed(1)}%` };
  return { text: `${n.toFixed(1)}%` };
}

export default function PeerComparisonTable({
  ticker,
  sector,
  subsector,
}: {
  ticker: string;
  sector: string | null;
  subsector: string | null;
}) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>('rs');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [expanded, setExpanded] = useState(false);

  const { peers, groupLabel, usedFallback } = useMemo(() => {
    if (!sector) return { peers: [] as string[], groupLabel: '', usedFallback: false };
    const subBucket = sectorMap.sectors.filter(s => s.sector === sector && s.subsector === subsector);
    let tickers = [...new Set(subBucket.flatMap(s => s.tickers))];
    let fallback = false;
    if (tickers.length < 3) {
      const secBucket = sectorMap.sectors.filter(s => s.sector === sector);
      tickers = [...new Set(secBucket.flatMap(s => s.tickers))];
      fallback = true;
    }
    return { peers: tickers, groupLabel: fallback ? sector : (subsector || sector), usedFallback: fallback };
  }, [sector, subsector]);

  // key={ticker} on the parent forces this component to remount per ticker
  // (see StockDetailPage) — useLivePrices captures its symbol list once via
  // useRef, so without a remount it would keep showing the previous ticker's
  // peer-group prices after navigating between stock pages.
  const { priceMap, changePctMap } = useLivePrices(peers);

  const rows: Row[] = useMemo(() => {
    return peers.map(t => {
      const c = combinedMap.get(t);
      const w = weinsteinMap.get(t);
      const price = priceMap[t] ?? c?.price ?? null;
      const high = w?.['52W_High'] ?? null;
      const dist52wh = price != null && high ? ((price - high) / high) * 100 : null;
      return {
        ticker: t,
        price,
        change1d: changePctMap[t] ?? null,
        rs: c?.rs_score ?? null,
        stage: c?.stage ?? null,
        dist52wh,
        pe: w?.PE_Ratio ?? null,
        roe: w?.ROE != null ? w.ROE * 100 : null,
        revGrowth: c?.growth_yoy ?? null,
        npGrowth: c?.growth_qoq ?? null,
        sepa: c?.sepa ?? false,
        kell: c?.kell ?? false,
        breakout: c?.breakout ?? false,
        // Funds/REITs etc that sit in the sector map but never entered the
        // scan universe (e.g. BRRGIF, KBSPIF) - neither source file has an
        // entry at all, not just missing individual fields.
        hasScanData: c != null || w != null,
      };
    });
  }, [peers, priceMap, changePctMap]);

  const sortRows = (list: Row[]) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sortKey === 'ticker') return dir * a.ticker.localeCompare(b.ticker);
      if (sortKey === 'stage') {
        const ai = a.stage ? STAGE_ORDER.indexOf(a.stage) : 99;
        const bi = b.stage ? STAGE_ORDER.indexOf(b.stage) : 99;
        return dir * (ai - bi);
      }
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1; // nulls always last, regardless of direction
      if (bv == null) return -1;
      return dir * ((av as number) - (bv as number));
    });
  };

  const scanned = useMemo(() => sortRows(rows.filter(r => r.hasScanData)), [rows, sortKey, sortDir]);
  const unscanned = useMemo(() => sortRows(rows.filter(r => !r.hasScanData)), [rows, sortKey, sortDir]);

  // Default view centers a 10-row window on the ticker being viewed (ranked
  // by whatever column is currently sorted) instead of dumping the full
  // peer group - "ดูทั้งหมด" expands to everything.
  const visibleScanned = useMemo(() => {
    if (expanded || scanned.length <= DEFAULT_WINDOW) return scanned;
    const idx = scanned.findIndex(r => r.ticker === ticker);
    if (idx === -1) return scanned.slice(0, DEFAULT_WINDOW);
    let start = Math.max(0, idx - Math.floor(DEFAULT_WINDOW / 2));
    const end = Math.min(scanned.length, start + DEFAULT_WINDOW);
    start = Math.max(0, end - DEFAULT_WINDOW);
    return scanned.slice(start, end);
  }, [scanned, expanded, ticker]);

  const sorted = visibleScanned;

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  function SortTh({ label, k, className = '' }: { label: string; k: SortKey; className?: string }) {
    const active = sortKey === k;
    return (
      <th
        onClick={() => handleSort(k)}
        className={`px-3 py-2 text-label font-semibold cursor-pointer select-none whitespace-nowrap transition-colors ${
          active ? 'text-white/70' : 'text-meta hover:text-white/70'
        } ${className}`}
      >
        {label}{active && <span className="ml-1">{sortDir === 'asc' ? '▲' : '▼'}</span>}
      </th>
    );
  }

  function PeerRow({ r }: { r: Row }) {
    const isCurrent = r.ticker === ticker;
    const rev = fmtGrowth(r.revGrowth);
    const np = fmtGrowth(r.npGrowth);
    return (
      <tr
        onClick={() => !isCurrent && router.push(`/stock/${r.ticker}`)}
        className={`transition-colors ${
          isCurrent ? 'bg-[#7F77DD]/[0.10] cursor-default' : 'hover:bg-white/[0.03] cursor-pointer'
        }`}
      >
        <td className="px-3 py-2.5 text-body font-bold whitespace-nowrap" style={{ color: isCurrent ? '#7F77DD' : 'var(--color-ink)' }}>
          {r.ticker}
        </td>
        <td className="px-3 py-2.5 text-label tabular-nums whitespace-nowrap">
          <span className="text-ink">{r.price != null ? r.price.toFixed(2) : '—'}</span>
          {r.change1d != null && (
            <span className={`ml-1.5 ${r.change1d > 0 ? 'text-[#1D9E75]' : r.change1d < 0 ? 'text-[#E24B4A]' : 'text-meta'}`}>
              {r.change1d > 0 ? '+' : ''}{r.change1d.toFixed(2)}%
            </span>
          )}
        </td>
        <td className="px-3 py-2.5 text-label tabular-nums font-semibold" style={{ color: r.rs != null ? (r.rs >= 80 ? '#1D9E75' : r.rs >= 50 ? '#BA7517' : '#E24B4A') : 'var(--color-meta)' }}>
          {r.rs ?? '—'}
        </td>
        <td className="px-3 py-2.5">
          {r.stage ? (
            <span
              className="inline-flex items-center px-2 py-0.5 rounded text-label font-semibold"
              style={{ background: STAGE_COLORS[r.stage] ?? '#424242', color: ['Warning', 'Accumulation', 'Recovery', 'Bull'].includes(r.stage) ? 'black' : 'white' }}
            >
              {r.stage}
            </span>
          ) : <span className="text-meta text-label">—</span>}
        </td>
        <td className="px-3 py-2.5 text-label tabular-nums text-meta whitespace-nowrap">{fmt(r.dist52wh, 1, '%')}</td>
        <td className="px-3 py-2.5 text-label tabular-nums text-meta hidden md:table-cell">{fmt(r.pe, 1)}</td>
        <td className="px-3 py-2.5 text-label tabular-nums text-meta hidden md:table-cell">{fmt(r.roe, 1, '%')}</td>
        <td
          className={`px-3 py-2.5 text-label tabular-nums whitespace-nowrap ${r.revGrowth != null ? (r.revGrowth > 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]') : 'text-meta'}`}
          title={rev.title}
        >
          {rev.text}
        </td>
        <td
          className={`px-3 py-2.5 text-label tabular-nums whitespace-nowrap ${r.npGrowth != null ? (r.npGrowth > 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]') : 'text-meta'}`}
          title={np.title}
        >
          {np.text}
        </td>
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-1 flex-wrap">
            {r.sepa && <span className="px-1.5 py-0.5 rounded text-label font-bold bg-[#1D9E75]/15 text-[#1D9E75]">SEPA</span>}
            {r.kell && <span className="px-1.5 py-0.5 rounded text-label font-bold bg-[#378ADD]/15 text-[#378ADD]">Kell</span>}
            {r.breakout && <span className="px-1.5 py-0.5 rounded text-label font-bold bg-[#EF9F27]/15 text-[#EF9F27]">BO</span>}
            {!r.sepa && !r.kell && !r.breakout && <span className="text-meta text-label">—</span>}
          </div>
        </td>
      </tr>
    );
  }

  if (!sector || peers.length === 0) return null;

  return (
    <div className="bg-[#13161e] border border-white/[0.07] rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between gap-3">
        <div>
          <h2 className="text-section text-ink">เทียบกลุ่ม {groupLabel}</h2>
          <p className="text-label text-meta mt-0.5">
            {usedFallback
              ? `กลุ่ม ${subsector} มีน้อยกว่า 3 ตัว แสดงระดับ sector "${sector}" แทน (${peers.length} ตัว)`
              : `${peers.length} หุ้นใน subsector เดียวกัน`}
          </p>
        </div>
        {!expanded && scanned.length > DEFAULT_WINDOW && (
          <button
            onClick={() => setExpanded(true)}
            className="flex-shrink-0 px-3 py-1.5 rounded-lg text-label font-semibold bg-white/[0.06] text-white/70 hover:bg-white/[0.1] hover:text-white transition-colors"
          >
            ดูทั้งหมด ({scanned.length})
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/[0.06]">
              <SortTh label="Ticker" k="ticker" />
              <SortTh label="Close / 1D%" k="price" />
              <SortTh label="RS" k="rs" />
              <SortTh label="Stage" k="stage" />
              <SortTh label="%52WH" k="dist52wh" />
              <SortTh label="PE" k="pe" className="hidden md:table-cell" />
              <SortTh label="ROE" k="roe" className="hidden md:table-cell" />
              <SortTh label="RevGrowth" k="revGrowth" />
              <SortTh label="NPGrowth" k="npGrowth" />
              <th className="px-3 py-2 text-label font-semibold text-meta">Signals</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {sorted.map(r => <PeerRow key={r.ticker} r={r} />)}
          </tbody>
        </table>
      </div>
      {unscanned.length > 0 && (
        <details className="border-t border-white/[0.06]">
          <summary className="px-5 py-2.5 text-label text-meta cursor-pointer hover:text-white/70 transition-colors select-none">
            ไม่มีข้อมูลสแกน ({unscanned.length} ตัว) — กองทุนอสังหา/REIT ที่ไม่อยู่ในชุดสแกน
          </summary>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <tbody className="divide-y divide-white/[0.04]">
                {unscanned.map(r => <PeerRow key={r.ticker} r={r} />)}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
