'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import MiniCandlestick from '@/components/MiniCandlestick';
import TrendSparkline from '@/components/TrendSparkline';
import ModeToggle from '@/components/ModeToggle';
import ThaiDateInput from '@/components/ThaiDateInput';
import { ChangeBadge } from '@/components/ChangeBadge';
import TableSkeleton from '@/components/TableSkeleton';
import { scanData } from '@/lib/scanData';
import { sparklineMap } from '@/lib/sparklineData';
import marketStageRaw from '@/data/scans/market_stage.json';
import rawWeinstein from '@/data/scans/weinstein.json';

type Market = 'set' | 'mai';
type VolMode = 'volume' | 'value';
type RankingType = 'topGainer' | 'topLoser' | 'mostActiveValue' | 'mostActiveVolume';

// market_stage.json uses "Ticker" (capital T) and "Stage" (capital S)
const stageMap = new Map(
  (marketStageRaw as Array<{ Ticker: string; Stage: string }>)
    .map(e => [e.Ticker.toUpperCase(), e.Stage])
);

// Build combined.json lookup — normalize keys to uppercase to be safe
const sigMap = new Map(scanData.map(e => [e.ticker.toUpperCase(), e]));

// 52W High/Low — same weinstein.json bundle + lookup the scanner page uses.
// Always "today's" snapshot regardless of realtime/ย้อนหลัง mode - a
// deliberate simplification (52W range and P/E below barely move day to
// day, so showing the current value next to an older price row is close
// enough; a fully historical version of these would need its own daily
// archive, which is out of scope here).
const w52Map = new Map<string, { high: number; low: number }>(
  (rawWeinstein as unknown as { Ticker: string; '52W_High': number | null; '52W_Low': number | null }[])
    .filter(w => w && w.Ticker && w['52W_High'] != null && w['52W_Low'] != null)
    .map(w => [w.Ticker.toUpperCase(), { high: w['52W_High']!, low: w['52W_Low']! }])
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

type MarketRanking = Record<RankingType, MoverItem[]>;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// Rough SET trading-hours window (continuous trading 10:00-16:30 ICT,
// Mon-Fri) - close enough for labeling "still moving" vs "settled for the
// day"; doesn't account for public holidays, same approximation the
// weekend-aware stale-data banner elsewhere in this app already makes.
function isMarketOpenNowBangkok(): boolean {
  const bkk = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  const day = bkk.getDay();
  if (day === 0 || day === 6) return false;
  const mins = bkk.getHours() * 60 + bkk.getMinutes();
  return mins >= 10 * 60 && mins <= 16 * 60 + 30;
}

function nowThaiTime(): string {
  return new Date().toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' });
}

function isoToThaiLabel(iso: string): string {
  const [y, m, d] = iso.split('-');
  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  return `${parseInt(d)} ${months[parseInt(m) - 1]} ${parseInt(y) + 543}`;
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
  const resolvedStage = (e?.stage) || stageMap.get(key) || '';
  const stageStyle = resolvedStage ? STAGE[resolvedStage] : null;

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
  emptyReason?: string;
}

function emptyStateMessage(reason: string | undefined): string {
  if (reason === 'market_not_open') return 'ตลาดยังไม่เปิด — ยังไม่มีข้อมูล ranking วันนี้';
  if (reason === 'blocked') return 'เชื่อมต่อ SETTrade ไม่สำเร็จ ลองรีเฟรชอีกครั้ง';
  if (reason === 'no_history') return 'ยังไม่มีข้อมูลย้อนหลังของวันที่เลือก';
  return 'ไม่พบข้อมูล';
}

const STICKY_BG = '#13161e';
const HASH_W = 26;
const SYMBOL_W = 84;
const TH_CLS = 'px-2 py-2 text-left text-[13px] font-bold uppercase tracking-wider text-white/45';

function fmtPe(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toFixed(1);
}

function MoverPanel({ title, accentColor, items, loading, volMode, onSymbol, chartMap, feMap, emptyReason }: PanelProps) {
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
          <span className="text-[12px] text-white/25">{emptyStateMessage(emptyReason)}</span>
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
                      {w52 && w52.high != null && w52.low != null ? (
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
                    {/* CHART — rightmost, hidden on mobile. Candlestick for
                        both live and historical views; falls back to sparkline
                        if candlestick bars are unavailable. */}
                    <td className="hidden sm:table-cell" style={{ paddingTop: 10, paddingBottom: 10, paddingLeft: 8, paddingRight: 8 }}>
                      {sym && (
                        chart?.bars && chart.bars.length > 0
                          ? <MiniCandlestick bars={chart.bars} ema200={chart.ema200} width={180} height={32} />
                          : <TrendSparkline data={sparklineMap[symKey]} width={180} height={32} />
                      )}
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

const EMPTY_RANKING: MarketRanking = { topGainer: [], topLoser: [], mostActiveValue: [], mostActiveVolume: [] };

export default function TopMoversPage() {
  const router = useRouter();
  const [market, setMarket] = useState<Market>('set');
  const [mobilePanel, setMobilePanel] = useState<'gainers' | 'losers'>('gainers');
  const [viewMode, setViewMode] = useState<'today' | 'history'>('today');

  const [historyDates, setHistoryDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState(todayISO());

  const [gainers,     setGainers]     = useState<MoverItem[]>([]);
  const [losers,      setLosers]      = useState<MoverItem[]>([]);
  const [activeValue, setActiveValue] = useState<MoverItem[]>([]);
  const [activeVolume,setActiveVolume]= useState<MoverItem[]>([]);
  const [reasons, setReasons] = useState<{ gainers?: string; losers?: string; activeValue?: string; activeVolume?: string }>({});
  const [label, setLabel] = useState('');
  const [loading, setLoading] = useState(false);
  const [chartMap, setChartMap] = useState<Record<string, ChartEntry>>({});
  const [feMap, setFeMap] = useState<Record<string, Fundamental>>({});

  // Bumped on every loadData call so a slower-resolving request that's no
  // longer current (mode/date/market changed again before it finished, e.g.
  // rapid clicking between วันนี้/ย้อนหลัง) can detect it's stale and skip
  // committing its results over a newer, already-applied load.
  const requestIdRef = useRef(0);

  // Lightweight metadata only (date list) - the full ~MB-scale history file
  // stays server-side, same principle as /api/topmover-charts.
  useEffect(() => {
    fetch('/api/topmover-history')
      .then(r => r.json())
      .then(json => {
        const dates: string[] = json.dates ?? [];
        setHistoryDates(dates);
        if (dates.length > 0) setSelectedDate(dates[dates.length - 1]);
      })
      .catch(() => {});
  }, []);

  const applyRanking = useCallback((m: Market, ranking: { set: MarketRanking; mai: MarketRanking } | MarketRanking, reasonByType?: Partial<Record<RankingType, string>>) => {
    const r: MarketRanking = 'topGainer' in ranking ? ranking : ranking[m];
    setGainers(r.topGainer);
    setLosers(r.topLoser);
    setActiveValue(r.mostActiveValue);
    setActiveVolume(r.mostActiveVolume);
    setReasons({
      gainers: reasonByType?.topGainer,
      losers: reasonByType?.topLoser,
      activeValue: reasonByType?.mostActiveValue,
      activeVolume: reasonByType?.mostActiveVolume,
    });
  }, []);

  const fetchLive = useCallback(async (m: Market) => {
    const [g, l, v, vol] = await Promise.all([
      fetch(`/api/settrade?type=topGainer&market=${m}`).then(r => r.json()),
      fetch(`/api/settrade?type=topLoser&market=${m}`).then(r => r.json()),
      fetch(`/api/settrade?type=mostActiveValue&market=${m}`).then(r => r.json()),
      fetch(`/api/settrade?type=mostActiveVolume&market=${m}`).then(r => r.json()),
    ]);
    return { g, l, v, vol };
  }, []);

  const fetchChartsAndPe = useCallback(async (allSyms: string[], needCharts: boolean) => {
    if (allSyms.length === 0) return { charts: {}, pe: {} };
    const [chartsRes, feRes] = await Promise.all([
      needCharts
        ? fetch(`/api/topmover-charts?tickers=${allSyms.map(encodeURIComponent).join(',')}`).then(r => r.json()).catch(() => null)
        : Promise.resolve(null),
      fetch(`/api/sector-fundamentals?tickers=${allSyms.map(encodeURIComponent).join(',')}`).then(r => r.json()).catch(() => null),
    ]);
    const pe: Record<string, Fundamental> = Array.isArray(feRes?.data)
      ? Object.fromEntries(feRes.data.map((d: { ticker: string; pe: number | null }) => [d.ticker.toUpperCase(), { pe: d.pe }]))
      : {};
    return { charts: chartsRes?.data ?? {}, pe };
  }, []);

  const loadHistoryDate = useCallback(async (m: Market, date: string, reqId: number) => {
    const res = await fetch(`/api/topmover-history?date=${date}`).then(r => r.json()).catch(() => null);
    if (reqId !== requestIdRef.current) return; // a newer load superseded this one - discard
    if (res?.markets) {
      applyRanking(m, res.markets);
      setLabel(`ณ ปิดตลาด ${isoToThaiLabel(res.resolvedDate)}`);
      const mData = res.markets[m] ?? res.markets;
      const allSyms = Array.from(new Set(
        [mData.topGainer, mData.topLoser, mData.mostActiveValue, mData.mostActiveVolume]
          .flat().map((it: MoverItem) => it.symbol?.toUpperCase()).filter((s: string | undefined): s is string => !!s)
      ));
      const { charts, pe } = await fetchChartsAndPe(allSyms, true);
      if (reqId !== requestIdRef.current) return;
      setFeMap(pe);
      setChartMap(charts);
    } else {
      applyRanking(m, EMPTY_RANKING, {
        topGainer: 'no_history', topLoser: 'no_history', mostActiveValue: 'no_history', mostActiveVolume: 'no_history',
      });
      setLabel('');
      setChartMap({});
      setFeMap({});
    }
  }, [applyRanking, fetchChartsAndPe]);

  const loadToday = useCallback(async (m: Market, reqId: number) => {
    const { g, l, v, vol } = await fetchLive(m);
    if (reqId !== requestIdRef.current) return; // a newer load superseded this one - discard
    const allEmpty = [g, l, v, vol].every(r => r.error === 'market_not_open');

    if (allEmpty) {
      // A.3 fallback: realtime has nothing yet (pre-open) - show the most
      // recent day's history instead of a bare "market not open" message.
      const latest = historyDates[historyDates.length - 1];
      if (latest) {
        await loadHistoryDate(m, latest, reqId);
        return;
      }
    }

    setGainers(g.items ?? []);
    setLosers(l.items ?? []);
    setActiveValue(v.items ?? []);
    setActiveVolume(vol.items ?? []);
    setReasons({ gainers: g.error, losers: l.error, activeValue: v.error, activeVolume: vol.error });
    setLabel(isMarketOpenNowBangkok() ? 'ระหว่างวัน · realtime' : `ล่าสุด ${nowThaiTime()}`);

    const allSyms = Array.from(new Set(
      [g.items, l.items, v.items, vol.items]
        .flat()
        .map((it: MoverItem) => (it.symbol as string | undefined)?.toUpperCase())
        .filter((s): s is string => !!s)
    ));
    const { charts, pe } = await fetchChartsAndPe(allSyms, true);
    if (reqId !== requestIdRef.current) return;
    setChartMap(charts);
    setFeMap(pe);
  }, [applyRanking, fetchLive, fetchChartsAndPe, loadHistoryDate, historyDates]);

  const loadData = useCallback(async (m: Market, mode: 'today' | 'history', date: string) => {
    const reqId = ++requestIdRef.current;
    setLoading(true);
    try {
      if (mode === 'today' || date === todayISO()) {
        await loadToday(m, reqId);
      } else {
        await loadHistoryDate(m, date, reqId);
      }
    } catch {
      // keep existing state on error
    } finally {
      if (reqId === requestIdRef.current) setLoading(false);
    }
  }, [loadToday, loadHistoryDate]);

  useEffect(() => {
    // Wait for historyDates to have loaded at least once before the first
    // "today" load, so the A.3 fallback has a real latest-date to use
    // instead of always missing it on the very first render.
    loadData(market, viewMode, selectedDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [market, viewMode, selectedDate, historyDates.length]);

  const go = useCallback((sym: string) => router.push(`/stock/${sym}`), [router]);

  const marketNotOpenBanner = !loading && viewMode === 'today'
    && Object.values(reasons).length > 0 && Object.values(reasons).every(r => r === 'market_not_open')
    && historyDates.length === 0; // only show the bare banner if there's truly no fallback data at all

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[18px] font-bold text-white">Top Movers</h1>
          <p className="text-[12px] text-white/35 mt-0.5">
            {market.toUpperCase()} · SETTrade{label ? ` · ${label}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          <ModeToggle mode={viewMode} onChange={m => { setViewMode(m); if (m === 'today') setSelectedDate(todayISO()); }} />
          <div className="flex gap-2">
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
      </div>

      {viewMode === 'history' && (
        <div className="flex items-center gap-2 flex-wrap">
          <ThaiDateInput
            value={selectedDate}
            min={historyDates[0]}
            max={todayISO()}
            onChange={setSelectedDate}
          />
          <span className="text-[11px] text-white/25">
            {historyDates.length > 0
              ? <>เริ่มสะสม {isoToThaiLabel(historyDates[0])} — มีข้อมูล {historyDates.length} วัน</>
              : 'ยังไม่มีข้อมูลย้อนหลัง (ต้องรอ batch สะสมข้อมูลอย่างน้อย 1 วัน)'}
          </span>
        </div>
      )}

      {marketNotOpenBanner && (
        <div className="px-4 py-2.5 rounded-lg bg-[#EF9F27]/10 border border-[#EF9F27]/25 text-[12px] text-[#EF9F27]">
          ตลาดยังไม่เปิด — SETTrade ยังไม่คำนวณ ranking ของวันนี้ ลองรีเฟรชอีกครั้งหลังตลาดเปิด
        </div>
      )}

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
          ? <MoverPanel title="Top Gainers" accentColor="#1D9E75" items={gainers} loading={loading} volMode="volume" onSymbol={go} chartMap={chartMap} feMap={feMap} emptyReason={reasons.gainers} />
          : <MoverPanel title="Top Losers"  accentColor="#E24B4A" items={losers}  loading={loading} volMode="volume" onSymbol={go} chartMap={chartMap} feMap={feMap} emptyReason={reasons.losers} />
        }
      </div>
      {/* Desktop: side by side */}
      <div className="hidden md:grid md:grid-cols-2 gap-4">
        <MoverPanel title="Top Gainers" accentColor="#1D9E75" items={gainers} loading={loading} volMode="volume" onSymbol={go} chartMap={chartMap} feMap={feMap} emptyReason={reasons.gainers} />
        <MoverPanel title="Top Losers"  accentColor="#E24B4A" items={losers}  loading={loading} volMode="volume" onSymbol={go} chartMap={chartMap} feMap={feMap} emptyReason={reasons.losers} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MoverPanel title="Most Active Value"  accentColor="#378ADD" items={activeValue}  loading={loading} volMode="value"  onSymbol={go} chartMap={chartMap} feMap={feMap} emptyReason={reasons.activeValue} />
        <MoverPanel title="Most Active Volume" accentColor="#BA7517" items={activeVolume} loading={loading} volMode="volume" onSymbol={go} chartMap={chartMap} feMap={feMap} emptyReason={reasons.activeVolume} />
      </div>

      <p className="text-[10px] text-white/20 text-right">
        แหล่งข้อมูล: SETTrade · {market.toUpperCase()}
      </p>
    </div>
  );
}
