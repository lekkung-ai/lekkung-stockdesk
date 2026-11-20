'use client';

// หน้าหุ้นรายตัว /stock/[ticker] — layout v2 (mockups/stock-detail-v2.html)
// ① หัวหน้า → ② การ์ดสรุปเทคนิค | พื้นฐาน → ③ กราฟ → ④ รายละเอียดเทคนิค | พื้นฐาน → ⑤ เทียบกลุ่มย่อย → ⑥ แท็บข่าว/ประกาศ/ผู้ถือหุ้น
// ขนาดตัวอักษรในหน้านี้ 4 ระดับ: 28 / 18 / 14 / 12 px · ข้อความรอง #848ca0 · เขียว/แดงเฉพาะดี/แย่
// (class เฉพาะหน้านี้ ไม่แตะ token ทั้งแอปใน globals.css)

import { useState, useEffect, useMemo, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { bangkokDateKey, peColor, roeColor } from '@/lib/utils';
import StockChart from './StockChart';
import AiAssistant from './AiAssistant';
import PeerComparisonTable from './PeerComparisonTable';
import FairValueCompare, { useFairValue } from './FairValueCompare';
import MacroFactorCard from './MacroFactorCard';
import NewsCard from './NewsCard';
import ResearchCard from './ResearchCard';
import { BUCKET_LABEL, BUCKET_BADGE_STYLE } from '@/lib/earningsBucket';
import type { CalendarRow } from '@/app/api/corporate-action/route';
import type { YearlyFinancials } from '@/app/api/financial-history/[ticker]/route';
import type { F45Data } from '@/app/api/f45/[ticker]/route';
import type { ShareholderData } from '@/app/api/shareholder/[ticker]/route';
import NewsFlagBadges from '@/components/NewsFlagBadges';
import NewListingBadge from '@/components/NewListingBadge';
import { thaiDateLabel, type ListingStatus } from '@/lib/listingStatus';
import { sepaChecklistItems, type SepaChecklistRow } from '@/lib/sepaChecklist';
import { macroCommoditiesForTicker } from '@/lib/macroData';
import { getScanGeneratedAt } from '@/lib/scanGeneratedAt';
import { EntryPlanCard, ScanHistoryCard, MoneyFlowCard } from './StockInsightCards';
import type { StockInsights } from '@/lib/stockInsights';
import { techSummary, fundSummary, VALUE_BAND_PCT, type SummaryLine } from '@/lib/stockSummary';

// ── Prop types (all from server component) ─────────────────────────────────
interface StageEntry {
  Ticker: string;
  Stage: string;
  Price: number;
  EMA50: number | null;  // null = ข้อมูลไม่ถึง 50 / 200 วัน (เช่นหุ้นจดทะเบียนใหม่)
  EMA200: number | null;
  Bar_Count: number;
  'ADTV(MB)': number | null;
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
  // ADTV ต่ำกว่า floor (10 ลบ./วัน) ในสแกนที่ผ่าน (sepa/kell) — combo_score
  // นับรวมตามปกติ (confluence คนละแกนกับ liquidity) field นี้แค่ให้ badge
  // "ADTV ต่ำ" ติด optional กัน JSON เก่า
  Low_Liquidity?: boolean;
}
interface SectorInfo { sector: string; subsector: string; }
interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  ts: number;
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
  listingStatus?: ListingStatus | null;
  /** sepa_checklist.json แถวของหุ้นนี้ (null = ไม่มีในไฟล์ / ไฟล์ยังไม่มี) */
  sepaChecklist?: SepaChecklistRow | null;
  /** อ่าน sepa_checklist.json ได้ไหม — false = ไฟล์ยังไม่มี → การ์ด SEPA แบบเดิมทุกอย่าง */
  sepaChecklistLoaded?: boolean;
  isFund?: boolean;
  /** อันดับ RS ในกลุ่มเดียวกับตารางเทียบกลุ่ม (null = คำนวณไม่ได้ → ไม่โชว์อันดับ) */
  rsRank?: { rank: number; n: number; group: string } | null;
  /** การ์ด จุดเข้า / ประวัติในสแกน / แรงเงิน & กลุ่ม (ตัดเฉพาะหุ้นนี้ฝั่ง server · ไม่ส่ง → ไม่โชว์การ์ด) */
  insights?: StockInsights | null;
}

// ── type scale / colors (หน้านี้เท่านั้น) ─────────────────────────────────────
const META = 'text-[#848ca0]';
const INK2 = 'text-[#b4bac8]';
const INK = 'text-[#eceef3]';
const UP_TXT = 'text-[#1D9E75]';
const DOWN_TXT = 'text-[#E24B4A]';
const CARD = '@container bg-[#13161e] border border-white/[0.07] rounded-xl';
const TILE = 'bg-white/[0.035] rounded-lg px-3 py-2.5 min-w-0';

// ── Stage style helper ──────────────────────────────────────────────────────
function stageCls(stage: string): string {
  if (!stage) return 'bg-white/[0.07] text-[#848ca0]';
  if (stage === 'S.Bull') return 'bg-[#1b5e20] text-white';
  if (stage === 'Bull') return 'bg-[#4caf50] text-black font-bold';
  if (stage === 'Accumulation') return 'bg-[#00bcd4] text-black font-bold';
  if (stage === 'Recovery') return 'bg-[#9e9e9e] text-black font-bold';
  if (stage === 'Warning') return 'bg-[#FFEB3B] text-black font-bold';
  if (stage === 'Distribution') return 'bg-[#ff9800] text-black font-bold';
  if (stage === 'UNKNOWN' || stage === 'Unknown') return 'bg-[#424242] text-white font-bold';
  if (stage === 'IPO') return 'bg-white/[0.08] text-white/60 border border-white/20 font-bold'; // ข้อมูลยังไม่พอคำนวณ stage
  if (stage === 'Bear') return 'bg-[#ef5350] text-white font-bold';
  return 'bg-[#FCEBEB] text-[#791F1F]';
}

/** สีตัวอักษรของ stage ในการ์ดสรุป — เขียว/แดงเฉพาะขาขึ้น/ขาลงชัดเจน */
function stageTextCls(stage: string | null): string {
  if (stage === 'S.Bull' || stage === 'Bull') return UP_TXT;
  if (stage === 'Bear') return DOWN_TXT;
  return INK;
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
function signedPct(v: number, digits = 1): string {
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits)}%`;
}
function thDate(iso: string): string {
  return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' });
}
function thShortDateTime(iso: string | number): string {
  return new Date(iso).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });
}

// ── small building blocks ───────────────────────────────────────────────────
function Chip({ children, tone = 'neutral', className = '', title }: { children: ReactNode; tone?: 'neutral' | 'good' | 'bad' | 'warn' | 'info' | 'purple' | 'amber'; className?: string; title?: string }) {
  const cls = {
    neutral: `bg-white/[0.05] ${INK2} border-white/[0.08]`,
    good: 'bg-[#1D9E75]/12 text-[#1D9E75] border-[#1D9E75]/30',
    bad: 'bg-[#E24B4A]/12 text-[#E24B4A] border-[#E24B4A]/30',
    warn: 'bg-[#EF9F27]/12 text-[#EF9F27] border-[#EF9F27]/30',
    info: 'bg-[#378ADD]/12 text-[#378ADD] border-[#378ADD]/30',
    purple: 'bg-[#7F77DD]/15 text-[#7F77DD] border-[#7F77DD]/30',
    amber: 'bg-amber-500/12 text-amber-400 border-amber-500/30',
  }[tone];
  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] font-medium whitespace-nowrap ${cls} ${className}`}>
      {children}
    </span>
  );
}

function SectionHeading({ children, color, right }: { children: ReactNode; color: string; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <h2 className={`flex items-center gap-2.5 text-[18px] font-semibold ${INK}`}>
        <span className="inline-block h-4 w-[3px] rounded" style={{ background: color }} />
        {children}
      </h2>
      {right}
    </div>
  );
}

function SubHeading({ children, right, first = false }: { children: ReactNode; right?: ReactNode; first?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 flex-wrap mb-2 ${first ? '' : 'mt-5'}`}>
      <h3 className={`text-[14px] font-semibold ${INK}`}>{children}</h3>
      {right}
    </div>
  );
}

function Tile({ label, value, sub, valueCls = INK, subCls = META, testId }: { label: string; value: ReactNode; sub?: ReactNode; valueCls?: string; subCls?: string; testId?: string }) {
  return (
    <div className={TILE} data-testid={testId}>
      <div className={`text-[12px] font-medium ${META}`}>{label}</div>
      <div className={`text-[18px] font-semibold leading-snug mt-0.5 break-words ${valueCls}`}>{value}</div>
      {sub != null && <div className={`text-[12px] mt-0.5 break-words ${subCls}`}>{sub}</div>}
    </div>
  );
}

function Verdict({ line }: { line: SummaryLine | null }) {
  if (!line) return null;
  const cls = line.tone === 'good'
    ? 'bg-[#1D9E75]/10 text-[#9fe3c8]'
    : line.tone === 'bad'
      ? 'bg-[#E24B4A]/10 text-[#f5b5b4]'
      : `bg-white/[0.04] ${INK2}`;
  return <div className={`text-[14px] px-3 py-2 rounded-lg mb-3 ${cls}`} data-testid="summary-verdict" data-tone={line.tone}>{line.text}</div>;
}

// ── SEPA checklist (เดิม: sepa.json 5 ข้อ — ใช้เมื่อไม่มี sepa_checklist.json) ──────
function SepaChecklist({ entry }: { entry: SepaEntry }) {
  const fromHigh = entry['%_From_High'];
  const items = [
    { label: 'Price > SMA 50', pass: entry.Price > entry.SMA_50, detail: `${entry.Price.toFixed(2)} > ${entry.SMA_50.toFixed(2)}` },
    { label: 'Price > SMA 200', pass: entry.Price > entry.SMA_200, detail: `${entry.Price.toFixed(2)} > ${entry.SMA_200.toFixed(2)}` },
    { label: 'SMA50 > SMA200 (Uptrend)', pass: entry.SMA_50 > entry.SMA_200, detail: `${entry.SMA_50.toFixed(2)} > ${entry.SMA_200.toFixed(2)}` },
    { label: 'RS Rating ≥ 70', pass: entry.RS_Rating >= 70, detail: String(entry.RS_Rating) },
    { label: '% From 52W High ≤ 25%', pass: Math.abs(fromHigh) <= 25, detail: `${fromHigh > 0 ? '+' : ''}${fromHigh.toFixed(1)}%` },
  ];
  return (
    <div>
      {items.map(item => <CheckRow key={item.label} pass={item.pass} label={item.label} detail={item.detail} />)}
    </div>
  );
}

function CheckRow({ pass, label, detail, failDetailRed = false }: { pass: boolean; label: string; detail: string; failDetailRed?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-white/[0.05] last:border-0" data-pass={pass ? 'true' : 'false'}>
      <div className="flex items-start gap-2.5 min-w-0">
        <span className={`mt-0.5 grid h-[18px] w-[18px] flex-none place-items-center rounded-full text-[12px] font-bold ${pass ? 'bg-[#1D9E75]/15 text-[#1D9E75]' : 'bg-[#E24B4A]/15 text-[#E24B4A]'}`}>
          {pass ? '✓' : '✗'}
        </span>
        <span className={`text-[14px] ${INK} leading-snug`}>{label}</span>
      </div>
      <span className={`text-[12px] flex-shrink-0 text-right ${!pass && failDetailRed ? DOWN_TXT : INK2}`}>{detail}</span>
    </div>
  );
}

// ── SEPA 8 ข้อ (sepa_checklist.json) ─────────────────────────────────────────
function SepaChecklist8({ row }: { row: SepaChecklistRow }) {
  return (
    <div data-testid="sepa-checklist-8">
      {sepaChecklistItems(row).map(item => (
        <CheckRow key={item.n} pass={item.pass} label={`${item.n}. ${item.label}`} detail={item.detail} failDetailRed />
      ))}
    </div>
  );
}

// ── Listing status banner (delisted / renamed · active / unknown → nothing) ──
function ListingStatusBanner({ status }: { status: ListingStatus | null }) {
  if (status?.status === 'delisted') {
    const date = thaiDateLabel(status.date);
    return (
      <div
        className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-[#E24B4A]/10 border border-[#E24B4A]/30 text-[12px] text-[#E24B4A]"
        data-testid="listing-status-banner"
        data-status="delisted"
      >
        <AlertTriangle size={14} className="flex-shrink-0" />
        <span>
          {status.stillTrading ? (
            <span className="font-bold">ตลาดประกาศเพิกถอนแล้ว · ยังเปิดซื้อขายชั่วคราว</span>
          ) : (
            <>
              <span className="font-bold">{date ? `ตลาดประกาศเพิกถอนเมื่อ ${date}` : 'ตลาดประกาศเพิกถอนแล้ว'}</span> · ข้อมูลด้านล่างเป็นข้อมูลล่าสุดที่มี
            </>
          )}
        </span>
      </div>
    );
  }
  if (status?.status === 'renamed' && status.newTicker) {
    const date = thaiDateLabel(status.date);
    return (
      <div
        className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-[#378ADD]/10 border border-[#378ADD]/30 text-[12px] text-[#378ADD]"
        data-testid="listing-status-banner"
        data-status="renamed"
        title={date ? `พบครั้งแรก ${date}` : undefined}
      >
        <AlertTriangle size={14} className="flex-shrink-0" />
        <span>
          เปลี่ยนชื่อเป็น{' '}
          <Link href={`/stock/${encodeURIComponent(status.newTicker)}`} className="font-bold underline underline-offset-2 hover:text-white">
            {status.newTicker}
          </Link>
        </span>
      </div>
    );
  }
  return null;
}

function Pager({ page, total, onPrev, onNext }: { page: number; total: number; onPrev: () => void; onNext: () => void }) {
  if (total <= 1) return null;
  const btn = `flex items-center gap-1 text-[12px] font-medium ${INK2} hover:text-white disabled:opacity-30 transition-colors px-3 py-1.5 rounded-lg bg-white/[0.05]`;
  return (
    <div className="flex items-center justify-between pt-3 mt-1 border-t border-white/[0.06]">
      <button onClick={onPrev} disabled={page === 1} className={btn}><ChevronLeft size={14} /> ก่อนหน้า</button>
      <span className={`text-[12px] ${META} font-medium`}>หน้า {page} จาก {total}</span>
      <button onClick={onNext} disabled={page >= total} className={btn}>ถัดไป <ChevronRight size={14} /></button>
    </div>
  );
}

type TabKey = 'set' | 'news' | 'calendar' | 'holders' | 'sec' | 'macro';

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
  listingStatus = null,
  sepaChecklist = null,
  sepaChecklistLoaded = false,
  isFund = false,
  rsRank = null,
  insights = null,
}: Props) {
  const router = useRouter();

  // ป้ายผ่าน/ไม่ผ่านเชื่อ sepa.json เสมอ · sepa_checklist ไม่ตรง (เช่นไฟล์คนละรอบ) → เตือนใน console เท่านั้น
  useEffect(() => {
    if (sepaChecklist && sepaChecklist.All_Pass !== !!sepaEntry) {
      console.warn(`[SEPA] ${ticker}: sepa_checklist All_Pass=${sepaChecklist.All_Pass} but sepa.json ${sepaEntry ? 'has' : 'does not have'} it - showing sepa.json's verdict`);
    }
  }, [ticker, sepaChecklist, sepaEntry]);
  const [chartHeight, setChartHeight] = useState(350);
  const [quote, setQuote] = useState<{ price: number; change1d: number; shortName: string } | null>(null);
  const [quoteAt, setQuoteAt] = useState<number | null>(null);
  const [fundamental, setFundamental] = useState<FundamentalData | null>(null);
  const [news, setNews] = useState<NewsItem[] | null>(null);
  const [newsIsGeneral, setNewsIsGeneral] = useState(false);
  const [research, setResearch] = useState<ResearchItem[] | null>(null);
  const [sec59, setSec59] = useState<SecData | null>(null);
  const [sec246, setSec246] = useState<SecData | null>(null);
  const [upcomingCA, setUpcomingCA] = useState<CalendarRow[]>([]);
  const [financials, setFinancials] = useState<YearlyFinancials[] | null>(null);
  const [f45, setF45] = useState<F45Data | null>(null);
  const [f45Failed, setF45Failed] = useState(false);
  const [shareholders, setShareholders] = useState<ShareholderData | null>(null);
  const [shareholdersFailed, setShareholdersFailed] = useState(false);
  const [fullCA, setFullCA] = useState<CalendarRow[] | null>(null);
  const [setNewsPage, setSetNewsPage] = useState(1);
  const [generalNewsPage, setGeneralNewsPage] = useState(1);
  const [tab, setTab] = useState<TabKey>('set');

  // Suppress unused warning for breakoutEntry (used as existence check)
  void breakoutEntry;

  useEffect(() => {
    const update = () => setChartHeight(window.innerWidth < 768 ? 250 : 350);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    fetch(`/api/quote/${encodeURIComponent(ticker)}?soft=1`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.price != null) { setQuote(data); setQuoteAt(Date.now()); } })
      .catch(() => {});
  }, [ticker]);

  useEffect(() => {
    fetch(`/api/fundamental/${encodeURIComponent(ticker)}?soft=1`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data && !data.error && !data.noData) setFundamental(data); })
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
    const from = bangkokDateKey(); // today .. +7 days, Asia/Bangkok
    const to = bangkokDateKey(Date.now() + 7 * 86400000);
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
      .then(data => { setF45(data ?? null); setF45Failed(!data); })
      .catch(() => { setF45(null); setF45Failed(true); });
  }, [ticker]);

  useEffect(() => {
    fetch(`/api/shareholder/${encodeURIComponent(ticker)}?soft=1`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const ok = data && !data.noData ? (data as ShareholderData) : null;
        setShareholders(ok);
        setShareholdersFailed(!ok);
      })
      .catch(() => { setShareholders(null); setShareholdersFailed(true); });
  }, [ticker]);

  useEffect(() => {
    fetch(`/api/corporate-action?symbol=${encodeURIComponent(ticker)}&from=2024-01-01&to=2027-12-31`)
      .then(r => r.ok ? r.json() : null)
      .then(data => setFullCA(data?.rows ?? []))
      .catch(() => setFullCA([]));
  }, [ticker]);

  const setNewsList = useMemo(() => {
    if (!news) return [];
    return news.filter(n => n.source === 'SET (ตลาดหลักทรัพย์)' || n.link.includes('set.or.th'));
  }, [news]);

  const generalNewsList = useMemo(() => {
    if (!news) return [];
    return news.filter(n => n.source !== 'SET (ตลาดหลักทรัพย์)' && !n.link.includes('set.or.th'));
  }, [news]);

  const SET_PER_PAGE = 5;
  const totalSetPages = Math.max(1, Math.ceil(setNewsList.length / SET_PER_PAGE));
  const currentSetNews = useMemo(() => {
    const start = (setNewsPage - 1) * SET_PER_PAGE;
    return setNewsList.slice(start, start + SET_PER_PAGE);
  }, [setNewsList, setNewsPage]);

  const GEN_PER_PAGE = 5;
  const totalGenPages = Math.max(1, Math.ceil(generalNewsList.length / GEN_PER_PAGE));
  const currentGenNews = useMemo(() => {
    const start = (generalNewsPage - 1) * GEN_PER_PAGE;
    return generalNewsList.slice(start, start + GEN_PER_PAGE);
  }, [generalNewsList, generalNewsPage]);

  const hasAnyScan = !!(stageEntry ?? sepaEntry ?? kellEntry ?? combinedEntry);
  const stage = stageEntry?.Stage ?? combinedEntry?.stage ?? null;
  const rs = combinedEntry?.rs_score ?? null;
  const combo = combinedEntry?.combo_score ?? null;
  const isFinancials = sectorInfo?.sector === 'Financials';

  const livePrice = quote?.price ?? combinedEntry?.price ?? null;
  const fv = useFairValue(ticker, livePrice);

  // ── ตัวเลขการ์ดสรุป (ใช้แหล่งเดียวกับส่วนรายละเอียด) ──
  const sepaPassCount = sepaChecklist ? sepaChecklist.Pass_Count : sepaEntry ? 8 : null;
  const fromHigh = sepaChecklist && sepaChecklist['52W_High'] > 0
    ? { pct: (sepaChecklist.Price / sepaChecklist['52W_High'] - 1) * 100, high: sepaChecklist['52W_High'] }
    : sepaEntry ? { pct: sepaEntry['%_From_High'], high: sepaEntry['52W_High'] } : null;
  const adtv = stageEntry?.['ADTV(MB)'] ?? null;
  const techLine = hasAnyScan
    ? techSummary({ sepaPassCount, sepaPass: !!sepaEntry, kellPass: !!kellEntry, stage })
    : null;
  const f45Found = f45?.found ? f45 : null;
  const fundLine = fundSummary({ fairUpsidePct: fv.loading ? null : fv.medianUpside, profitYoYPct: f45Found?.netProfitYoY ?? null });
  const scanAt = getScanGeneratedAt('market_stage');
  const grp = fv.group;
  const groupLabel = grp ? (grp.level === 'sector' ? `sector ${grp.sector}` : grp.sector) : null;

  // ── แท็บ: ซ่อนแท็บที่โหลดเสร็จแล้วไม่มีข้อมูล · ตัวเลขข้างชื่อ = จำนวนรายการเมื่อโหลดเสร็จ ──
  const macroCount = macroCommoditiesForTicker(ticker).length;
  const researchList = research ?? [];
  const secRows = (sec59?.rows.length ?? 0) + (sec246?.rows.length ?? 0);
  const tabs: { key: TabKey; label: string; count: number | null; visible: boolean }[] = [
    { key: 'set', label: 'ข่าวแจ้งตลาด', count: news ? setNewsList.length : null, visible: news === null || setNewsList.length > 0 },
    { key: 'news', label: 'ข่าว & บทวิเคราะห์', count: news && research ? generalNewsList.length + researchList.length : null, visible: news === null || research === null || generalNewsList.length + researchList.length > 0 },
    { key: 'calendar', label: 'ปฏิทินหลักทรัพย์', count: fullCA ? fullCA.length : null, visible: fullCA === null || fullCA.length > 0 },
    { key: 'holders', label: 'ผู้ถือหุ้นใหญ่', count: null, visible: !shareholdersFailed },
    { key: 'sec', label: '59-2 / 246-2', count: sec59 && sec246 ? secRows : null, visible: sec59 === null || sec246 === null || secRows > 0 },
    { key: 'macro', label: 'Macro', count: null, visible: macroCount > 0 },
  ];
  const visibleTabs = tabs.filter(t => t.visible);
  const activeTab: TabKey | null = visibleTabs.some(t => t.key === tab) ? tab : visibleTabs[0]?.key ?? null;

  const changeAbs = quote && quote.change1d !== -100 ? quote.price - quote.price / (1 + quote.change1d / 100) : null;
  const changeCls = quote ? (quote.change1d > 0 ? UP_TXT : quote.change1d < 0 ? DOWN_TXT : META) : META;

  // ── ตัวเลขสำคัญ (ของเดิม 8 ช่อง + ปันผล/หุ้น · D/E ซ่อนสำหรับกลุ่มการเงิน) ──
  const dps = fv.ddmInputs?.dps ?? null;
  const keyNumbers: { label: string; value: string; color?: string; tooltip?: string }[] = fundamental ? [
    // สีเฉพาะที่มีเกณฑ์เทียบจริง (เขียว/แดง = ดี/แย่) — tooltip บอกเกณฑ์
    { label: 'P/E', value: fundamental.pe != null ? fundamental.pe.toFixed(2) : 'N/A', color: peColor(fundamental.pe), tooltip: 'P/E < 0 ม่วง (ขาดทุน) · < 10 เหลือง (ถูก) · 10-35 เขียว (ปกติ) · > 35 แดง (แพง)' },
    { label: 'P/BV', value: fundamental.pb != null ? fundamental.pb.toFixed(2) : '—' },
    { label: 'ROE', value: fundamental.roe != null ? `${fundamental.roe.toFixed(1)}%` : '—', color: roeColor(fundamental.roe), tooltip: 'ROE < 0% แดง (ขาดทุน) · 0-15% เหลือง (พอใช้) · > 15% เขียว (ดี)' },
    { label: 'EPS', value: fundamental.eps != null ? fundamental.eps.toFixed(2) : '—' },
    { label: 'ปันผล/หุ้น', value: dps != null && dps > 0 ? dps.toFixed(2) : '—' },
    { label: 'Div Yield', value: fundamental.divYield != null ? `${fundamental.divYield.toFixed(2)}%` : '—' },
    { label: 'Payout Ratio', value: fundamental.payoutRatio != null ? `${fundamental.payoutRatio.toFixed(1)}%` : '—' },
    { label: 'Market Cap', value: fundamental.marketCap || '—' },
    ...(isFinancials ? [] : [{ label: 'D/E', value: fundamental.de != null ? fundamental.de.toFixed(2) : '—' }]),
  ] : [];

  return (
    <div className="@container p-4 md:p-6 space-y-7 text-[14px] tabular-nums" data-testid="stock-detail-v2">

      {/* ── ① Header ── */}
      <div className="space-y-3">
        <button
          onClick={() => router.back()}
          className={`flex items-center gap-1.5 text-[12px] ${META} hover:text-[#b4bac8] transition-colors`}
        >
          <ArrowLeft size={13} />
          กลับ
        </button>

        <ListingStatusBanner status={listingStatus} />

        <div className="flex flex-wrap items-end justify-between gap-4 pb-4 border-b border-white/[0.07]">
          <div className="min-w-0">
            <div className="flex items-baseline gap-3 flex-wrap">
              <h1 className={`text-[28px] font-bold leading-none ${INK}`}>{ticker}</h1>
              {quote?.shortName && <span className={`text-[14px] ${INK2}`}>{quote.shortName}</span>}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap mt-2.5" data-testid="header-badges">
              {sectorInfo && <Chip>{sectorInfo.sector}</Chip>}
              {sectorInfo?.subsector && <Chip>{sectorInfo.subsector}</Chip>}
              {stage && (
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-semibold ${stageCls(stage)}`}>{stage}</span>
              )}
              {isPpbp && <Chip tone="purple">PPBP 🔥</Chip>}
              {combinedEntry?.sepa && <Chip tone="good">SEPA</Chip>}
              {combinedEntry?.kell && <Chip tone="info">Kell</Chip>}
              {combinedEntry?.breakout && <Chip tone="warn">Breakout</Chip>}
              {rs != null && (
                <Chip>RS <span className="font-bold" style={{ color: rs >= 80 ? '#1D9E75' : rs >= 50 ? '#BA7517' : '#E24B4A' }}>{rs}</span></Chip>
              )}
              {combo != null && (
                <Chip>Combo <span className="font-bold" style={{ color: combo >= 3 ? '#1D9E75' : combo === 2 ? '#BA7517' : '#848ca0' }}>{combo}/4</span></Chip>
              )}
              {combinedEntry?.Low_Liquidity && (
                <Chip tone="amber" title="ADTV ต่ำกว่า floor (10 ลบ./วัน) ในสแกนที่ผ่าน — ผ่านเกณฑ์เทรนด์/สัญญาณ แต่เข้า-ออกยาก">ADTV ต่ำ</Chip>
              )}
              {isPpbp && !hasAnyScan && <span className={`text-[12px] ${META}`}>หุ้นนี้ยังไม่อยู่ในชุดสแกน</span>}
              <NewListingBadge ticker={ticker} />
              <NewsFlagBadges ticker={ticker} />
            </div>
          </div>
          <div className="text-right">
            <div
              className={`text-[28px] font-bold leading-tight ${INK}`}
              title={quote ? 'ราคา Yahoo Finance · ล่าช้าราว 15 นาที' : 'ราคาปิด ณ วันสแกน (ดึงราคาสดไม่ได้)'}
              data-testid="header-price"
            >
              {quote ? quote.price.toFixed(2) : (combinedEntry?.price.toFixed(2) ?? '—')}
            </div>
            {quote && (
              <div className={`text-[14px] font-semibold ${changeCls}`}>
                {changeAbs != null && <>{changeAbs > 0 ? '+' : changeAbs < 0 ? '−' : ''}{Math.abs(changeAbs).toFixed(2)} </>}
                ({signedPct(quote.change1d, 2)})
              </div>
            )}
            <div className={`text-[12px] ${META}`}>
              {quote && quoteAt
                ? `ล่าช้าราว 15 นาที · ดึงเมื่อ ${thShortDateTime(quoteAt)}`
                : combinedEntry ? `ราคาปิด ณ วันสแกน${scanAt ? ` ${thShortDateTime(scanAt)}` : ''}` : null}
            </div>
          </div>
        </div>
      </div>

      {/* ── Upcoming corporate action warning ── */}
      {upcomingCA.length > 0 && (
        <div className="space-y-1.5 -mt-3">
          {upcomingCA.map((ca, i) => (
            <div
              key={`${ca.caType}-${ca.xDate}-${i}`}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-[#EF9F27]/10 border border-[#EF9F27]/25 text-[12px] text-[#EF9F27]"
            >
              <AlertTriangle size={14} className="flex-shrink-0" />
              <span>
                <span className="font-bold">⚠️ {ca.caType}</span> วันที่ {thDate(ca.xDate)}
                {ca.detail ? ` · ${ca.detail}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── ② การ์ดสรุป เทคนิค | พื้นฐาน ── */}
      <div className="grid grid-cols-1 @4xl:grid-cols-2 gap-4">
        <div className={`${CARD} p-4`} data-testid="summary-card" data-kind="tech">
          <div className="flex items-center justify-between gap-3 mb-3">
            <span className="text-[14px] font-semibold text-[#93c5fd]">เทคนิค</span>
            {scanAt && <span className={`text-[12px] ${META}`}>สแกน {thShortDateTime(scanAt)}</span>}
          </div>
          {!hasAnyScan ? (
            <p className={`text-[14px] ${META} py-6 text-center`}>หุ้นนี้ยังไม่อยู่ในชุดสแกน — ไม่มีข้อมูล SEPA / Stage / Kell</p>
          ) : (
            <>
              <Verdict line={techLine} />
              <div className="grid grid-cols-2 @lg:grid-cols-3 gap-2">
                <Tile
                  label="Stage"
                  value={stage ?? '—'}
                  valueCls={stageTextCls(stage)}
                  sub={stageEntry ? (stageEntry.Stage === 'IPO' ? 'ข้อมูลยังไม่พอคำนวณ' : `มา ${stageEntry.Bar_Count} วัน`) : undefined}
                  testId="sum-stage"
                />
                <Tile
                  label="SEPA"
                  value={sepaPassCount != null ? `${sepaEntry ? 8 : sepaPassCount}/8` : sepaEntry ? 'ผ่าน' : '—'}
                  valueCls={sepaEntry ? UP_TXT : INK}
                  sub={sepaEntry ? 'ผ่าน' : 'ไม่ผ่าน'}
                  testId="sum-sepa"
                />
                <Tile
                  label="Oliver Kell"
                  value={kellEntry ? kellEntry.Signal : 'ไม่ผ่าน'}
                  valueCls={kellEntry ? UP_TXT : META}
                  sub={kellEntry ? `ห่าง EMA10 ${kellEntry['Dist_EMA10_%'].toFixed(1)}%` : '—'}
                  testId="sum-kell"
                />
                <Tile
                  label="RS Rating"
                  value={rs ?? '—'}
                  sub={rsRank ? `อันดับ ${rsRank.rank} จาก ${rsRank.n} ใน ${rsRank.group}` : undefined}
                  testId="sum-rs"
                />
                <Tile
                  label="จากจุดสูง 52W"
                  value={fromHigh ? signedPct(fromHigh.pct) : '—'}
                  sub={fromHigh ? `สูงสุด ${fromHigh.high.toFixed(2)}` : undefined}
                  testId="sum-52w"
                />
                <Tile
                  label="ADTV 50 วัน"
                  value={adtv != null ? adtv.toLocaleString('en-US', { maximumFractionDigits: adtv >= 100 ? 0 : 1 }) : '—'}
                  sub={adtv != null ? 'ล้านบาท/วัน' : undefined}
                  testId="sum-adtv"
                />
              </div>
            </>
          )}
        </div>

        <div className={`${CARD} p-4`} data-testid="summary-card" data-kind="fund">
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <span className="text-[14px] font-semibold text-[#d8b4fe]">พื้นฐาน</span>
            <span className={`text-[12px] ${META}`}>
              {[f45Found?.quarter ? `งบ ${f45Found.quarter}` : null, groupLabel && grp ? `เทียบ ${groupLabel} ${Math.max(grp.nPe, grp.nPb)} ตัว` : null].filter(Boolean).join(' · ')}
            </span>
          </div>
          <Verdict line={fundLine} />
          <div className="grid grid-cols-2 @lg:grid-cols-3 gap-2">
            <Tile
              label="P/E"
              value={fundamental?.pe != null ? `${fundamental.pe.toFixed(2)}×` : '—'}
              sub={grp?.secPe != null ? `กลุ่ม ${grp.secPe.toFixed(1)}×` : undefined}
              testId="sum-pe"
            />
            <Tile
              label="P/BV"
              value={fundamental?.pb != null ? `${fundamental.pb.toFixed(2)}×` : '—'}
              sub={grp?.secPb != null ? `กลุ่ม ${grp.secPb.toFixed(2)}×` : undefined}
              testId="sum-pbv"
            />
            <Tile
              label="ราคาเหมาะสม"
              value={fv.medianFair != null ? <>{fv.medianFair >= 100 ? Math.round(fv.medianFair).toLocaleString('en-US') : fv.medianFair.toFixed(2)} <span className={`text-[12px] font-normal ${META}`}>บาท</span></> : '—'}
              sub={fv.medianUpside != null ? (fv.medianUpside < 0 ? `ต่ำกว่าราคา ${Math.abs(fv.medianUpside).toFixed(0)}%` : fv.medianUpside > 0 ? `สูงกว่าราคา ${fv.medianUpside.toFixed(0)}%` : 'เท่าราคา') : undefined}
              subCls={fv.medianUpside == null ? META : fv.medianUpside < -VALUE_BAND_PCT ? DOWN_TXT : fv.medianUpside > VALUE_BAND_PCT ? UP_TXT : META}
              testId="sum-fair"
            />
            <Tile
              label={f45Found?.quarter ? `กำไร ${f45Found.quarter}` : 'กำไรไตรมาสล่าสุด'}
              value={f45Found?.netProfit != null ? fmtMoney(f45Found.netProfit) : '—'}
              sub={f45Found?.netProfitYoY != null ? `${signedPct(f45Found.netProfitYoY)} YoY` : undefined}
              subCls={f45Found?.netProfitYoY == null ? META : f45Found.netProfitYoY >= 0 ? UP_TXT : DOWN_TXT}
              testId="sum-profit"
            />
            <Tile
              label="ROE"
              value={fundamental?.roe != null ? `${fundamental.roe.toFixed(1)}%` : '—'}
              testId="sum-roe"
            />
            <Tile
              label="ปันผล"
              value={fundamental?.divYield != null ? `${fundamental.divYield.toFixed(2)}%` : '—'}
              sub={fundamental?.payoutRatio != null ? `Payout ${fundamental.payoutRatio.toFixed(1)}%` : undefined}
              testId="sum-div"
            />
          </div>
        </div>
      </div>

      {/* ── ③ Chart ── */}
      <StockChart ticker={ticker} height={chartHeight} isPpbp={isPpbp} soft />

      {/* ── ④ รายละเอียด เทคนิค | พื้นฐาน ── */}
      <div className="grid grid-cols-1 @4xl:grid-cols-2 gap-4 items-start">
        <section>
          <SectionHeading color="#60a5fa">รายละเอียดเทคนิค</SectionHeading>
          <div className={`${CARD} p-4`} data-testid="detail-tech">
            {!hasAnyScan ? (
              <div className="py-6 text-center">
                <p className={`text-[14px] ${META}`}>หุ้นนี้ยังไม่อยู่ในชุดสแกน</p>
                <p className={`text-[12px] ${META} mt-1`}>ไม่มีข้อมูล SEPA / Stage / Kell สำหรับ {ticker}</p>
              </div>
            ) : (
              <>
                {/* SEPA (พฤติกรรมเดิมจาก 0afe8796: ป้ายเชื่อ sepa.json · 8 ข้อ → 5 ข้อเดิม → ข้อความ) */}
                <SubHeading
                  first
                  right={
                    <span className="flex items-center gap-2">
                      {!sepaEntry && sepaChecklist && (
                        <span className={`text-[12px] ${META}`} data-testid="sepa-pass-count">ผ่าน {sepaChecklist.Pass_Count}/8</span>
                      )}
                      {sepaEntry ? <Chip tone="good">ผ่าน</Chip> : <Chip tone="bad">ไม่ผ่าน</Chip>}
                    </span>
                  }
                >
                  SEPA Trend Template
                </SubHeading>
                {sepaChecklist ? (
                  <SepaChecklist8 row={sepaChecklist} />
                ) : sepaEntry ? (
                  <SepaChecklist entry={sepaEntry} />
                ) : (
                  <p className={`text-[12px] ${META} text-center py-4`}>
                    {sepaChecklistLoaded && !isFund ? 'ข้อมูลราคาไม่พอคำนวณ' : 'ไม่ผ่าน SEPA Trend Template'}
                  </p>
                )}

                {/* Market Stage */}
                <SubHeading
                  right={stageEntry ? (
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-semibold ${stageCls(stageEntry.Stage)}`}>
                      {stageEntry.Stage}{stageEntry.Stage !== 'IPO' ? ` · ${stageEntry.Bar_Count} วัน` : ''}
                    </span>
                  ) : undefined}
                >
                  Market Stage
                </SubHeading>
                {stageEntry ? (
                  <>
                    <p className={`text-[12px] ${META} mb-2`}>
                      {stageEntry.Stage === 'IPO'
                        ? 'หุ้นจดทะเบียนใหม่ — ข้อมูลราคายังไม่พอคำนวณ stage (ต้องมี EMA200)'
                        : <>อยู่ใน {stageEntry.Stage} มา <span className={`${INK2} font-medium`}>{stageEntry.Bar_Count}</span> วัน</>}
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {/* ADTV อยู่ที่นี่ที่เดียว - Kell คิด ADTV 5 วันของตัวเองซึ่งเป็นคนละตัวเลข
                          (scan_pine_stages.py window=50 vs scan_oliver_kell.py window=5) */}
                      <Tile label="EMA 50" value={stageEntry.EMA50 != null ? stageEntry.EMA50.toFixed(2) : '—'} />
                      <Tile label="EMA 200" value={stageEntry.EMA200 != null ? stageEntry.EMA200.toFixed(2) : '—'} />
                      <Tile label="ADTV 50D (MB)" value={stageEntry['ADTV(MB)'] != null ? stageEntry['ADTV(MB)'].toFixed(1) : '—'} />
                    </div>
                  </>
                ) : (
                  <p className={`text-[12px] ${META} text-center py-3`}>ไม่มีข้อมูล Stage</p>
                )}

                {/* Oliver Kell */}
                <SubHeading right={kellEntry ? <Chip tone="info">ผ่าน · {kellEntry.Signal}</Chip> : <Chip>ไม่ผ่าน</Chip>}>
                  Oliver Kell EMAC
                </SubHeading>
                {kellEntry ? (
                  <div className="grid grid-cols-3 gap-2">
                    <Tile label="EMA 10" value={kellEntry.EMA10.toFixed(2)} />
                    <Tile label="ห่าง EMA10" value={`${kellEntry['Dist_EMA10_%'].toFixed(1)}%`} />
                    <Tile label="สถานะ" value={<span className="text-[14px]">{kellEntry.Status}</span>} />
                  </div>
                ) : (
                  <p className={`text-[12px] ${META} text-center py-3`}>ไม่ผ่าน Oliver Kell EMAC</p>
                )}
              </>
            )}
          </div>
          {insights && (
            <>
              <EntryPlanCard plan={insights.entryPlan} livePrice={quote?.price ?? null} isFund={isFund} />
              <ScanHistoryCard data={insights.history} />
            </>
          )}
        </section>

        <section>
          <SectionHeading color="#c084fc">รายละเอียดพื้นฐาน</SectionHeading>
          <div className={`${CARD} p-4`} data-testid="detail-fund">
            {/* F45 */}
            <SubHeading
              first
              right={f45?.found && f45.bucket ? (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[12px] font-bold ${BUCKET_BADGE_STYLE[f45.bucket]}`}>
                  {BUCKET_LABEL[f45.bucket]}
                </span>
              ) : undefined}
            >
              งบล่าสุด (F45){f45?.found && f45.quarter ? ` · ${f45.quarter}` : ''}
            </SubHeading>
            {f45 === null ? (
              f45Failed
                ? <p className={`text-[12px] ${META} text-center py-4`}>ไม่มีข้อมูล</p>
                : <p className={`text-[12px] ${META} text-center py-4 animate-pulse`}>กำลังโหลด...</p>
            ) : !f45.found ? (
              <p className={`text-[12px] ${META} text-center py-4`}>ไม่มีรายงานล่าสุด</p>
            ) : (
              <>
                <div className="grid grid-cols-2 @lg:grid-cols-3 gap-2">
                  <Tile
                    label="กำไร (ขาดทุน) สุทธิ"
                    value={f45.netProfit != null ? <>{fmtMoney(f45.netProfit)} <span className={`text-[12px] font-normal ${META}`}>บาท</span></> : '—'}
                    sub={f45.netProfitYoY != null ? `${signedPct(f45.netProfitYoY)} YoY` : undefined}
                    subCls={f45.netProfitYoY == null ? META : f45.netProfitYoY >= 0 ? UP_TXT : DOWN_TXT}
                  />
                  <Tile
                    label="กำไรต่อหุ้น (EPS)"
                    value={f45.eps != null ? <>{f45.eps.toFixed(2)} <span className={`text-[12px] font-normal ${META}`}>บาท</span></> : '—'}
                    sub={f45.epsYoY != null ? `${signedPct(f45.epsYoY)} YoY` : undefined}
                    subCls={f45.epsYoY == null ? META : f45.epsYoY >= 0 ? UP_TXT : DOWN_TXT}
                  />
                  <Tile label="รายงานผู้สอบบัญชี" value={<span className="text-[14px]">{f45.auditorOpinion ?? '—'}</span>} />
                </div>
                {f45.reason && (
                  <div className={`mt-2 ${TILE}`}>
                    <div className={`text-[12px] ${META} mb-0.5`}>สาเหตุ</div>
                    <div className={`text-[14px] ${INK2} leading-relaxed`}>{f45.reason}</div>
                  </div>
                )}
                <p className={`text-[12px] ${META} mt-2`}>
                  {f45.quarter ?? ''}{f45.periodEnd ? `${f45.quarter ? ' · ' : ''}สิ้นสุด ${f45.periodEnd}` : ''}
                  {(f45.quarter || f45.periodEnd) ? ' · ' : ''}ที่มา: SET (ผ่าน Settrade) · อัปเดตทุก 6 ชม.
                  {f45.newsUrl && (
                    <> · <a href={f45.newsUrl} target="_blank" rel="noopener noreferrer" className="text-[#8b9cff] hover:text-[#b4bfff]">ดูข่าวเต็ม</a></>
                  )}
                  {f45.mdaUrl && (
                    <> · <a href={f45.mdaUrl} target="_blank" rel="noopener noreferrer" className="text-[#8b9cff] hover:text-[#b4bfff]">MD&A</a></>
                  )}
                </p>
              </>
            )}

            {/* ตัวเลขสำคัญ */}
            {fundamental && (
              <>
                <SubHeading right={<span className={`text-[12px] ${META}`}>SETTrade · อัปเดตทุก 5 นาที</span>}>ตัวเลขสำคัญ</SubHeading>
                <div className={`grid grid-cols-2 gap-2 ${keyNumbers.length === 9 ? '@lg:grid-cols-3' : '@lg:grid-cols-4'}`} data-testid="key-numbers">
                  {keyNumbers.map(item => (
                    <div key={item.label} className={TILE} title={item.color ? item.tooltip : undefined}>
                      <div className={`text-[12px] font-medium ${META}`}>{item.label}</div>
                      <div className={`text-[18px] font-semibold mt-0.5 break-words ${INK}`} style={item.color ? { color: item.color } : undefined}>
                        {item.value}
                      </div>
                    </div>
                  ))}
                </div>
                {isFinancials && (
                  <p className={`text-[12px] ${META} mt-2`}>D/E ไม่แสดงสำหรับกลุ่มการเงิน (หนี้สินคือเงินฝาก/เงินกู้ยืมที่เป็นวัตถุดิบของธุรกิจ เทียบกับกลุ่มอื่นไม่ได้)</p>
                )}
              </>
            )}

            {/* ราคาเหมาะสม */}
            <div className="mt-5">
              <FairValueCompare fv={fv} />
            </div>

            {/* ตัวเลขการเงินย้อนหลัง (ตารางเดิม) */}
            {financials && financials.length > 0 && (
              <>
                <SubHeading right={<span className={`text-[12px] ${META}`}>Yahoo Finance · งบการเงินรายปี</span>}>ตัวเลขการเงินย้อนหลัง</SubHeading>
                <div className="overflow-x-auto -mx-1 px-1">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        <th className={`pb-2 pr-3 text-[12px] font-medium ${META} whitespace-nowrap`}>รายการ</th>
                        {financials.map(y => (
                          <th key={y.year} className={`pb-2 px-2 text-[12px] font-medium ${META} text-right whitespace-nowrap`}>{y.year}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {FIN_ROWS.map(rowDef => {
                        const values = financials.map(y => (y[rowDef.key] as number | null) ?? null);
                        if (values.every(v => v == null)) return null;
                        return (
                          <tr key={rowDef.key}>
                            <td className={`py-2 pr-3 text-[12px] ${INK2} align-top min-w-[132px]`}>{rowDef.label}</td>
                            {financials.map((y, i) => {
                              const val = values[i];
                              const prevVal = values[i + 1] ?? null;
                              const growth = yoyPct(val, prevVal);
                              const color = growth == null ? INK : growth > 0 ? UP_TXT : growth < 0 ? DOWN_TXT : INK;
                              return (
                                <td key={y.year} className={`py-2 px-2 text-[12px] text-right align-top whitespace-nowrap ${color} ${rowDef.emphasize ? 'font-semibold' : ''}`}>
                                  {formatFinVal(val, rowDef.kind)}
                                  {rowDef.showGrowth && growth != null && (
                                    <span className="block opacity-75 font-normal">{growth >= 0 ? '+' : ''}{growth.toFixed(1)}%</span>
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
              </>
            )}
          </div>
          {insights && <MoneyFlowCard data={insights.moneyFlow} />}
        </section>
      </div>

      {/* ── ⑤ เทียบกลุ่มย่อย ── */}
      <PeerComparisonTable
        key={ticker}
        ticker={ticker}
        sector={sectorInfo?.sector ?? null}
        subsector={sectorInfo?.subsector ?? null}
      />

      {/* ── ⑥ แท็บ: ข่าว ประกาศ และผู้ถือหุ้น ── */}
      {activeTab && (
        <section>
          <SectionHeading color="#8b9cff">ข่าว ประกาศ และผู้ถือหุ้น</SectionHeading>
          <div className={`${CARD} px-4 pb-3`}>
            <div className="flex gap-0.5 border-b border-white/[0.07] overflow-x-auto" role="tablist" data-testid="stock-tabs">
              {visibleTabs.map(t => (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={activeTab === t.key}
                  data-tab={t.key}
                  onClick={() => setTab(t.key)}
                  className={`whitespace-nowrap px-3.5 py-2.5 text-[14px] border-b-2 -mb-px transition-colors ${activeTab === t.key ? `${INK} border-[#8b9cff]` : `${META} border-transparent hover:text-[#b4bac8]`}`}
                >
                  {t.label}
                  {t.count != null && <span className={`ml-1.5 text-[12px] ${META}`}>{t.count}</span>}
                </button>
              ))}
            </div>

            <div className="pt-3" role="tabpanel" data-testid={`tab-panel-${activeTab}`}>
              {/* ข่าวแจ้งตลาด (set.or.th) */}
              {activeTab === 'set' && (
                news === null ? (
                  <p className={`text-[12px] ${META} text-center py-6 animate-pulse`}>กำลังโหลดข่าวแจ้งตลาด...</p>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                      <Chip tone="info">SET (ตลาดหลักทรัพย์) · set.or.th</Chip>
                      <span className={`text-[12px] ${META}`}>ทั้งหมด {setNewsList.length} ข่าว</span>
                    </div>
                    <div className="divide-y divide-white/[0.04] -mx-4">
                      {currentSetNews.map((item, i) => <NewsCard key={(item.link || '') + i} item={item} />)}
                    </div>
                    <Pager page={setNewsPage} total={totalSetPages} onPrev={() => setSetNewsPage(p => Math.max(1, p - 1))} onNext={() => setSetNewsPage(p => Math.min(totalSetPages, p + 1))} />
                  </>
                )
              )}

              {/* ข่าวทั่วไป & บทวิเคราะห์ */}
              {activeTab === 'news' && (
                <div className="space-y-5">
                  {news === null && research === null && (
                    <p className={`text-[12px] ${META} text-center py-6 animate-pulse`}>กำลังโหลด...</p>
                  )}
                  {researchList.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <h3 className={`text-[14px] font-semibold ${INK}`}>บทวิเคราะห์ที่เกี่ยวข้อง</h3>
                        <a href={`/news?tab=research&ticker=${encodeURIComponent(ticker)}`} className="text-[12px] text-[#8b9cff] hover:text-[#b4bfff] transition-colors">
                          ดูทั้งหมด ({researchList.length}) →
                        </a>
                      </div>
                      <div className="divide-y divide-white/[0.04] -mx-4">
                        {researchList.slice(0, 5).map((item, i) => (
                          <ResearchCard key={(item.link || '') + i} item={item} className="px-4 py-3" />
                        ))}
                      </div>
                    </div>
                  )}
                  {generalNewsList.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className={`text-[14px] font-semibold ${INK}`}>{newsIsGeneral ? 'ข่าวตลาดรวม' : 'ข่าวทั่วไป & บทวิเคราะห์สื่อ'}</h3>
                          {newsIsGeneral && <Chip tone="amber">ไม่มีข่าวเจาะจง {ticker} · ข่าวรวมตลาด</Chip>}
                        </div>
                        <span className={`text-[12px] ${META}`}>ทั้งหมด {generalNewsList.length} ข่าว</span>
                      </div>
                      <div className="divide-y divide-white/[0.04] -mx-4">
                        {currentGenNews.map((item, i) => <NewsCard key={(item.link || '') + i} item={item} />)}
                      </div>
                      <Pager page={generalNewsPage} total={totalGenPages} onPrev={() => setGeneralNewsPage(p => Math.max(1, p - 1))} onNext={() => setGeneralNewsPage(p => Math.min(totalGenPages, p + 1))} />
                    </div>
                  )}
                </div>
              )}

              {/* ปฏิทินหลักทรัพย์ */}
              {activeTab === 'calendar' && (
                fullCA === null ? (
                  <p className={`text-[12px] ${META} text-center py-6 animate-pulse`}>กำลังโหลด...</p>
                ) : (
                  <>
                    <p className={`text-[12px] ${META} mb-1`}>ปฏิทินสิทธิประโยชน์หุ้น {ticker} (Corporate Action Calendar)</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="border-b border-white/[0.06]">
                            <th className={`px-3 py-2.5 text-[12px] font-medium ${META} whitespace-nowrap`}>วันที่ขึ้นเครื่องหมาย (X-Date)</th>
                            <th className={`px-3 py-2.5 text-[12px] font-medium ${META} whitespace-nowrap`}>เครื่องหมาย</th>
                            <th className={`px-3 py-2.5 text-[12px] font-medium ${META}`}>รายละเอียด</th>
                            <th className={`px-3 py-2.5 text-[12px] font-medium ${META} whitespace-nowrap text-right`}>วันจ่ายเงิน / ประชุม</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.03]">
                          {fullCA.map((ca, i) => {
                            const badgeCls =
                              ca.caType === 'XD' ? 'bg-[#1D9E75]/20 text-[#1D9E75] border border-[#1D9E75]/40' :
                              ca.caType === 'XM' ? 'bg-[#378ADD]/20 text-[#378ADD] border border-[#378ADD]/40' :
                              ca.caType === 'XR' ? 'bg-[#EF9F27]/20 text-[#EF9F27] border border-[#EF9F27]/40' :
                              ca.caType === 'XW' ? 'bg-[#7F77DD]/20 text-[#7F77DD] border border-[#7F77DD]/40' :
                              'bg-white/10 text-white/70 border border-white/20';
                            return (
                              <tr key={`${ca.caType}-${ca.xDate}-${i}`} className="hover:bg-white/[0.02] transition-colors">
                                <td className={`px-3 py-2.5 text-[12px] font-semibold ${INK} whitespace-nowrap`}>{thDate(ca.xDate)}</td>
                                <td className="px-3 py-2.5 whitespace-nowrap">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[12px] font-bold ${badgeCls}`}>{ca.caType}</span>
                                </td>
                                <td className={`px-3 py-2.5 text-[12px] ${INK2} leading-relaxed`}>{ca.detail || '—'}</td>
                                <td className={`px-3 py-2.5 text-[12px] ${META} whitespace-nowrap text-right`}>{ca.payDate ? thDate(ca.payDate) : '—'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )
              )}

              {/* ผู้ถือหุ้นรายใหญ่ */}
              {activeTab === 'holders' && (
                shareholders === null ? (
                  <p className={`text-[12px] ${META} text-center py-6 animate-pulse`}>กำลังโหลดผู้ถือหุ้นรายใหญ่...</p>
                ) : (
                  <div className="space-y-3">
                    {shareholders.bookCloseDate && (
                      <p className={`text-[12px] ${META}`}>
                        ผู้ถือหุ้นรายใหญ่ (Major Shareholders) · ข้อมูล ณ วันปิดสมุดทะเบียน: <span className={`${INK} font-medium`}>{thDate(shareholders.bookCloseDate)}</span>
                      </p>
                    )}
                    <div className="grid grid-cols-2 @2xl:grid-cols-4 gap-2">
                      <Tile
                        label="วันปิดสมุดทะเบียนล่าสุด"
                        value={<span className="text-[14px]">{shareholders.bookCloseDate ? thDate(shareholders.bookCloseDate) : '—'}</span>}
                        sub={shareholders.caType ? `ประเภท: ${shareholders.caType}` : undefined}
                      />
                      <Tile label="จำนวนผู้ถือหุ้นทั้งหมด" value={shareholders.totalShareholder != null ? `${shareholders.totalShareholder.toLocaleString()} ราย` : '—'} />
                      <Tile
                        label="Free Float (ผู้ถือหุ้นรายย่อย)"
                        value={shareholders.freeFloat?.percentFreeFloat != null ? `${shareholders.freeFloat.percentFreeFloat.toFixed(2)}%` : '—'}
                        sub={shareholders.freeFloat?.numberOfHolder != null ? `${shareholders.freeFloat.numberOfHolder.toLocaleString()} ราย` : undefined}
                      />
                      <Tile label="Scriptless (หุ้นไร้ใบ)" value={shareholders.percentScriptless != null ? `${shareholders.percentScriptless.toFixed(1)}%` : '—'} />
                    </div>
                    {shareholders.majorShareholders.length === 0 ? (
                      <p className={`text-[12px] ${META} text-center py-4`}>ไม่พบข้อมูลผู้ถือหุ้นรายใหญ่</p>
                    ) : (
                      <div className="overflow-x-auto rounded-lg border border-white/[0.06]">
                        <table className="w-full text-left">
                          <thead>
                            <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                              <th className={`px-3 py-2.5 text-[12px] font-medium ${META} w-14 text-center`}>ลำดับ</th>
                              <th className={`px-3 py-2.5 text-[12px] font-medium ${META}`}>ชื่อผู้ถือหุ้น</th>
                              <th className={`px-3 py-2.5 text-[12px] font-medium ${META} text-right`}>จำนวนหุ้น</th>
                              <th className={`px-3 py-2.5 text-[12px] font-medium ${META} text-right w-24`}>สัดส่วน (%)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/[0.03]">
                            {shareholders.majorShareholders.map(item => (
                              <tr key={item.sequence} className="hover:bg-white/[0.02] transition-colors">
                                <td className={`px-3 py-2 text-[12px] ${META} text-center font-medium`}>{item.sequence}</td>
                                <td className={`px-3 py-2 text-[12px] font-medium ${INK}`}>
                                  <span className="inline-flex items-center gap-2 flex-wrap">
                                    <span>{item.name}</span>
                                    {item.isThaiNVDR && (
                                      <span className="px-1.5 py-0.5 rounded text-[12px] font-bold bg-[#7F77DD]/20 text-[#7F77DD] border border-[#7F77DD]/30">NVDR</span>
                                    )}
                                  </span>
                                </td>
                                <td className={`px-3 py-2 text-[12px] ${INK2} text-right whitespace-nowrap`}>{item.numberOfShare.toLocaleString()}</td>
                                <td className="px-3 py-2 text-[12px] text-[#60A5FA] font-semibold text-right">{item.percentOfShare.toFixed(2)}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )
              )}

              {/* 59-2 / 246-2 */}
              {activeTab === 'sec' && (
                sec59 === null && sec246 === null ? (
                  <p className={`text-[12px] ${META} text-center py-6 animate-pulse`}>กำลังโหลด...</p>
                ) : (
                  <div className="space-y-5">
                    {sec59 && sec59.rows.length > 0 && (
                      <SecReportTable title="รายงาน 59-2 · การเปลี่ยนแปลงการถือหลักทรัพย์ของผู้บริหาร" data={sec59} />
                    )}
                    {sec246 && sec246.rows.length > 0 && (
                      <SecReportTable title="รายงาน 246-2 · ผู้ถือหุ้นรายใหญ่ (ประวัติได้มา/จำหน่ายหุ้น 3 ปีย้อนหลัง)" data={sec246} />
                    )}
                    {(sec59 === null || sec246 === null) && (
                      <p className={`text-[12px] ${META} text-center py-2 animate-pulse`}>กำลังโหลด...</p>
                    )}
                  </div>
                )
              )}

              {/* Macro (component เดิม · การ์ดของตัวเอง) */}
              {activeTab === 'macro' && <MacroFactorCard ticker={ticker} />}
            </div>
          </div>
        </section>
      )}

      <AiAssistant ticker={ticker} />

    </div>
  );
}

function SecReportTable({ title, data }: { title: string; data: { headers: string[]; rows: Record<string, string>[] } }) {
  return (
    <div>
      <h3 className={`text-[14px] font-semibold ${INK}`}>{title}</h3>
      <p className={`text-[12px] ${META} mt-0.5 mb-1`}>ที่มา: สำนักงาน ก.ล.ต.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/[0.06]">
              {data.headers.map(h => (
                <th key={h} className={`px-3 py-2.5 text-[12px] font-medium ${META} whitespace-nowrap`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.03]">
            {data.rows.map((row, i) => (
              <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                {data.headers.map(h => (
                  <td key={h} className={`px-3 py-2.5 text-[12px] ${INK2} whitespace-nowrap`}>{row[h] ?? '—'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
