'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import MiniCandlestick from '@/components/MiniCandlestick';
import { ChangeBadge } from '@/components/ChangeBadge';
import TableSkeleton from '@/components/TableSkeleton';
import { scanData } from '@/lib/scanData';
import marketStageRaw from '@/data/scans/market_stage.json';
import rawWeinstein from '@/data/scans/weinstein.json';

type Market = 'set' | 'mai';
type VolMode = 'volume' | 'value';

// market_stage.json uses "Ticker" (capital T) and "Stage" (capital S)
const stageMap = new Map(
  (marketStageRaw as Array<{ Ticker: string; Stage: string }>)
    .map(e => [e.Ticker.toUpperCase(), e.Stage])
);

// Build combined.json lookup — normalize keys to uppercase to be safe
const sigMap = new Map(scanData.map(e => [e.ticker.toUpperCase(), e]));

// 52W High/Low — same weinstein.json bundle + lookup the scanner page uses.
const w52Map = new Map<string, { high: number; low: number }>(
  (rawWeinstein as unknown as { Ticker: string; '52W_High': number; '52W_Low': number }[])
    .map(w => [w.Ticker.toUpperCase(), { high: w['52W_High'], low: w['52W_Low'] }])
);

interface ChartEntry { bars: { date: string; open: number; high: number; low: number; close: number }[]; ema200: (number | null)[]; }
interface Fundamental { pe: number | null; }

interface MoverItem {
  symbol?: string;
  last?: number;
  percentChange?: number;
  totalVolume?: number;
  totalValue?: number;
  [key: string]: unknown;
}

function fmt(n: number | undefined, decimals = 2): string {
  if (n == null) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtVol(n: number | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString('en-US');
}

function fmtMB(n: number | undefined): string {
  if (n == null) return '—';
  return (n / 1_000_000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STAGE: Record<string, { color: string; bg: string }> = {
  'S.Bull':       { color: '#1D9E75', bg: 'rgba(29,158,117,.15)' },
  'Bull':         { color: '#4CAF50', bg: 'rgba(76,175,80,.15)' },
  'Recovery':     { color: '#EF9F27', bg: 'rgba(239,159,39,.15)' },
  'Accumulation': { color: '#378ADD', bg: 'rgba(55,138,221,.15)' },
  'Distribution': { color: '#BA7517', bg: 'rgba(186,117,23,.15)' },
  'Warning':      { color: '#EF9F27', bg: 'rgba(239,159,39,.15)' },
  'Bear':         { color: '#E24B4A', bg: 'rgba(226,75,74,.15)' },
};

function SignalBadges({ sym }: { sym: string }) {
  const key = sym.toUpperCase();
  const e = sigMap.get(key);

  // Resolve stage: prefer combined.json, fall back to market_stage.json
  const resolvedStage = (e?.stage) || stageMap.get(key) || '';
  const stageStyle = resolvedStage ? STAGE[resolvedStage] : null;

  // Debug logging for KBANK and GULF
  if (key === 'KBANK' || key === 'GULF') {
    console.log(`[TopMovers] ${key} — sigMap hit:`, e, '| stageMap stage:', stageMap.get(key), '| resolved:', resolvedStage);
  }

  if (!e && !resolvedStage) {
    return <span className="text-[11px] text-white/20">—</span>;
  }

  return (
    <div className="flex flex-wrap gap-[3px]">
      {e?.sepa && (
        <span style={{ color: '#1D9E75', background: 'rgba(29,158,117,.15)', border: '1px solid rgba(29,158,117,.35)', borderRadius: 3, padding: '0 3px', fontSize: 9, fontWeight: 700, lineHeight: '14px' }}>
          SEPA
        </span>
      )}
      {e?.kell && (
        <span style={{ color: '#4CAF50', background: 'rgba(76,175,80,.15)', border: '1px solid rgba(76,175,80,.35)', borderRadius: 3, padding: '0 3px', fontSize: 9, fontWeight: 700, lineHeight: '14px' }}>
          Kell
        </span>
      )}
      {e?.breakout && (
        <span style={{ color: '#378ADD', background: 'rgba(55,138,221,.15)', border: '1px solid rgba(55,138,221,.35)', borderRadius: 3, padding: '0 3px', fontSize: 9, fontWeight: 700, lineHeight: '14px' }}>
          BO
        </span>
      )}
      {resolvedStage && stageStyle && (
        <span style={{ color: stageStyle.color, background: stageStyle.bg, border: `1px solid ${stageStyle.color}55`, borderRadius: 3, padding: '0 3px', fontSize: 9, fontWeight: 700, lineHeight: '14px' }}>
          {resolvedStage}
        </span>
      )}
    </div>
  );
}

interface PanelProps {
  title: string;
  accentColor: string;
  items: MoverItem[];
  loading: boolean;
  volMode: VolMode;
  onSymbol: (sym: string) => void;
  chartMap: Record<string, ChartEntry>;
  feMap: Record<string, Fundamental>;
}

const STICKY_BG = '#13161e';
const HASH_W = 26;
const SYMBOL_W = 84;
const TH_CLS = 'px-2 py-2 text-left text-[13px] font-bold uppercase tracking-wider text-white/45';

function fmtPe(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toFixed(1);
}

function MoverPanel({ title, accentColor, items, loading, volMode, onSymbol, chartMap, feMap }: PanelProps) {
  return (
    <div className="bg-[#13161e] border border-white/[0.07] rounded-xl overflow-hidden flex flex-col">
      <div
        className="flex items-center px-4 py-3 border-b border-white/[0.06]"
        style={{ borderLeft: `3px solid ${accentColor}` }}
      >
        <span className="text-[13px] font-bold" style={{ color: accentColor }}>{title}</span>
      </div>

      {loading ? (
        <TableSkeleton rows={6} />
      ) : items.length === 0 ? (
        <div className="flex-1 flex items-center justify-center py-10">
          <span className="text-[12px] text-white/25">ไม่พบข้อมูล</span>
        </div>
      ) : (
        <div className="relative overflow-x-auto">
          <table className="md:min-w-[640px]" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,.05)' }}>
                <th
                  className={TH_CLS}
                  style={{ position: 'sticky', left: 0, background: STICKY_BG, width: HASH_W, zIndex: 1 }}
                >
                  #
                </th>
                <th
                  className={TH_CLS}
                  style={{ position: 'sticky', left: HASH_W, background: STICKY_BG, width: SYMBOL_W, zIndex: 1 }}
                >
                  Symbol
                </th>
                <th className={`${TH_CLS} text-right`}>Price</th>
                <th className={`${TH_CLS} text-right`}>%Chg</th>
                <th className={`${TH_CLS} text-right whitespace-nowrap`}>
                  {volMode === 'value' ? 'Value (M฿)' : 'Volume'}
                </th>
                <th className={`${TH_CLS} text-right whitespace-nowrap hidden md:table-cell`}>52W H/L</th>
                <th className={`${TH_CLS} text-right hidden md:table-cell`}>P/E</th>
                <th className={TH_CLS}>Signals</th>
                <th className={`${TH_CLS} hidden sm:table-cell`}>Chart</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => {
                const pct   = (item.percentChange as number | undefined) ?? 0;
                const sym   = (item.symbol as string | undefined) ?? '';
                const symKey = sym.toUpperCase();
                const volTd = volMode === 'value'
                  ? fmtMB(item.totalValue as number | undefined)
                  : fmtVol(item.totalVolume as number | undefined);
                const w52 = w52Map.get(symKey);
                const chart = chartMap[symKey];
                return (
                  <tr
                    key={sym || i}
                    style={{ borderBottom: '1px solid rgba(255,255,255,.03)', cursor: 'pointer' }}
                    className="hover:bg-white/[0.025] transition-colors group"
                    onClick={() => sym && onSymbol(sym)}
                  >
                    <td
                      className="px-2 text-[14px] text-white/25 tabular-nums group-hover:bg-[#181b24] transition-colors"
                      style={{ paddingTop: 10, paddingBottom: 10, position: 'sticky', left: 0, background: STICKY_BG }}
                    >
                      {i + 1}
                    </td>
                    <td
                      className="px-2 group-hover:bg-[#181b24] transition-colors"
                      style={{ paddingTop: 10, paddingBottom: 10, position: 'sticky', left: HASH_W, background: STICKY_BG }}
                    >
                      <span className="text-[14px] font-semibold text-white block truncate">{sym || '—'}</span>
                    </td>
                    <td className="px-2 text-[14px] text-white/70 text-right tabular-nums whitespace-nowrap" style={{ paddingTop: 12, paddingBottom: 12 }}>
                      {fmt(item.last as number | undefined)}
                    </td>
                    <td className="px-2 text-right whitespace-nowrap" style={{ paddingTop: 12, paddingBottom: 12 }}>
                      <ChangeBadge value={pct} />
                    </td>
                    <td className="px-2 text-[14px] text-white/50 text-right tabular-nums whitespace-nowrap" style={{ paddingTop: 12, paddingBottom: 12 }}>
                      {volTd}
                    </td>
                    <td className="px-2 text-right whitespace-nowrap hidden md:table-cell" style={{ paddingTop: 12, paddingBottom: 12 }}>
                      {w52 ? (
                        <div className="flex flex-col items-end leading-tight text-[11px] tabular-nums">
                          <span className="text-[#E24B4A]">{w52.high.toFixed(2)}</span>
                          <span className="text-[#1D9E75]">{w52.low.toFixed(2)}</span>
                        </div>
                      ) : (
                        <span className="text-white/20 text-[12px]">—</span>
                      )}
                    </td>
                    <td className="px-2 text-[13px] text-white/50 text-right tabular-nums hidden md:table-cell" style={{ paddingTop: 12, paddingBottom: 12 }}>
                      {fmtPe(feMap[symKey]?.pe)}
                    </td>
                    <td className="px-2" style={{ paddingTop: 12, paddingBottom: 12 }}>
                      <SignalBadges sym={sym} />
                    </td>
                    {/* CHART — rightmost, hidden on mobile */}
                    <td className="hidden sm:table-cell" style={{ paddingTop: 10, paddingBottom: 10, paddingLeft: 8, paddingRight: 8 }}>
                      {sym && <MiniCandlestick bars={chart?.bars} ema200={chart?.ema200} width={180} height={32} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {/* Scroll affordance for the widened table on narrow screens */}
          <div className="md:hidden pointer-events-none absolute top-0 right-0 bottom-0 w-6 bg-gradient-to-l from-[#13161e] to-transparent" />
        </div>
      )}
    </div>
  );
}

export default function TopMoversPage() {
  const router = useRouter();
  const [market, setMarket] = useState<Market>('set');
  const [mobilePanel, setMobilePanel] = useState<'gainers' | 'losers'>('gainers');

  const [gainers,     setGainers]     = useState<MoverItem[]>([]);
  const [losers,      setLosers]      = useState<MoverItem[]>([]);
  const [activeValue, setActiveValue] = useState<MoverItem[]>([]);
  const [activeVolume,setActiveVolume]= useState<MoverItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [chartMap, setChartMap] = useState<Record<string, ChartEntry>>({});
  const [feMap, setFeMap] = useState<Record<string, Fundamental>>({});

  const fetchAll = useCallback(async (m: Market) => {
    setLoading(true);
    try {
      const [g, l, v, vol] = await Promise.all([
        fetch(`/api/settrade?type=topGainer&market=${m}`).then(r => r.json()),
        fetch(`/api/settrade?type=topLoser&market=${m}`).then(r => r.json()),
        fetch(`/api/settrade?type=mostActiveValue&market=${m}`).then(r => r.json()),
        fetch(`/api/settrade?type=mostActiveVolume&market=${m}`).then(r => r.json()),
      ]);
      setGainers(g.items ?? []);
      setLosers(l.items ?? []);
      setActiveValue(v.items ?? []);
      setActiveVolume(vol.items ?? []);

      // One batched request each for chart data + P/E, covering every ticker
      // visible across all 4 panels combined - not per-row, not per-panel.
      const allSyms = Array.from(new Set(
        [g.items, l.items, v.items, vol.items]
          .flat()
          .map((it: MoverItem) => (it.symbol as string | undefined)?.toUpperCase())
          .filter((s): s is string => !!s)
      ));
      if (allSyms.length > 0) {
        const [chartsRes, feRes] = await Promise.all([
          fetch(`/api/topmover-charts?tickers=${allSyms.map(encodeURIComponent).join(',')}`).then(r => r.json()).catch(() => null),
          fetch(`/api/sector-fundamentals?tickers=${allSyms.map(encodeURIComponent).join(',')}`).then(r => r.json()).catch(() => null),
        ]);
        if (chartsRes?.data) setChartMap(chartsRes.data);
        if (Array.isArray(feRes?.data)) {
          setFeMap(Object.fromEntries(feRes.data.map((d: { ticker: string; pe: number | null }) => [d.ticker.toUpperCase(), { pe: d.pe }])));
        }
      } else {
        setChartMap({});
        setFeMap({});
      }
    } catch {
      // keep existing state on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(market); }, [market, fetchAll]);
  const go = useCallback((sym: string) => router.push(`/stock/${sym}`), [router]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[18px] font-bold text-white">Top Movers</h1>
          <p className="text-[12px] text-white/35 mt-0.5">{market.toUpperCase()} · SETTrade real-time</p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {(['set', 'mai'] as Market[]).map(m => (
            <button
              key={m}
              onClick={() => setMarket(m)}
              className={[
                'px-4 py-1.5 rounded-lg text-[12px] font-bold uppercase tracking-wider transition-all border',
                market === m
                  ? 'bg-white/10 border-white/20 text-white'
                  : 'border-white/[0.07] text-white/35 hover:text-white/60',
              ].join(' ')}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Mobile: tab switcher for Gainers vs Losers */}
      <div className="md:hidden flex bg-white/[0.04] rounded-xl p-1 gap-1">
        <button
          onClick={() => setMobilePanel('gainers')}
          className={`flex-1 py-2.5 rounded-lg text-[12px] font-semibold transition-all ${
            mobilePanel === 'gainers'
              ? 'bg-[#1D9E75]/20 text-[#1D9E75]'
              : 'text-white/35 hover:text-white/60'
          }`}
        >
          Top Gainers
        </button>
        <button
          onClick={() => setMobilePanel('losers')}
          className={`flex-1 py-2.5 rounded-lg text-[12px] font-semibold transition-all ${
            mobilePanel === 'losers'
              ? 'bg-[#E24B4A]/20 text-[#E24B4A]'
              : 'text-white/35 hover:text-white/60'
          }`}
        >
          Top Losers
        </button>
      </div>
      {/* Mobile: single panel */}
      <div className="md:hidden">
        {mobilePanel === 'gainers'
          ? <MoverPanel title="Top Gainers" accentColor="#1D9E75" items={gainers} loading={loading} volMode="volume" onSymbol={go} chartMap={chartMap} feMap={feMap} />
          : <MoverPanel title="Top Losers"  accentColor="#E24B4A" items={losers}  loading={loading} volMode="volume" onSymbol={go} chartMap={chartMap} feMap={feMap} />
        }
      </div>
      {/* Desktop: side by side */}
      <div className="hidden md:grid md:grid-cols-2 gap-4">
        <MoverPanel title="Top Gainers" accentColor="#1D9E75" items={gainers} loading={loading} volMode="volume" onSymbol={go} chartMap={chartMap} feMap={feMap} />
        <MoverPanel title="Top Losers"  accentColor="#E24B4A" items={losers}  loading={loading} volMode="volume" onSymbol={go} chartMap={chartMap} feMap={feMap} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MoverPanel title="Most Active Value"  accentColor="#378ADD" items={activeValue}  loading={loading} volMode="value"  onSymbol={go} chartMap={chartMap} feMap={feMap} />
        <MoverPanel title="Most Active Volume" accentColor="#BA7517" items={activeVolume} loading={loading} volMode="volume" onSymbol={go} chartMap={chartMap} feMap={feMap} />
      </div>

      <p className="text-[10px] text-white/20 text-right">
        แหล่งข้อมูล: SETTrade · {market.toUpperCase()}
      </p>
    </div>
  );
}
