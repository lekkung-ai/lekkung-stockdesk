'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { peColor, roeColor } from '@/lib/utils';
import StockChart from './StockChart';
import AiAssistant from './AiAssistant';
import PeerComparisonTable from './PeerComparisonTable';
import MacroFactorCard from './MacroFactorCard';
import { classifyRating, RATING_BUCKET_STYLE } from '@/lib/researchRating';
import { BUCKET_LABEL, BUCKET_BADGE_STYLE } from '@/lib/earningsBucket';
import type { CalendarRow } from '@/app/api/corporate-action/route';
import type { YearlyFinancials } from '@/app/api/financial-history/[ticker]/route';
import type { F45Data } from '@/app/api/f45/[ticker]/route';

// ── Prop types (all from server component) ─────────────────────────────────
interface StageEntry {
  Ticker: string;
  Stage: string;
  Price: number;
  EMA50: number;
  EMA200: number;
  Bar_Count: number;
  'ADTV(MB)': number;
}
interface SepaEntry {
  Ticker: string;
  Price: number;
  RS_Rating: number;
  SMA_50: number;
  SMA_200: number;
  '52W_High': number;
  '%_From_High': number;
}
interface KellEntry {
  Ticker: string;
  Signal: string;
  Price: number;
  EMA10: number;
  'Dist_EMA10_%': number;
  'ADTV(MB)': number;
  Status: string;
}
interface BreakoutEntry {
  Ticker: string;
  Price: number;
  Box_Low: number;
  'Box_High(Break)': number;
  To_Break: number;
  'ADTV(MB)': number;
  Box_Width: number;
  SMA150_Chg: number;
}
interface CombinedEntry {
  ticker: string;
  price: number;
  stage: string | null;
  rs_score: number;
  combo_score: number;
  sepa: boolean;
  kell: boolean;
  breakout: boolean;
}
interface SectorInfo { sector: string; subsector: string; }
interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  sentiment: 'pos' | 'neg' | 'neu';
}
interface ResearchItem {
  title: string;
  link: string;
  pubDate: string;
  ts: number;
  source: string;
  broker: string | null;
  targetPrice: number | null;
  rating: string | null;
  companyName?: string | null;
  fileUrl?: string | null;
}

const NEWS_SOURCE_STYLE: Record<string, string> = {
  InfoQuest: 'bg-[#E6F1FB] text-[#0C447C]',
  'ข่าวหุ้น': 'bg-[#FAEEDA] text-[#633806]',
  'มิติหุ้น': 'bg-[#EAF3DE] text-[#27500A]',
  'มติชน': 'bg-[#F3E8FB] text-[#5B2A86]',
  'Bangkok Post': 'bg-[#FCEBEB] text-[#791F1F]',
};
const newsSourceCls = (s: string) => NEWS_SOURCE_STYLE[s] ?? 'bg-white/[0.07] text-white/50';
interface SecData {
  headers: string[];
  rows: Record<string, string>[];
}
interface FundamentalData {
  pe: number | null;
  pb: number | null;
  roe: number | null;
  eps: number | null;
  de: number | null;
  deMissing: boolean;
  divYield: number | null;
  marketCap: string;
  payoutRatio: number | null;
}

interface Props {
  ticker: string;
  stageEntry: StageEntry | null;
  sepaEntry: SepaEntry | null;
  kellEntry: KellEntry | null;
  breakoutEntry: BreakoutEntry | null;
  combinedEntry: CombinedEntry | null;
  sectorInfo: SectorInfo | null;
  isPpbp?: boolean;
}

// ── Stage style helper ──────────────────────────────────────────────────────
function stageCls(stage: string): string {
  if (!stage) return 'bg-white/[0.07] text-meta';
  if (stage === 'S.Bull') return 'bg-[#1b5e20] text-white';
  if (stage === 'Bull') return 'bg-[#4caf50] text-black font-bold';
  if (stage === 'Accumulation') return 'bg-[#00bcd4] text-black font-bold';
  if (stage === 'Recovery') return 'bg-[#9e9e9e] text-black font-bold';
  if (stage === 'Warning') return 'bg-[#FFEB3B] text-black font-bold';
  if (stage === 'Distribution') return 'bg-[#ff9800] text-black font-bold';
  if (stage === 'UNKNOWN' || stage === 'Unknown') return 'bg-[#424242] text-white font-bold';
  if (stage === 'Bear') return 'bg-[#ef5350] text-white font-bold';
  return 'bg-[#FCEBEB] text-[#791F1F]';
}

// ── Financial history helpers ────────────────────────────────────────────────
type FinKind = 'money' | 'number' | 'percent' | 'ratio';
interface FinRowDef {
  key: keyof YearlyFinancials;
  label: string;
  kind: FinKind;
  emphasize?: boolean;
  showGrowth?: boolean;
}
const FIN_ROWS: FinRowDef[] = [
  { key: 'totalRevenue', label: 'รายได้รวม', kind: 'money', emphasize: true, showGrowth: true },
  { key: 'netIncome', label: 'กำไรสุทธิ', kind: 'money', showGrowth: true },
  { key: 'eps', label: 'EPS', kind: 'number', emphasize: true, showGrowth: true },
  { key: 'grossMargin', label: 'Gross Margin', kind: 'percent' },
  { key: 'netMargin', label: 'Net Profit Margin', kind: 'percent' },
  { key: 'roe', label: 'ROE', kind: 'percent' },
  { key: 'roa', label: 'ROA', kind: 'percent' },
  { key: 'de', label: 'หนี้สินรวม/ทุน (D/E)', kind: 'ratio' },
  { key: 'operatingCashFlow', label: 'กระแสเงินสดจากการดำเนินงาน', kind: 'money' },
  { key: 'freeCashFlow', label: 'กระแสเงินสดอิสระ (FCF)', kind: 'money' },
];

function fmtMoney(n: number | null): string {
  if (n == null) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)} ล้านล้าน`;
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)} พันล้าน`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)} ล้าน`;
  return `${sign}${abs.toLocaleString('th-TH')}`;
}
function formatFinVal(v: number | null, kind: FinKind): string {
  if (v == null) return '—';
  if (kind === 'money') return fmtMoney(v);
  if (kind === 'percent') return `${v.toFixed(1)}%`;
  return v.toFixed(2);
}
function yoyPct(curr: number | null, prev: number | null): number | null {
  if (curr == null || prev == null || prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

// ── SEPA checklist ──────────────────────────────────────────────────────────
function SepaChecklist({ entry }: { entry: SepaEntry }) {
  const fromHigh = entry['%_From_High'];
  const items = [
    {
      label: 'Price > SMA 50',
      pass: entry.Price > entry.SMA_50,
      detail: `${entry.Price.toFixed(2)} > ${entry.SMA_50.toFixed(2)}`,
    },
    {
      label: 'Price > SMA 200',
      pass: entry.Price > entry.SMA_200,
      detail: `${entry.Price.toFixed(2)} > ${entry.SMA_200.toFixed(2)}`,
    },
    {
      label: 'SMA50 > SMA200 (Uptrend)',
      pass: entry.SMA_50 > entry.SMA_200,
      detail: `${entry.SMA_50.toFixed(2)} > ${entry.SMA_200.toFixed(2)}`,
    },
    {
      label: 'RS Rating ≥ 70',
      pass: entry.RS_Rating >= 70,
      detail: String(entry.RS_Rating),
    },
    {
      label: '% From 52W High ≤ 25%',
      pass: Math.abs(fromHigh) <= 25,
      detail: `${fromHigh > 0 ? '+' : ''}${fromHigh.toFixed(1)}%`,
    },
  ];

  return (
    <div className="space-y-2">
      {items.map(item => (
        <div key={item.label} className="flex items-center justify-between gap-3 py-2 border-b border-white/[0.04] last:border-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`flex-shrink-0 text-label font-bold ${item.pass ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>
              {item.pass ? '✓' : '✗'}
            </span>
            <span className="text-label text-white/65 truncate">{item.label}</span>
          </div>
          <span className="text-label text-meta tabular-nums flex-shrink-0">{item.detail}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
export default function StockDetailPage({
  ticker,
  stageEntry,
  sepaEntry,
  kellEntry,
  breakoutEntry,
  combinedEntry,
  sectorInfo,
  isPpbp = false,
}: Props) {
  const router = useRouter();
  const [chartHeight, setChartHeight] = useState(350);
  const [quote, setQuote] = useState<{ price: number; change1d: number; shortName: string } | null>(null);
  const [fundamental, setFundamental] = useState<FundamentalData | null>(null);
  const [news, setNews] = useState<NewsItem[] | null>(null);
  const [newsIsGeneral, setNewsIsGeneral] = useState(false);
  const [research, setResearch] = useState<ResearchItem[] | null>(null);
  const [sec59, setSec59] = useState<SecData | null>(null);
  const [sec246, setSec246] = useState<SecData | null>(null);
  const [upcomingCA, setUpcomingCA] = useState<CalendarRow[]>([]);
  const [financials, setFinancials] = useState<YearlyFinancials[] | null>(null);
  const [f45, setF45] = useState<F45Data | null>(null);

  // Suppress unused warning for breakoutEntry (used as existence check)
  void breakoutEntry;

  useEffect(() => {
    const update = () => setChartHeight(window.innerWidth < 768 ? 250 : 350);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    fetch(`/api/quote/${encodeURIComponent(ticker)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.price != null) setQuote(data); })
      .catch(() => {});
  }, [ticker]);

  useEffect(() => {
    fetch(`/api/fundamental/${encodeURIComponent(ticker)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data && !data.error) setFundamental(data); })
      .catch(() => {});
  }, [ticker]);

  useEffect(() => {
    fetch(`/api/news/${encodeURIComponent(ticker)}`)
      .then(r => r.json())
      .then(data => {
        setNews(data.news ?? []);
        setNewsIsGeneral(data.isGeneral ?? false);
      })
      .catch(() => setNews([]));
  }, [ticker]);

  useEffect(() => {
    fetch(`/api/research/${encodeURIComponent(ticker)}`)
      .then(r => r.json())
      .then(data => setResearch(data.research ?? []))
      .catch(() => setResearch([]));
  }, [ticker]);

  useEffect(() => {
    const t = encodeURIComponent(ticker);
    fetch(`/api/sec-report?type=59&ticker=${t}`)
      .then(r => r.json())
      .then(d => setSec59(d))
      .catch(() => setSec59({ headers: [], rows: [] }));
    fetch(`/api/sec-report?type=246&ticker=${t}`)
      .then(r => r.json())
      .then(d => setSec246(d))
      .catch(() => setSec246({ headers: [], rows: [] }));
  }, [ticker]);

  useEffect(() => {
    const from = new Date().toISOString().slice(0, 10);
    const toDate = new Date();
    toDate.setDate(toDate.getDate() + 7);
    const to = toDate.toISOString().slice(0, 10);
    fetch(`/api/corporate-action?symbol=${encodeURIComponent(ticker)}&from=${from}&to=${to}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => setUpcomingCA(data?.rows ?? []))
      .catch(() => setUpcomingCA([]));
  }, [ticker]);

  useEffect(() => {
    fetch(`/api/financial-history/${encodeURIComponent(ticker)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => setFinancials(Array.isArray(data?.years) ? data.years : null))
      .catch(() => setFinancials(null));
  }, [ticker]);

  useEffect(() => {
    fetch(`/api/f45/${encodeURIComponent(ticker)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => setF45(data ?? null))
      .catch(() => setF45(null));
  }, [ticker]);

  const changeColor = quote
    ? quote.change1d > 0 ? '#1D9E75' : quote.change1d < 0 ? '#E24B4A' : '#9ca3af'
    : '#6b7280';

  const hasAnyScan = !!(stageEntry ?? sepaEntry ?? kellEntry ?? combinedEntry);
  const stage = stageEntry?.Stage ?? combinedEntry?.stage ?? null;
  const rs = combinedEntry?.rs_score ?? null;
  const combo = combinedEntry?.combo_score ?? null;

  return (
    <div className="p-4 md:p-6 space-y-5">

      {/* ── Header ── */}
      <div className="space-y-3">
        {/* Breadcrumb / back */}
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-label text-meta hover:text-white/65 transition-colors"
        >
          <ArrowLeft size={13} />
          กลับ
        </button>

        {/* Ticker + name + price */}
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-3 flex-wrap">
              <h1 className="text-[28px] font-bold text-white leading-none">{ticker}</h1>
              {quote?.shortName && (
                <span className="text-body text-meta truncate">{quote.shortName}</span>
              )}
            </div>
          </div>
          {/* Live price */}
          <div className="flex items-baseline gap-2">
            <span className="text-stat-lg text-ink font-semibold tabular-nums">
              {quote ? quote.price.toFixed(2) : (combinedEntry?.price.toFixed(2) ?? '—')}
            </span>
            {quote && (
              <span className="text-stat font-semibold tabular-nums" style={{ color: changeColor }}>
                {quote.change1d > 0 ? '+' : ''}{quote.change1d.toFixed(2)}%
              </span>
            )}
          </div>
        </div>

        {/* Info badges row */}
        <div className="flex items-center gap-2 flex-wrap">
          {sectorInfo && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-label font-medium bg-white/[0.07] text-white/55">
              {sectorInfo.sector}
            </span>
          )}
          {sectorInfo?.subsector && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-label text-meta bg-white/[0.04]">
              {sectorInfo.subsector}
            </span>
          )}
          {stage && (
            <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-label font-semibold ${stageCls(stage)}`}>
              {stage}
            </span>
          )}
        </div>

        {/* Signal badges row */}
        {(hasAnyScan || isPpbp) && (
          <div className="flex items-center gap-2 flex-wrap">
            {isPpbp && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-label font-bold bg-[#7F77DD]/20 text-[#7F77DD]">
                PPBP 🔥
              </span>
            )}
            {combinedEntry?.sepa && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-label font-bold bg-[#1D9E75]/15 text-[#1D9E75]">
                SEPA
              </span>
            )}
            {combinedEntry?.kell && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-label font-bold bg-[#378ADD]/15 text-[#378ADD]">
                Kell
              </span>
            )}
            {combinedEntry?.breakout && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-label font-bold bg-[#EF9F27]/15 text-[#EF9F27]">
                Breakout
              </span>
            )}
            {rs != null && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-label bg-white/[0.05] text-meta">
                RS <span className="font-bold" style={{ color: rs >= 80 ? '#1D9E75' : rs >= 50 ? '#BA7517' : '#E24B4A' }}>{rs}</span>
              </span>
            )}
            {combo != null && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-label bg-white/[0.05] text-meta">
                Combo <span className="font-bold" style={{ color: combo >= 3 ? '#1D9E75' : combo === 2 ? '#BA7517' : '#6b7280' }}>{combo}/4</span>
              </span>
            )}
            {!hasAnyScan && (
              <span className="text-label text-meta">หุ้นนี้ยังไม่อยู่ในชุดสแกน</span>
            )}
          </div>
        )}
      </div>

      {/* ── Upcoming corporate action warning ── */}
      {upcomingCA.length > 0 && (
        <div className="space-y-1.5">
          {upcomingCA.map((ca, i) => (
            <div
              key={`${ca.caType}-${ca.xDate}-${i}`}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-[#EF9F27]/10 border border-[#EF9F27]/25 text-label text-[#EF9F27]"
            >
              <AlertTriangle size={14} className="flex-shrink-0" />
              <span>
                <span className="font-bold">⚠️ {ca.caType}</span> วันที่ {new Date(ca.xDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
                {ca.detail ? ` · ${ca.detail}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Chart ── */}
      <StockChart ticker={ticker} height={chartHeight} isPpbp={isPpbp} />

      {/* ── Fundamental Data ── */}
      {fundamental && (
        <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-5">
          <h2 className="text-section text-ink mb-4">ข้อมูลพื้นฐาน</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {([
              // Color only where there's a real benchmark to compare against
              // (green/red must mean up/down or pass/fail, not decoration) -
              // the other 6 metrics stay near-white ink. tooltip states the
              // threshold whenever a color is applied.
              { label: 'P/E',        value: fundamental.pe != null    ? fundamental.pe.toFixed(2)      : 'N/A', color: peColor(fundamental.pe), tooltip: 'P/E < 0 ม่วง (ขาดทุน) · < 10 เหลือง (ถูก) · 10-35 เขียว (ปกติ) · > 35 แดง (แพง)' },
              { label: 'P/B',        value: fundamental.pb != null    ? fundamental.pb.toFixed(2)      : '—' },
              { label: 'ROE',        value: fundamental.roe != null   ? `${fundamental.roe.toFixed(1)}%` : '—', color: roeColor(fundamental.roe), tooltip: 'ROE < 0% แดง (ขาดทุน) · 0-15% เหลือง (พอใช้) · > 15% เขียว (ดี)' },
              { label: 'EPS',        value: fundamental.eps != null   ? fundamental.eps.toFixed(2)     : '—' },
              { label: 'D/E',        value: fundamental.de != null ? fundamental.de.toFixed(2) : fundamental.deMissing && sectorInfo?.sector === 'Financials' ? 'N/A (ธนาคาร)' : '—' },
              { label: 'Div Yield',  value: fundamental.divYield != null ? `${fundamental.divYield.toFixed(2)}%` : '—' },
              { label: 'Payout Ratio', value: fundamental.payoutRatio != null ? `${fundamental.payoutRatio.toFixed(1)}%` : '—' },
              { label: 'Market Cap', value: fundamental.marketCap },
            ] as { label: string; value: string; color?: string; tooltip?: string }[]).map(item => (
              <div key={item.label} className="bg-white/[0.03] rounded-lg px-3 py-3" title={item.color ? item.tooltip : undefined}>
                <div className="text-label text-meta mb-1">{item.label}</div>
                <div
                  className="text-body text-ink font-semibold tabular-nums"
                  style={item.color ? { color: item.color } : undefined}
                >
                  {item.value}
                </div>
              </div>
            ))}
          </div>
          <p className="text-label text-meta mt-3 text-right">ที่มา: TradingView · อัปเดตทุก 5 นาที</p>
        </div>
      )}

      {/* ── Financial History ── */}
      {financials && financials.length > 0 && (
        <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-5">
          <h2 className="text-section text-ink mb-4">ตัวเลขทางการเงินสำคัญ</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="pb-2 pr-4 text-label font-semibold uppercase tracking-wider text-meta whitespace-nowrap">รายการ</th>
                  {financials.map(y => (
                    <th key={y.year} className="pb-2 px-3 text-section text-ink/50 text-right whitespace-nowrap">
                      {y.year}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {FIN_ROWS.map(rowDef => {
                  const values = financials.map(y => (y[rowDef.key] as number | null) ?? null);
                  if (values.every(v => v == null)) return null;
                  return (
                    <tr key={rowDef.key}>
                      <td className="py-2.5 pr-4 text-label text-white/60 whitespace-nowrap">{rowDef.label}</td>
                      {financials.map((y, i) => {
                        const val = values[i];
                        const prevVal = values[i + 1] ?? null;
                        const growth = yoyPct(val, prevVal);
                        const color = growth == null ? 'text-white/80' : growth > 0 ? 'text-[#1D9E75]' : growth < 0 ? 'text-[#E24B4A]' : 'text-white/80';
                        return (
                          <td
                            key={y.year}
                            className={`py-2.5 px-3 text-label tabular-nums text-right whitespace-nowrap ${color} ${rowDef.emphasize ? 'font-semibold' : ''}`}
                          >
                            {formatFinVal(val, rowDef.kind)}
                            {rowDef.showGrowth && growth != null && (
                              <span className="ml-1.5 text-label opacity-70">({growth >= 0 ? '+' : ''}{growth.toFixed(1)}%)</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-label text-meta mt-3 text-right">ที่มา: Yahoo Finance · งบการเงินรายปี</p>
        </div>
      )}

      {/* ── F45 - สรุปผลประกอบการล่าสุด ── */}
      <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <h2 className="text-section text-ink">F45 - สรุปผลประกอบการล่าสุด</h2>
          {f45?.found && f45.bucket && (
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-label font-bold ${BUCKET_BADGE_STYLE[f45.bucket]}`}>
              {BUCKET_LABEL[f45.bucket]}
            </span>
          )}
        </div>
        {f45 === null ? (
          <p className="text-label text-meta text-center py-6 animate-pulse">กำลังโหลด...</p>
        ) : !f45.found ? (
          <p className="text-label text-meta text-center py-6">ไม่มีรายงานล่าสุด</p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white/[0.03] rounded-lg px-3 py-2.5">
                <div className="text-label text-meta mb-1">ไตรมาส</div>
                <div className="text-body font-semibold text-white">{f45.quarter ?? '—'}</div>
                {f45.periodEnd && <div className="text-label text-meta mt-0.5">สิ้นสุด {f45.periodEnd}</div>}
              </div>
              <div className="bg-white/[0.03] rounded-lg px-3 py-2.5">
                <div className="text-label text-meta mb-1">กำไร (ขาดทุน) สุทธิ</div>
                <div className="text-body font-semibold text-white">
                  {f45.netProfit != null ? `${fmtMoney(f45.netProfit)} บาท` : '—'}
                </div>
                {f45.netProfitYoY != null && (
                  <div className={`text-label font-semibold mt-0.5 ${f45.netProfitYoY >= 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>
                    {f45.netProfitYoY >= 0 ? '+' : ''}{f45.netProfitYoY.toFixed(1)}% YoY
                  </div>
                )}
              </div>
              <div className="bg-white/[0.03] rounded-lg px-3 py-2.5">
                <div className="text-label text-meta mb-1">กำไรต่อหุ้น (EPS)</div>
                <div className="text-body font-semibold text-white">
                  {f45.eps != null ? `${f45.eps.toFixed(2)} บาท` : '—'}
                </div>
                {f45.epsYoY != null && (
                  <div className={`text-label font-semibold mt-0.5 ${f45.epsYoY >= 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>
                    {f45.epsYoY >= 0 ? '+' : ''}{f45.epsYoY.toFixed(1)}% YoY
                  </div>
                )}
              </div>
              <div className="bg-white/[0.03] rounded-lg px-3 py-2.5">
                <div className="text-label text-meta mb-1">รายงานผู้สอบบัญชี</div>
                <div className="text-body font-semibold text-white">{f45.auditorOpinion ?? '—'}</div>
              </div>
            </div>
            {f45.reason && (
              <div className="mt-3 bg-white/[0.03] rounded-lg px-3 py-2.5">
                <div className="text-label text-meta mb-1">สาเหตุ</div>
                <div className="text-label text-white/70 leading-relaxed">{f45.reason}</div>
              </div>
            )}
            <p className="text-label text-meta mt-3 text-right">
              ที่มา: SET (ผ่าน Settrade) · อัปเดตทุก 6 ชม.
              {f45.newsUrl && (
                <> · <a href={f45.newsUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">ดูข่าวเต็ม</a></>
              )}
              {f45.mdaUrl && (
                <> · <a href={f45.mdaUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">MD&A</a></>
              )}
            </p>
          </>
        )}
      </div>

      {/* ── 2-column detail ── */}
      {!hasAnyScan ? (
        <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-8 text-center">
          <p className="text-body text-meta">หุ้นนี้ยังไม่อยู่ในชุดสแกน</p>
          <p className="text-label text-meta mt-1">ไม่มีข้อมูล SEPA / Stage / Kell สำหรับ {ticker}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Left — SEPA Checklist */}
          <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-section text-ink">SEPA Trend Template</h2>
              {sepaEntry ? (
                <span className="px-2 py-0.5 rounded text-label font-bold bg-[#1D9E75]/15 text-[#1D9E75]">ผ่าน</span>
              ) : (
                <span className="px-2 py-0.5 rounded text-label font-bold bg-[#E24B4A]/10 text-[#E24B4A]">ไม่ผ่าน</span>
              )}
            </div>
            {sepaEntry ? (
              <SepaChecklist entry={sepaEntry} />
            ) : (
              <p className="text-label text-meta text-center py-6">ไม่ผ่าน SEPA Trend Template</p>
            )}
          </div>

          {/* Right — Market Stage + Kell */}
          <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-5 space-y-5">

            {/* Market Stage */}
            <div>
              <h2 className="text-section text-ink mb-3">Market Stage</h2>
              {stageEntry ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-label font-semibold ${stageCls(stageEntry.Stage)}`}>
                      {stageEntry.Stage}
                    </span>
                    <span className="text-label text-meta">
                      อยู่ใน {stageEntry.Stage} มา <span className="text-white/65 font-medium">{stageEntry.Bar_Count}</span> วัน
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'EMA 50', val: stageEntry.EMA50.toFixed(2) },
                      { label: 'EMA 200', val: stageEntry.EMA200.toFixed(2) },
                      // ADTV lives here only - Kell's own scan computes a
                      // separate 5-day figure for its own liquidity gate,
                      // which is a different metric despite the same field
                      // name, so it isn't shown as a second "ADTV" (see
                      // scan_pine_stages.py window=50 vs scan_oliver_kell.py
                      // window=5). Price is dropped - it's already in the
                      // page header, right next to %change.
                      { label: 'ADTV 50D (MB)', val: stageEntry['ADTV(MB)'].toFixed(1) },
                    ].map(r => (
                      <div key={r.label} className="bg-white/[0.03] rounded-lg px-3 py-2">
                        <div className="text-label text-meta mb-0.5">{r.label}</div>
                        <div className="text-label font-medium text-ink tabular-nums">{r.val}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-label text-meta text-center py-3">ไม่มีข้อมูล Stage</p>
              )}
            </div>

            {/* Kell Detail */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-section text-ink">Oliver Kell EMAC</h2>
                {kellEntry ? (
                  <span className="px-2 py-0.5 rounded text-label font-bold bg-[#378ADD]/15 text-[#378ADD]">ผ่าน</span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-label text-meta bg-white/[0.04]">ไม่ผ่าน</span>
                )}
              </div>
              {kellEntry ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-label font-semibold bg-[#378ADD]/15 text-[#378ADD]">
                      {kellEntry.Signal}
                    </span>
                    <span className="text-label text-meta">{kellEntry.Status}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {[
                      { label: 'EMA 10', val: kellEntry.EMA10.toFixed(2) },
                      { label: 'Dist EMA10%', val: `${kellEntry['Dist_EMA10_%'].toFixed(1)}%` },
                    ].map(r => (
                      <div key={r.label} className="bg-white/[0.03] rounded-lg px-3 py-2">
                        <div className="text-label text-meta mb-0.5">{r.label}</div>
                        <div className="text-label font-medium text-ink tabular-nums">{r.val}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-label text-meta text-center py-3">ไม่ผ่าน Oliver Kell EMAC</p>
              )}
            </div>

          </div>
        </div>
      )}

      {/* ── Peer comparison ── */}
      <PeerComparisonTable
        key={ticker}
        ticker={ticker}
        sector={sectorInfo?.sector ?? null}
        subsector={sectorInfo?.subsector ?? null}
      />

      {/* ── Macro factors ── */}
      <MacroFactorCard ticker={ticker} />

      {/* ── Related research ── */}
      {research && research.length > 0 && (
        <div className="bg-[#13161e] border border-white/[0.07] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
            <h2 className="text-section text-ink">บทวิเคราะห์ที่เกี่ยวข้อง</h2>
            <a
              href={`/news?tab=research&ticker=${encodeURIComponent(ticker)}`}
              className="text-label text-[#5B9BD5] hover:text-[#8FC1EA] transition-colors"
            >
              ดูทั้งหมด →
            </a>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {research.slice(0, 5).map((item, i) => (
              <div key={(item.link || '') + i} className="px-5 py-3.5 hover:bg-white/[0.025] transition-colors">
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-label text-white/80 leading-snug line-clamp-2 hover:text-[#5B9BD5] transition-colors"
                >
                  {item.title}
                </a>
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  {item.broker && (
                    <span className="text-label font-bold px-1.5 py-0.5 rounded bg-[#7F77DD]/15 text-[#7F77DD]">
                      {item.broker}
                    </span>
                  )}
                  {item.rating && (
                    <span className={`text-label font-bold px-1.5 py-0.5 rounded ${RATING_BUCKET_STYLE[classifyRating(item.rating)]}`}>
                      {item.rating}
                    </span>
                  )}
                  {item.targetPrice != null && (
                    <span className="text-label font-semibold px-1.5 py-0.5 rounded bg-white/[0.06] text-white/50">
                      เป้า {item.targetPrice} บาท
                    </span>
                  )}
                  {item.fileUrl && (
                    <a
                      href={item.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-label font-semibold px-1.5 py-0.5 rounded bg-white/[0.06] text-white/50 hover:text-white hover:bg-white/[0.1] transition-colors"
                    >
                      PDF
                    </a>
                  )}
                  <span className="text-label text-meta ml-auto">{item.source}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── News section ── */}
      <div className="bg-[#13161e] border border-white/[0.07] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/[0.06]">
          <h2 className="text-section text-ink">ข่าวล่าสุด</h2>
          {newsIsGeneral && (
            <p className="text-label text-meta mt-0.5">ไม่พบข่าวของ {ticker} · แสดงข่าวตลาดทั่วไปแทน</p>
          )}
        </div>

        {news === null ? (
          <div className="px-5 py-6 text-center">
            <span className="text-label text-meta animate-pulse">กำลังโหลดข่าว...</span>
          </div>
        ) : news.length === 0 ? (
          <div className="px-5 py-6 text-center">
            <p className="text-label text-meta">ไม่พบข่าวล่าสุดของ {ticker}</p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {news.map((item, i) => {
              // Neutral carries no information - shown items skip the badge
              // entirely instead of a "Neutral" tag nobody needs to read.
              const sentCls = item.sentiment === 'pos' ? 'bg-[#EAF3DE] text-[#27500A]' : 'bg-[#FCEBEB] text-[#791F1F]';
              const sentLabel = item.sentiment === 'pos' ? 'Positive' : 'Negative';
              const formattedDate = (() => {
                try {
                  const d = new Date(item.pubDate);
                  const diff = Date.now() - d.getTime();
                  const mins = Math.floor(diff / 60000);
                  const hrs = Math.floor(diff / 3600000);
                  if (mins < 60) return `${mins} นาทีที่แล้ว`;
                  if (hrs < 24) return `${hrs} ชั่วโมงที่แล้ว`;
                  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
                } catch { return item.pubDate; }
              })();

              return (
                <a
                  key={i}
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block px-5 py-4 hover:bg-white/[0.025] transition-colors"
                >
                  <p className="text-body text-ink leading-snug line-clamp-2">{item.title}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5 text-label text-meta">
                    {item.sentiment !== 'neu' && (
                      <span className={`font-semibold px-1.5 py-0.5 rounded text-label ${sentCls}`}>
                        {sentLabel}
                      </span>
                    )}
                    <span className={`font-semibold px-1.5 py-0.5 rounded text-label ${newsSourceCls(item.source)}`}>
                      {item.source}
                    </span>
                    <span>·</span>
                    <span>{formattedDate}</span>
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </div>

      {/* ── SEC 59-2 ── */}
      {sec59 && sec59.rows.length > 0 && (
        <SecReportCard title="รายงาน 59-2 · การเปลี่ยนแปลงการถือหลักทรัพย์ของผู้บริหาร" data={sec59} />
      )}

      {/* ── SEC 246 ── */}
      {sec246 && sec246.rows.length > 0 && (
        <SecReportCard title="รายงาน 246-2 · ผู้ถือหุ้นรายใหญ่" data={sec246} />
      )}

      <AiAssistant ticker={ticker} />

    </div>
  );
}

function SecReportCard({ title, data }: { title: string; data: { headers: string[]; rows: Record<string, string>[] } }) {
  return (
    <div className="bg-[#13161e] border border-white/[0.07] rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-white/[0.06]">
        <h2 className="text-section text-ink">{title}</h2>
        <p className="text-label text-meta mt-0.5">ที่มา: สำนักงาน ก.ล.ต.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/[0.06]">
              {data.headers.map(h => (
                <th key={h} className="px-4 py-2.5 text-label font-semibold uppercase tracking-wider text-meta whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.03]">
            {data.rows.map((row, i) => (
              <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                {data.headers.map(h => (
                  <td key={h} className="px-4 py-3 text-label text-white/60 whitespace-nowrap">
                    {row[h] ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
