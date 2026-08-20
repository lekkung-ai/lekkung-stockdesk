'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { RefreshCw, Search, ChevronLeft, ChevronRight, ExternalLink, FileBarChart, X } from 'lucide-react';
import { SortableTh, SortConfig, TableWrap, Th, Td } from '@/components/StrategyTable';
import TableSkeleton from '@/components/TableSkeleton';
import TrendSparkline from '@/components/TrendSparkline';
import { sparklineMap } from '@/lib/sparklineData';
import { BUCKET_ORDER, BUCKET_LABEL, BUCKET_COLOR, BUCKET_BADGE_STYLE, type EarningsBucket } from '@/lib/earningsBucket';
import { classifyQoQ, QOQ_COLOR, QOQ_LABEL, QOQ_BADGE_STYLE, getAccelerationStatus } from '@/lib/qoqBucket';
import type { EarningsFeed, EarningsAnnouncement, EarningsCalendarEntry } from '@/app/api/earnings/route';

// cap % ที่ ±1000 กันเลขระเบิดจากฐานจิ๋ว/พลิกขั้ว — คืน string พร้อมเครื่องหมาย
// คืน { text, title } : text = ที่โชว์, title = ค่าจริงสำหรับ hover
function fmtGrowthPct(n: number | null | undefined): { text: string; title: string } {
  if (n == null || !Number.isFinite(n)) return { text: '—', title: '' };
  const real = `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
  if (n > 1000) return { text: '>+1000%', title: real };
  if (n < -1000) return { text: '<-1000%', title: real };
  return { text: real, title: real };
}

const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const WEEKDAY_LABELS = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์'];

// ── Date helpers (all UTC-based ISO string math - the ISO strings we compare
// against already carry Bangkok's +07:00 offset, so slicing to yyyy-mm-dd
// gives the correct Bangkok calendar date without any client-side tz math) ──

function addDaysISO(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function mondayOf(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  return addDaysISO(iso, diff);
}
// Predicted dates land on whatever weekday the filing did last year - if
// that's a weekend, roll forward to the next Monday for display purposes.
function rollToWeekday(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  const day = d.getUTCDay();
  if (day === 6) return addDaysISO(iso, 2);
  if (day === 0) return addDaysISO(iso, 1);
  return iso;
}
function isoToThaiDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${parseInt(d)} ${MONTHS[parseInt(m) - 1]} ${parseInt(y) + 543}`;
}
function isoDateTimeToThai(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const day = d.getDate();
  const month = MONTHS[d.getMonth()];
  const year = d.getFullYear() + 543;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${year} ${hh}:${mm} น.`;
}
function timeOnly(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function fmtMoney(n: number | null): string {
  if (n == null) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)} พันล้าน`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)} ล้าน`;
  return `${sign}${abs.toLocaleString('th-TH')}`;
}

const EMPTY_FEED: EarningsFeed = {
  generatedAt: '', windowDays: 45, universeSize: 0,
  buckets: {} as EarningsFeed['buckets'], announcements: [], calendar: [],
};

const BUCKET_FILTER_OPTS = ['ทั้งหมด', ...BUCKET_ORDER] as const;
type BucketFilterOpt = (typeof BUCKET_FILTER_OPTS)[number];

// ── Bucket summary cards - clickable, IS the status filter (not a separate
// row of filter buttons duplicating the same 6 states below) ───────────────

function BucketCards({
  feed, activeFilter, onFilterChange,
}: {
  feed: EarningsFeed;
  activeFilter: BucketFilterOpt;
  onFilterChange: (b: BucketFilterOpt) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {BUCKET_ORDER.map(key => {
        const b = feed.buckets[key];
        const color = BUCKET_COLOR[key];
        const isActive = activeFilter === key;
        return (
          <button
            key={key}
            onClick={() => onFilterChange(isActive ? 'ทั้งหมด' : key)}
            title={isActive ? 'แตะเพื่อยกเลิกกรอง' : `กรองตาราง: ${BUCKET_LABEL[key]}`}
            className={`text-left bg-[#13161e] border rounded-xl p-3.5 transition-colors ${
              isActive ? 'border-white/25 bg-white/[0.04]' : 'border-white/[0.07] hover:border-white/15'
            }`}
            style={{ borderLeft: `3px solid ${color}` }}
          >
            <div className="text-label font-semibold" style={{ color }}>{BUCKET_LABEL[key]}</div>
            <div className="text-stat text-ink mt-0.5 tabular-nums">{b?.count ?? 0}</div>
            <div className="mt-2 space-y-0.5">
              {(b?.top3 ?? []).length === 0 ? (
                <div className="text-label text-meta">—</div>
              ) : (
                b.top3.map((t, i) => (
                  <div key={`${t.ticker}-${i}`} className="flex items-center justify-between text-label">
                    <span className="text-white/60 font-medium">{t.ticker}</span>
                    <span className="tabular-nums" style={{ color }} title={fmtGrowthPct(t.netProfitYoY).title}>
                      {fmtGrowthPct(t.netProfitYoY).text}
                    </span>
                  </div>
                ))
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Week calendar strip ─────────────────────────────────────────────────────

function WeekCalendarStrip({ feed }: { feed: EarningsFeed }) {
  const router = useRouter();
  const [weekOffset, setWeekOffset] = useState(0);

  const todayAnchor = new Date().toISOString().slice(0, 10);
  const weekMonday = addDaysISO(mondayOf(todayAnchor), weekOffset * 7);
  const weekDates = [0, 1, 2, 3, 4].map(i => addDaysISO(weekMonday, i));

  const announcementByTicker = useMemo(
    () => new Map(feed.announcements.map(a => [a.ticker, a])),
    [feed.announcements]
  );

  const chipsByDate = useMemo(() => {
    const map = new Map<string, { confirmed: EarningsCalendarEntry[]; predicted: EarningsCalendarEntry[] }>();
    const confirmedTickers = new Set<string>();

    // 1. Primary source for confirmed earnings: feed.announcements
    for (const a of feed.announcements) {
      if (!a.announceDate) continue;
      const rawDate = a.announceDate.slice(0, 10);
      if (!map.has(rawDate)) map.set(rawDate, { confirmed: [], predicted: [] });
      map.get(rawDate)!.confirmed.push({
        ticker: a.ticker,
        date: a.announceDate,
        status: 'confirmed',
        quarter: a.quarter,
      });
      confirmedTickers.add(a.ticker);
    }

    // 2. Secondary source for confirmed: feed.calendar entries (if any ticker isn't in announcements)
    for (const c of feed.calendar) {
      if (c.status === 'confirmed' && !confirmedTickers.has(c.ticker)) {
        const rawDate = c.date.slice(0, 10);
        if (!map.has(rawDate)) map.set(rawDate, { confirmed: [], predicted: [] });
        map.get(rawDate)!.confirmed.push(c);
        confirmedTickers.add(c.ticker);
      }
    }

    // 3. Source for predicted earnings: feed.calendar (dedup: skip if ticker is already confirmed & skip predicted overdue)
    for (const c of feed.calendar) {
      if (c.status === 'predicted' && !confirmedTickers.has(c.ticker)) {
        const raw = c.date.slice(0, 10);
        if (raw < todayAnchor) continue;
        const effDate = rollToWeekday(raw);
        if (!map.has(effDate)) map.set(effDate, { confirmed: [], predicted: [] });
        map.get(effDate)!.predicted.push(c);
      }
    }

    return map;
  }, [feed.announcements, feed.calendar, todayAnchor]);

  return (
    <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-label font-semibold text-white/60">
          สัปดาห์ {isoToThaiDate(weekDates[0])} – {isoToThaiDate(weekDates[4])}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setWeekOffset(w => w - 1)}
            className="p-1.5 rounded-lg border border-white/[0.07] text-meta hover:text-white/70 transition-colors"
          >
            <ChevronLeft size={13} />
          </button>
          {weekOffset !== 0 && (
            <button
              onClick={() => setWeekOffset(0)}
              className="px-2 py-1 rounded-lg text-label text-meta hover:text-white/70 transition-colors"
            >
              สัปดาห์นี้
            </button>
          )}
          <button
            onClick={() => setWeekOffset(w => w + 1)}
            className="p-1.5 rounded-lg border border-white/[0.07] text-meta hover:text-white/70 transition-colors"
          >
            <ChevronRight size={13} />
          </button>
          <Link
            href="/calendar"
            className="ml-1.5 text-label text-blue-400 hover:text-blue-300 whitespace-nowrap"
          >
            ดูปฏิทินเต็ม →
          </Link>
        </div>
      </div>

      <div className="relative">
      <div className="overflow-x-auto">
        <div className="grid grid-cols-5 gap-2 min-w-[600px]">
          {weekDates.map((date, i) => {
            const chips = chipsByDate.get(date);
            const isToday = date === todayAnchor;
            const hasChips = chips && (chips.confirmed.length > 0 || chips.predicted.length > 0);
            return (
              <div
                key={date}
                className={`rounded-lg p-2 min-h-[110px] ${isToday ? 'bg-white/[0.05] ring-1 ring-white/15' : 'bg-white/[0.02]'}`}
              >
                <div className="text-label text-meta mb-1">
                  {WEEKDAY_LABELS[i]} · {isoToThaiDate(date)}
                </div>
                <div className="flex flex-wrap gap-1">
                  {(chips?.confirmed ?? []).map(c => {
                    const bucket = announcementByTicker.get(c.ticker)?.bucket ?? null;
                    const color = bucket ? BUCKET_COLOR[bucket] : '#9ca3af';
                    return (
                      <button
                        key={`c-${c.ticker}`}
                        onClick={() => router.push(`/stock/${c.ticker}`)}
                        title={`${c.ticker} · ประกาศแล้ว`}
                        className="px-1.5 py-0.5 rounded text-label font-semibold transition-opacity hover:opacity-80"
                        style={{ backgroundColor: `${color}26`, color }}
                      >
                        {c.ticker}
                      </button>
                    );
                  })}
                  {(chips?.predicted ?? []).map(c => (
                    <button
                      key={`p-${c.ticker}`}
                      onClick={() => router.push(`/stock/${c.ticker}`)}
                      title="คาดการณ์ - อิงวันประกาศงวดเดียวกันปีก่อน"
                      className="px-1.5 py-0.5 rounded text-label font-medium bg-white/[0.04] text-meta border border-dashed border-white/10 hover:text-white/55 transition-colors"
                    >
                      {c.ticker}
                    </button>
                  ))}
                  {!hasChips && <div className="text-label text-meta">—</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {/* Scroll affordance - this grid intentionally scrolls horizontally on
          narrow screens (5 fixed-width day columns), matching TableWrap's
          pattern elsewhere. */}
      <div className="md:hidden pointer-events-none absolute top-0 right-0 bottom-0 w-6 bg-gradient-to-l from-[#13161e] to-transparent" />
      </div>

      <div className="flex items-center gap-3 mt-3 text-label text-meta">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-[#1D9E75]/40" /> ประกาศแล้ว
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-white/[0.06] border border-dashed border-white/15" /> คาดการณ์ (ปีก่อน +365 วัน)
        </span>
      </div>
    </div>
  );
}

function YoyBadge({ value }: { value: number | null }) {
  if (value == null) return <span className="text-meta">—</span>;
  const cls = value >= 0 ? 'bg-[#1D9E75]/15 text-[#1D9E75]' : 'bg-[#E24B4A]/15 text-[#E24B4A]';
  return (
    <span title={fmtGrowthPct(value).title} className={`inline-flex items-center px-1.5 py-0.5 rounded text-label font-bold tabular-nums ${cls}`}>
      {fmtGrowthPct(value).text}
    </span>
  );
}

function QoqBadge({
  netProfit,
  netProfitPrior,
  netProfitPriorQ,
  netProfitYoY,
  netProfitQoQ,
}: {
  netProfit: number | null | undefined;
  netProfitPrior?: number | null | undefined;
  netProfitPriorQ: number | null | undefined;
  netProfitYoY?: number | null | undefined;
  netProfitQoQ: number | null | undefined;
}) {
  const info = classifyQoQ(netProfit, netProfitPriorQ, netProfitQoQ);
  if (info.category === 'no_base') return <span className="text-meta">—</span>;

  const status = getAccelerationStatus(netProfit, netProfitPrior, netProfitPriorQ, netProfitYoY, info.pct);
  const capped = fmtGrowthPct(info.pct);
  const formattedPct = info.pct != null ? capped.text : info.label;

  return (
    <div className="flex items-center gap-1">
      <span
        title={info.pct != null && capped.text !== capped.title ? `QoQ จริง: ${capped.title}` : `QoQ: ${info.label}`}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-label font-bold tabular-nums ${info.badgeStyle}`}
      >
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: info.color }} />
        {formattedPct}
      </span>
      {status === 'double_turnaround' && (
        <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30" title="Double Turnaround: พลิกกำไรทั้ง YoY & QoQ">
          🚀 Double Turnaround
        </span>
      )}
      {status === 'accelerating' && (
        <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" title="Profit Acceleration: กำไรโตคู่ทั้ง YoY & QoQ">
          ⚡ เร่งตัว
        </span>
      )}
    </div>
  );
}

function QoqLegend() {
  const items: { label: string; color: string; style: string }[] = [
    { label: 'กำไรเพิ่มขึ้น', color: '#1D9E75', style: 'bg-[#1D9E75]/15 text-[#1D9E75]' },
    { label: 'กำไรเท่าเดิม', color: '#3B82F6', style: 'bg-blue-500/15 text-blue-400' },
    { label: 'กำไรลดลง', color: '#EF9F27', style: 'bg-[#EF9F27]/15 text-[#EF9F27]' },
    { label: 'ขาดทุนลดลง', color: '#EAB308', style: 'bg-[#EAB308]/15 text-[#EAB308]' },
    { label: 'ขาดทุนเพิ่มขึ้น', color: '#E24B4A', style: 'bg-[#E24B4A]/15 text-[#E24B4A]' },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px] bg-[#13161e] border border-white/[0.07] px-3.5 py-2 rounded-xl">
      <span className="text-white/50 font-semibold whitespace-nowrap">💡 สัญลักษณ์ QoQ:</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {items.map(it => (
          <span key={it.label} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold ${it.style}`}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: it.color }} />
            {it.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function KpiSummaryHighlights({ feed }: { feed: EarningsFeed }) {
  const announcements = feed.announcements;

  const topYoY = useMemo(() => {
    return [...announcements]
      .filter(a => a.netProfitYoY != null && a.netProfitYoY > 0)
      .sort((a, b) => (b.netProfitYoY ?? 0) - (a.netProfitYoY ?? 0))
      .slice(0, 3);
  }, [announcements]);

  const turnaroundList = useMemo(() => {
    return announcements.filter(
      a => a.netProfitPrior != null && a.netProfitPrior < 0 && a.netProfit != null && a.netProfit > 0
    );
  }, [announcements]);

  const stats = useMemo(() => {
    const total = announcements.length;
    if (total === 0) return { total: 0, growthCount: 0, shrinkCount: 0, growthPct: 0 };
    const growthCount = announcements.filter(a => a.netProfitYoY != null && a.netProfitYoY > 0).length;
    const shrinkCount = announcements.filter(a => a.netProfitYoY != null && a.netProfitYoY < 0).length;
    const growthPct = (growthCount / total) * 100;
    return { total, growthCount, shrinkCount, growthPct };
  }, [announcements]);

  if (announcements.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {/* Card 1: Top Profit Growth */}
      <div className="bg-[#13161e] border border-emerald-500/30 rounded-xl p-3.5 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-bold text-emerald-400 flex items-center gap-1.5">
            <span>🚀 Top Profit Growth (YoY)</span>
          </span>
          <span className="text-[10px] text-white/40 font-mono">Top 3</span>
        </div>
        <div className="space-y-1.5">
          {topYoY.map((a, i) => (
            <div key={`${a.ticker}-${a.quarter}-${i}`} className="flex items-center justify-between text-[12px] bg-white/[0.03] px-2.5 py-1 rounded-lg">
              <span className="font-bold text-white flex items-center gap-1.5">
                <span className="text-white/30 text-[10px]">#{i + 1}</span>
                {a.ticker}
              </span>
              <span className="font-bold text-emerald-400 tabular-nums" title={fmtGrowthPct(a.netProfitYoY ?? null).title}>
                {fmtGrowthPct(a.netProfitYoY ?? null).text}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Card 2: Turnaround Stocks */}
      <div className="bg-[#13161e] border border-amber-500/30 rounded-xl p-3.5 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-bold text-amber-400 flex items-center gap-1.5">
            <span>🔄 Turnaround (พลิกกำไร)</span>
          </span>
          <span className="text-[11px] font-extrabold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">
            {turnaroundList.length} ตัว
          </span>
        </div>
        {turnaroundList.length === 0 ? (
          <p className="text-[11.5px] text-white/30 py-2">ไม่พบหุ้นพลิกกำไรในรอบ 45 วันล่าสุด</p>
        ) : (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {turnaroundList.map((a, i) => (
              <span key={`${a.ticker}-${a.quarter}-${i}`} className="text-[11.5px] font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                {a.ticker}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Card 3: Earnings Beat Ratio */}
      <div className="bg-[#13161e] border border-blue-500/30 rounded-xl p-3.5 space-y-2 flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-bold text-blue-400 flex items-center gap-1.5">
            <span>📊 สัดส่วนบริษัทกำไรเติบโต</span>
          </span>
          <span className="text-[11px] font-bold text-white/60 tabular-nums">
            {stats.growthCount} / {stats.total} บริษัท
          </span>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11.5px]">
            <span className="text-white/50">กำไรเติบโต (YoY &gt; 0)</span>
            <span className="font-bold text-blue-400 tabular-nums">{stats.growthPct.toFixed(1)}%</span>
          </div>
          <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden flex">
            <div className="bg-emerald-500 h-full" style={{ width: `${stats.growthPct}%` }} />
            <div className="bg-rose-500 h-full" style={{ width: `${100 - stats.growthPct}%` }} />
          </div>
          <div className="flex justify-between text-[10px] text-white/40">
            <span className="text-emerald-400">โต {stats.growthCount}</span>
            <span className="text-rose-400">ลดลง {stats.shrinkCount}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PeadWatchSection({ announcements }: { announcements: EarningsAnnouncement[] }) {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'drift_d2_pct', dir: 'desc' });
  const [cardLimit, setCardLimit] = useState(12);
  const [tablePage, setTablePage] = useState(1);

  const handleSort = (key: string) => {
    setSortConfig(prev => prev?.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' });
  };

  const peadList = useMemo(() => {
    let list = announcements
      .filter(a => {
        const hasGoodProfit = (a.netProfitYoY != null && a.netProfitYoY > 0) || a.profitAcceleration === 'accelerating';
        const hasGapUp = a.gap_pct != null && a.gap_pct > 0;
        const hasDrift2 = a.drift_d2_pct != null && a.drift_d2_pct > 0;
        return hasGoodProfit && hasGapUp && hasDrift2;
      });

    if (sortConfig) {
      list = list.sort((a, b) => {
        const aVal = (a as any)[sortConfig.key];
        const bVal = (b as any)[sortConfig.key];
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return sortConfig.dir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }
        const aNull = aVal == null;
        const bNull = bVal == null;
        if (aNull && bNull) return 0;
        if (aNull) return 1;
        if (bNull) return -1;
        return sortConfig.dir === 'asc' ? aVal - bVal : bVal - aVal;
      });
    }
    return list;
  }, [announcements, sortConfig]);

  const TABLE_PAGE_SIZE = 20;
  const CARD_STEP = 12;
  const totalPages = Math.max(1, Math.ceil(peadList.length / TABLE_PAGE_SIZE));
  const safePage = Math.min(tablePage, totalPages);
  const visibleCards = peadList.slice(0, cardLimit);
  const remainingCards = Math.max(0, peadList.length - cardLimit);
  const visibleRows = peadList.slice((safePage - 1) * TABLE_PAGE_SIZE, safePage * TABLE_PAGE_SIZE);

  // reset paging/limit เมื่อ data เปลี่ยน (สลับ SET/MAI, เปลี่ยนวัน, sort ใหม่)
  useEffect(() => {
    setCardLimit(CARD_STEP);
    setTablePage(1);
  }, [peadList]);

  return (
    <div className="bg-[#13161e] border border-emerald-500/25 rounded-2xl p-4 md:p-5 space-y-3.5 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/[0.06] pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-bold text-white flex items-center gap-1.5">
              <span>🔥 PEAD Watch</span>
            </h2>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold tabular-nums">
              {peadList.length} ตัว
            </span>
            <div className="inline-flex rounded-lg border border-white/[0.07] overflow-hidden p-0.5 bg-black/20 ml-1">
              <button
                onClick={() => setViewMode('card')}
                title="มุมมองการ์ด"
                className={`px-2.5 py-1 text-[12px] font-semibold rounded-md transition-colors ${
                  viewMode === 'card' ? 'bg-white/10 text-white' : 'text-white/35 hover:text-white/60'
                }`}
              >
                ⊞
              </button>
              <button
                onClick={() => setViewMode('table')}
                title="มุมมองตาราง"
                className={`px-2.5 py-1 text-[12px] font-semibold rounded-md transition-colors ${
                  viewMode === 'table' ? 'bg-white/10 text-white' : 'text-white/35 hover:text-white/60'
                }`}
              >
                ☰
              </button>
            </div>
          </div>
          <p className="text-[11.5px] text-white/50 mt-0.5">
            เรียงตาม Drift D+2 (ราคาวิ่งต่อ 2 วันทำการหลังงบ) · % กำไร YoY เทียบไตรมาสเดียวกันปีก่อน (turnaround ฐานติดลบ → % สูงผิดปกติ) · QoQ เทียบไตรมาสก่อน
          </p>
        </div>
        <div className="text-[11px] text-meta">
          * เฉพาะหุ้นที่ประกาศงบแล้วเกิน 2 วันทำการ (ครบ D+2)
        </div>
      </div>

      {peadList.length === 0 ? (
        <div className="py-6 text-center text-label text-meta">
          ยังไม่มีหุ้นเข้าเกณฑ์ PEAD ช่วงนี้
        </div>
      ) : viewMode === 'card' ? (
        <>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {visibleCards.map((a, i) => {
            const spark = sparklineMap[a.ticker];
            return (
              <div
                key={`${a.ticker}-${a.quarter}-${i}`}
                onClick={() => router.push(`/stock/${a.ticker}`)}
                className="bg-white/[0.025] hover:bg-white/[0.05] border border-white/[0.07] hover:border-emerald-500/40 rounded-xl p-3.5 transition-all cursor-pointer flex flex-col justify-between space-y-2.5 group"
              >
                {/* Header: Ticker + Quarter + Acceleration Badge */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[15px] font-extrabold text-blue-400 group-hover:text-blue-300 transition-colors">
                        {a.ticker}
                      </span>
                      <ExternalLink size={12} className="text-white/30 group-hover:text-blue-400 transition-colors" />
                    </div>
                    <div className="text-[11px] text-white/50 mt-0.5">
                      {a.quarter ?? '—'}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-2 text-[11px] tabular-nums">
                      <div className="flex items-center gap-1">
                        <span className="text-white/40 text-[10px]">YoY</span>
                        <YoyBadge value={a.netProfitYoY} />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-white/40 text-[10px]">QoQ</span>
                        <span title={fmtGrowthPct(a.netProfitQoQ).title} className={`inline-flex items-center px-1.5 py-0.5 rounded text-label font-bold tabular-nums ${
                          a.netProfitQoQ == null ? 'text-meta' : a.netProfitQoQ >= 0 ? 'bg-[#1D9E75]/15 text-[#1D9E75]' : 'bg-[#E24B4A]/15 text-[#E24B4A]'
                        }`}>
                          {fmtGrowthPct(a.netProfitQoQ).text}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-wrap justify-end">
                      {a.profitAcceleration === 'accelerating' && (
                        <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          ⚡ เร่งตัว
                        </span>
                      )}
                      {a.bucket === 'turnaround' && (
                        <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-300 border border-teal-500/30">
                          🔄 พลิกกำไร
                        </span>
                      )}
                      {a.bucket === 'loss_shrink' && (
                        <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          📉 ขาดทุนแคบลง
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Optional Sparkline */}
                {spark && spark.length >= 2 && (
                  <div className="py-1 flex justify-center opacity-80 group-hover:opacity-100 transition-opacity">
                    <TrendSparkline data={spark} width={180} height={36} />
                  </div>
                )}

                {/* PEAD Price Reaction Metrics: Gap & Drift D+1, D+2, D+5 */}
                <div className="bg-black/30 rounded-lg p-2 grid grid-cols-4 gap-1 text-center border border-white/[0.04]">
                  <div>
                    <div className="text-[10px] text-white/40 uppercase font-medium">Gap T0</div>
                    <div className="text-[11.5px] font-extrabold text-emerald-400 tabular-nums mt-0.5">
                      {a.gap_pct != null ? `${a.gap_pct >= 0 ? '+' : ''}${a.gap_pct.toFixed(2)}%` : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-white/40 uppercase font-medium">Drift D+1</div>
                    <div className={`text-[11.5px] font-extrabold tabular-nums mt-0.5 ${
                      (a.drift_d1_pct ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                      {a.drift_d1_pct != null ? `${a.drift_d1_pct >= 0 ? '+' : ''}${a.drift_d1_pct.toFixed(2)}%` : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-white/40 uppercase font-medium">Drift D+2</div>
                    <div className="text-[11.5px] font-black text-emerald-400 tabular-nums mt-0.5">
                      {a.drift_d2_pct != null ? `${a.drift_d2_pct >= 0 ? '+' : ''}${a.drift_d2_pct.toFixed(2)}%` : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-white/40 uppercase font-medium">Drift D+5</div>
                    <div className={`text-[11.5px] font-semibold tabular-nums mt-0.5 ${
                      a.drift_d5_pct == null ? 'text-white/40' : (a.drift_d5_pct >= 0 ? 'text-emerald-400' : 'text-rose-400')
                    }`}>
                      {a.drift_d5_pct != null ? `${a.drift_d5_pct >= 0 ? '+' : ''}${a.drift_d5_pct.toFixed(2)}%` : '—'}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {remainingCards > 0 && (
          <div className="flex justify-center pt-1">
            <button
              onClick={() => setCardLimit(prev => prev + CARD_STEP)}
              className="px-4 py-2 rounded-lg text-[12.5px] font-bold text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 transition-colors"
            >
              แสดงเพิ่ม · เหลืออีก {remainingCards} ตัว
            </button>
          </div>
        )}
        </>
      ) : (
        <>
        <TableWrap>
          <table className="w-full text-left">
            <thead className="border-b border-white/[0.06] bg-white/[0.015]">
              <tr>
                <SortableTh sortKey="ticker" currentSort={sortConfig} onSort={handleSort}>Symbol</SortableTh>
                <SortableTh sortKey="quarter" currentSort={sortConfig} onSort={handleSort}>งวด</SortableTh>
                <SortableTh right sortKey="netProfitYoY" currentSort={sortConfig} onSort={handleSort}>กำไร %YoY</SortableTh>
                <SortableTh right sortKey="netProfitQoQ" currentSort={sortConfig} onSort={handleSort}>กำไร %QoQ</SortableTh>
                <SortableTh right sortKey="gap_pct" currentSort={sortConfig} onSort={handleSort}>Gap T0</SortableTh>
                <SortableTh right sortKey="drift_d1_pct" currentSort={sortConfig} onSort={handleSort}>Drift D+1</SortableTh>
                <SortableTh right sortKey="drift_d2_pct" currentSort={sortConfig} onSort={handleSort}>Drift D+2</SortableTh>
                <SortableTh right sortKey="drift_d5_pct" currentSort={sortConfig} onSort={handleSort}>Drift D+5</SortableTh>
                <Th>สถานะ</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.03]">
              {visibleRows.map((a, i) => (
                <tr
                  key={`${a.ticker}-${a.quarter}-${i}`}
                  onClick={() => router.push(`/stock/${a.ticker}`)}
                  className="hover:bg-white/[0.03] cursor-pointer transition-colors"
                >
                  <Td className="font-extrabold text-blue-400 group-hover:text-blue-300">
                    <span className="flex items-center gap-1">
                      {a.ticker}
                      <ExternalLink size={11} className="text-white/30" />
                    </span>
                  </Td>
                  <Td className="text-white/60">{a.quarter ?? '—'}</Td>
                  <Td right>
                    <YoyBadge value={a.netProfitYoY} />
                  </Td>
                  <Td right>
                    <span title={fmtGrowthPct(a.netProfitQoQ).title} className={`inline-flex items-center px-1.5 py-0.5 rounded text-label font-bold tabular-nums ${
                      a.netProfitQoQ == null ? 'text-meta' : a.netProfitQoQ >= 0 ? 'bg-[#1D9E75]/15 text-[#1D9E75]' : 'bg-[#E24B4A]/15 text-[#E24B4A]'
                    }`}>
                      {fmtGrowthPct(a.netProfitQoQ).text}
                    </span>
                  </Td>
                  <Td right className="font-extrabold text-emerald-400 tabular-nums">
                    {a.gap_pct != null ? `${a.gap_pct >= 0 ? '+' : ''}${a.gap_pct.toFixed(2)}%` : '—'}
                  </Td>
                  <Td right className={`font-semibold tabular-nums ${
                    (a.drift_d1_pct ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}>
                    {a.drift_d1_pct != null ? `${a.drift_d1_pct >= 0 ? '+' : ''}${a.drift_d1_pct.toFixed(2)}%` : '—'}
                  </Td>
                  <Td right className="font-black text-emerald-400 tabular-nums">
                    {a.drift_d2_pct != null ? `${a.drift_d2_pct >= 0 ? '+' : ''}${a.drift_d2_pct.toFixed(2)}%` : '—'}
                  </Td>
                  <Td right className={`font-semibold tabular-nums ${
                    a.drift_d5_pct == null ? 'text-white/40' : (a.drift_d5_pct >= 0 ? 'text-emerald-400' : 'text-rose-400')
                  }`}>
                    {a.drift_d5_pct != null ? `${a.drift_d5_pct >= 0 ? '+' : ''}${a.drift_d5_pct.toFixed(2)}%` : '—'}
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1 flex-wrap">
                      {a.profitAcceleration === 'accelerating' && (
                        <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          ⚡ เร่งตัว
                        </span>
                      )}
                      {a.bucket === 'turnaround' && (
                        <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-300 border border-teal-500/30">
                          🔄 พลิกกำไร
                        </span>
                      )}
                      {a.bucket === 'loss_shrink' && (
                        <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          📉 ขาดทุนแคบลง
                        </span>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 pt-3 text-[12.5px]">
            <button
              onClick={() => setTablePage(p => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="px-3 py-1.5 rounded-lg font-semibold border border-white/[0.08] text-white/70 hover:bg-white/[0.05] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              ‹ ก่อนหน้า
            </button>
            <span className="text-white/50 tabular-nums font-medium">
              หน้า {safePage}/{totalPages}
            </span>
            <button
              onClick={() => setTablePage(p => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="px-3 py-1.5 rounded-lg font-semibold border border-white/[0.08] text-white/70 hover:bg-white/[0.05] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              ถัดไป ›
            </button>
          </div>
        )}
        </>
      )}
    </div>
  );
}

type QuickFilterTag = 'all' | 'today' | 'growth50' | 'qoqGrowth' | 'accelerating' | 'turnaround' | 'hasMda' | 'pead';


function parseQuarterScore(q: string): number {
  const yearMatch = q.match(/\d{4}/);
  const year = yearMatch ? parseInt(yearMatch[0], 10) : 0;
  let qWeight = 0;
  const qMatch = q.match(/ไตรมาส\s*(\d)/);
  if (qMatch) {
    qWeight = parseInt(qMatch[1], 10);
  } else if (q.includes('ประจำปี') || q.includes('12 เดือน')) {
    qWeight = 0.5;
  }
  return year * 10 + qWeight;
}

function AnnouncementsTable({
  announcements,
  onSelect,
  selectedTicker,
  bucketFilter,
  onClearBucketFilter,
}: {
  announcements: EarningsAnnouncement[];
  onSelect: (a: EarningsAnnouncement) => void;
  selectedTicker: string | null;
  bucketFilter: BucketFilterOpt;
  onClearBucketFilter: () => void;
}) {
  const router = useRouter();
  const [quarterFilter, setQuarterFilter] = useState('ทั้งหมด');
  const [quickFilter, setQuickFilter] = useState<QuickFilterTag>('all');
  const [query, setQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 10;

  const quarters = useMemo(() => {
    const s = new Set<string>();
    announcements.forEach(a => {
      if (a.quarter && a.quarter.trim()) {
        const q = a.quarter.trim();
        if (q !== 'ไตรมาส 3/2569') {
          s.add(q);
        }
      }
    });
    const sorted = Array.from(s).sort((a, b) => parseQuarterScore(b) - parseQuarterScore(a));
    return ['ทั้งหมด', ...sorted];
  }, [announcements]);

  const todayIso = new Date().toISOString().slice(0, 10);

  const handleSort = (key: string) => {
    setCurrentPage(1);
    setSortConfig(prev => prev?.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' });
  };

  const filtered = useMemo(() => {
    let result = announcements
      .filter(a => bucketFilter === 'ทั้งหมด' || a.bucket === bucketFilter)
      .filter(a => quarterFilter === 'ทั้งหมด' || a.quarter === quarterFilter)
      .filter(a => {
        if (quickFilter === 'today') return a.announceDate?.startsWith(todayIso);
        if (quickFilter === 'growth50') return a.netProfitYoY != null && a.netProfitYoY >= 50;
        if (quickFilter === 'qoqGrowth') return a.netProfitQoQ != null ? a.netProfitQoQ > 0 : (a.netProfit != null && a.netProfitPriorQ != null && a.netProfit > a.netProfitPriorQ);
        if (quickFilter === 'accelerating') return a.netProfitYoY != null && a.netProfitYoY > 0 && a.netProfitQoQ != null && a.netProfitQoQ > 0;
        if (quickFilter === 'turnaround') return a.netProfitPrior != null && a.netProfitPrior < 0 && a.netProfit != null && a.netProfit > 0;
        if (quickFilter === 'hasMda') return !!a.mdaUrl || !!a.reason;
        if (quickFilter === 'pead') return (a.netProfitYoY != null && a.netProfitYoY >= 20) || (a.netProfitPrior != null && a.netProfitPrior < 0 && a.netProfit != null && a.netProfit > 0);
        return true;
      })
      .filter(a => !query.trim() || a.ticker.toLowerCase().includes(query.trim().toLowerCase()));

    if (sortConfig) {
      result = result.sort((a, b) => {
        const aVal = (a as any)[sortConfig.key];
        const bVal = (b as any)[sortConfig.key];
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return sortConfig.dir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }
        return sortConfig.dir === 'asc' ? (aVal || 0) - (bVal || 0) : (bVal || 0) - (aVal || 0);
      });
    } else {
      result = result.sort((a, b) => (b.announceDate || '').localeCompare(a.announceDate || ''));
    }
    return result;
  }, [announcements, bucketFilter, quarterFilter, quickFilter, query, todayIso, sortConfig]);

  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const safePage = Math.min(currentPage, totalPages);
  const paginatedRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const handleSearchChange = (val: string) => {
    setCurrentPage(1);
    setQuery(val);
  };

  const handleQuarterChange = (val: string) => {
    setCurrentPage(1);
    setQuarterFilter(val);
  };

  const handleQuickFilterChange = (val: QuickFilterTag) => {
    setCurrentPage(1);
    setQuickFilter(val);
  };

  function handleRowClick(a: EarningsAnnouncement) {
    onSelect(a);
  }

  return (
    <div className="space-y-3">
      {/* Filter and Quick Chips Bar */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-label text-meta whitespace-nowrap">ทางลัด:</span>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => handleQuickFilterChange('all')}
            className={`px-2.5 py-1 rounded-lg text-label font-medium transition-all ${
              quickFilter === 'all' ? 'bg-white/15 text-white font-bold' : 'bg-white/[0.04] text-white/50 hover:text-white/80'
            }`}
          >
            ทั้งหมด
          </button>
          <button
            onClick={() => handleQuickFilterChange('today')}
            className={`px-2.5 py-1 rounded-lg text-label font-medium transition-all ${
              quickFilter === 'today' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-white/[0.04] text-white/50 hover:text-white/80'
            }`}
          >
            📅 ประกาศวันนี้
          </button>
          <button
            onClick={() => handleQuickFilterChange('growth50')}
            className={`px-2.5 py-1 rounded-lg text-label font-medium transition-all ${
              quickFilter === 'growth50' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-white/[0.04] text-white/50 hover:text-white/80'
            }`}
          >
            🚀 โต &gt; 50%
          </button>
          <button
            onClick={() => handleQuickFilterChange('qoqGrowth')}
            className={`px-2.5 py-1 rounded-lg text-label font-medium transition-all ${
              quickFilter === 'qoqGrowth' ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30' : 'bg-white/[0.04] text-white/50 hover:text-white/80'
            }`}
          >
            📈 QoQ โต
          </button>
          <button
            onClick={() => handleQuickFilterChange('accelerating')}
            className={`px-2.5 py-1 rounded-lg text-label font-medium transition-all ${
              quickFilter === 'accelerating' ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 font-bold' : 'bg-white/[0.04] text-white/50 hover:text-white/80'
            }`}
          >
            ⚡ กำไรเร่งตัว
          </button>
          <button
            onClick={() => handleQuickFilterChange('turnaround')}
            className={`px-2.5 py-1 rounded-lg text-label font-medium transition-all ${
              quickFilter === 'turnaround' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-white/[0.04] text-white/50 hover:text-white/80'
            }`}
          >
            🔄 พลิกกำไร
          </button>
          <button
            onClick={() => handleQuickFilterChange('pead')}
            className={`px-2.5 py-1 rounded-lg text-label font-bold transition-all ${
              quickFilter === 'pead' ? 'bg-emerald-500 text-black shadow font-black' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20'
            }`}
          >
            🔥 PEAD Momentum (สแกนงบปังตามต่อ)
          </button>
          <button
            onClick={() => handleQuickFilterChange('hasMda')}
            className={`px-2.5 py-1 rounded-lg text-label font-medium transition-all ${
              quickFilter === 'hasMda' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'bg-white/[0.04] text-white/50 hover:text-white/80'
            }`}
          >
            📄 มีสรุป MD&amp;A
          </button>
        </div>

        <div className="h-4 w-px bg-white/10 mx-1 hidden sm:block" />

        {bucketFilter !== 'ทั้งหมด' && (
          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-label font-semibold ${BUCKET_BADGE_STYLE[bucketFilter as EarningsBucket]}`}>
            {BUCKET_LABEL[bucketFilter as EarningsBucket]}
            <button onClick={onClearBucketFilter} className="hover:opacity-70" title="ล้างตัวกรองสถานะ">
              <X size={11} />
            </button>
          </span>
        )}
        <select
          value={quarterFilter}
          onChange={e => handleQuarterChange(e.target.value)}
          className="px-2.5 py-1.5 bg-[#13161e] border border-white/[0.08] rounded-lg text-label text-white/80 outline-none focus:border-white/20 transition-colors"
        >
          {quarters.map(q => (
            <option key={q} value={q}>
              {q === 'ทั้งหมด' ? 'ทุกไตรมาส' : q}
            </option>
          ))}
        </select>
      </div>

      <>
        {/* Mobile & Tablet (<1024px): Responsive 1-col (mobile) / 2-col (tablet) Card Grid */}
          <div className="lg:hidden grid grid-cols-1 sm:grid-cols-2 gap-3 p-3">
            {paginatedRows.map((a, i) => (
              <div
                key={`${a.ticker}-${a.announceDate}-${i}`}
                onClick={() => handleRowClick(a)}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between space-y-2.5 ${
                  selectedTicker === a.ticker
                    ? 'bg-[#7F77DD]/[0.14] border-[#7F77DD]/50 ring-1 ring-[#7F77DD]/30'
                    : 'bg-[#13161e] border-white/[0.07] hover:border-white/20 hover:bg-white/[0.02] active:bg-white/[0.04]'
                }`}
              >
                {/* Header: Ticker + Badges */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[15px] font-extrabold text-blue-400 tracking-wide">
                      {a.ticker}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); router.push(`/stock/${a.ticker}`); }}
                      className="p-1 rounded-md text-white/40 hover:text-blue-400 hover:bg-white/10 transition-colors"
                      title={`เปิดหน้าวิเคราะห์หุ้น ${a.ticker}`}
                    >
                      <ExternalLink size={13} />
                    </button>
                    {a.isCorrection && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#EF9F27]/15 text-[#EF9F27] border border-[#EF9F27]/30 flex-shrink-0">
                        แก้ไข
                      </span>
                    )}
                    <span className="text-[11px] font-medium text-white/50 bg-white/[0.05] px-2 py-0.5 rounded-md truncate">
                      {a.quarter ?? '—'}
                    </span>
                  </div>
                  <span className="text-[11px] text-meta whitespace-nowrap tabular-nums">
                    {timeOnly(a.announceDate)} น.
                  </span>
                </div>

                {/* Profit & YoY/QoQ Growth */}
                <div className="bg-white/[0.025] border border-white/[0.04] rounded-lg p-2.5 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-meta">กำไรสุทธิ</div>
                    <div className={`text-[14px] font-bold tabular-nums mt-0.5 ${a.netProfit != null && a.netProfit < 0 ? 'text-[#E24B4A]' : 'text-white'}`}>
                      {fmtMoney(a.netProfit)}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <YoyBadge value={a.netProfitYoY} />
                    <QoqBadge netProfit={a.netProfit} netProfitPrior={a.netProfitPrior} netProfitPriorQ={a.netProfitPriorQ} netProfitYoY={a.netProfitYoY} netProfitQoQ={a.netProfitQoQ} />
                  </div>
                </div>

                {/* Reason snippet if available */}
                {a.reason && (
                  <p className="text-[11px] text-white/60 leading-relaxed line-clamp-2 bg-white/[0.015] p-2 rounded-md border border-white/[0.03]">
                    {a.reason}
                  </p>
                )}

                {/* Footer: Date & Document Action Buttons */}
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/[0.04]">
                  <span className="text-[10.5px] text-meta">
                    {isoDateTimeToThai(a.announceDate).replace(/ \d{2}:\d{2} น\.$/, '')}
                  </span>
                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    {a.statementUrl && (
                      <a
                        href={a.statementUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-white/[0.06] text-white/70 hover:text-white hover:bg-white/15 transition-all border border-white/[0.08]"
                      >
                        งบ <ExternalLink size={10} />
                      </a>
                    )}
                    {a.mdaUrl && (
                      <a
                        href={a.mdaUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-purple-500/15 text-purple-300 hover:bg-purple-500/25 transition-all border border-purple-500/30"
                      >
                        MD&amp;A <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop (>=1024px): Full High-Density Data Table */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-white/[0.06] bg-white/[0.015]">
                <tr>
                  <SortableTh sortKey="announceDate" currentSort={sortConfig} onSort={handleSort}>เวลาประกาศ</SortableTh>
                  <SortableTh sortKey="ticker" currentSort={sortConfig} onSort={handleSort}>หุ้น</SortableTh>
                  <SortableTh sortKey="quarter" currentSort={sortConfig} onSort={handleSort}>งวด</SortableTh>
                  <SortableTh right sortKey="netProfit" currentSort={sortConfig} onSort={handleSort}>กำไรสุทธิ</SortableTh>
                  <SortableTh right sortKey="netProfitPrior" currentSort={sortConfig} onSort={handleSort}>ปีก่อน</SortableTh>
                  <SortableTh right sortKey="netProfitYoY" currentSort={sortConfig} onSort={handleSort}>%YoY</SortableTh>
                  <SortableTh right sortKey="netProfitQoQ" currentSort={sortConfig} onSort={handleSort}>%QoQ</SortableTh>
                  <SortableTh right sortKey="eps" currentSort={sortConfig} onSort={handleSort}>EPS</SortableTh>
                  <th className="px-3.5 py-3 text-label font-semibold uppercase tracking-wider text-meta whitespace-nowrap">เอกสาร</th>
                  <th className="px-3.5 py-3 text-label font-semibold uppercase tracking-wider text-meta whitespace-nowrap">สาเหตุ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {paginatedRows.map((a, i) => (
                  <tr
                    key={`${a.ticker}-${a.announceDate}-${i}`}
                    onClick={() => handleRowClick(a)}
                    className={`cursor-pointer transition-colors border-l-2 ${
                      selectedTicker === a.ticker
                        ? 'bg-[#7F77DD]/[0.14] border-l-[#7F77DD]'
                        : 'border-l-transparent hover:bg-white/[0.025]'
                    }`}
                  >
                    <td className="px-3.5 py-3.5 text-label text-white/60 whitespace-nowrap">
                      <div className="font-medium">{isoDateTimeToThai(a.announceDate).replace(/ \d{2}:\d{2} น\.$/, '')}</div>
                      <div className="text-[11px] text-meta">{timeOnly(a.announceDate)} น.</div>
                    </td>
                    <td className="px-3.5 py-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[14px] font-extrabold text-blue-400">
                          {a.ticker}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); router.push(`/stock/${a.ticker}`); }}
                          className="p-1 rounded text-white/30 hover:text-blue-400 hover:bg-white/10 transition-colors"
                          title={`เปิดหน้าวิเคราะห์หุ้น ${a.ticker}`}
                        >
                          <ExternalLink size={12} />
                        </button>
                        {a.isCorrection && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#EF9F27]/15 text-[#EF9F27] border border-[#EF9F27]/30 align-middle">
                            แก้ไข
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3.5 py-3.5 text-label text-white/60 whitespace-nowrap">{a.quarter ?? '—'}</td>
                    <td className={`px-3.5 py-3.5 text-label font-bold tabular-nums text-right whitespace-nowrap ${
                      a.netProfit != null && a.netProfit < 0 ? 'text-[#E24B4A]' : 'text-white'
                    }`}>
                      {fmtMoney(a.netProfit)}
                    </td>
                    <td className="px-3.5 py-3.5 text-label tabular-nums text-meta text-right whitespace-nowrap">
                      {fmtMoney(a.netProfitPrior)}
                    </td>
                    <td className="px-3.5 py-3.5 whitespace-nowrap text-right"><div className="flex justify-end"><YoyBadge value={a.netProfitYoY} /></div></td>
                    <td className="px-3.5 py-3.5 whitespace-nowrap text-right"><div className="flex justify-end"><QoqBadge netProfit={a.netProfit} netProfitPrior={a.netProfitPrior} netProfitPriorQ={a.netProfitPriorQ} netProfitYoY={a.netProfitYoY} netProfitQoQ={a.netProfitQoQ} /></div></td>
                    <td className="px-3.5 py-3.5 text-label tabular-nums text-white/60 text-right whitespace-nowrap">
                      {a.eps != null ? a.eps.toFixed(2) : '—'}
                    </td>
                    <td className="px-3.5 py-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        {a.statementUrl && (
                          <a href={a.statementUrl} target="_blank" rel="noopener noreferrer"
                             className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-white/[0.06] text-white/70 hover:text-white hover:bg-white/15 transition-all border border-white/[0.08]">
                            งบ <ExternalLink size={10} />
                          </a>
                        )}
                        {a.mdaUrl && (
                          <a href={a.mdaUrl} target="_blank" rel="noopener noreferrer"
                             className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-purple-500/15 text-purple-300 hover:bg-purple-500/25 transition-all border border-purple-500/30">
                            MD&amp;A <ExternalLink size={10} />
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="px-3.5 py-3.5 text-label max-w-[240px]">
                      {a.reason ? (
                        <div className="text-white/60 line-clamp-2 leading-relaxed" title={a.reason}>{a.reason}</div>
                      ) : (
                        <span className="text-meta">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>

      {/* Pagination Controls */}
      {filtered.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#13161e] border border-white/[0.07] px-4 py-3 rounded-xl">
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
                        ? 'bg-blue-500 text-white shadow-md'
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
  );
}

// ── Desktop side panel (row click, >=1024px only - mobile navigates instead) ──

// Shared content for both the desktop docked panel and the mobile bottom
// sheet - only the outer wrapper (positioning/backdrop) differs between the
// two, so this stays a single source of truth for "what the panel shows".
function AnnouncementPanelContent({
  announcement,
  onClose,
}: {
  announcement: EarningsAnnouncement;
  onClose: () => void;
}) {
  const router = useRouter();
  const spark = sparklineMap[announcement.ticker];

  return (
    <div className="space-y-3.5">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-body font-bold text-white">{announcement.ticker}</span>
            {announcement.isCorrection && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-label font-bold bg-[#EF9F27]/15 text-[#EF9F27]">
                แก้ไข
              </span>
            )}
          </div>
          <div className="text-label text-meta mt-0.5">{announcement.quarter ?? '—'}</div>
          <div className="text-label text-meta mt-0.5">ประกาศ {isoDateTimeToThai(announcement.announceDate)}</div>
        </div>
        <button onClick={onClose} className="text-meta hover:text-white/60 text-body leading-none p-1">
          ✕
        </button>
      </div>

      {spark && spark.length >= 2 && (
        <div className="bg-white/[0.02] rounded-lg p-2 flex justify-center">
          <TrendSparkline data={spark} width={280} height={64} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-white/[0.03] rounded-lg px-3 py-2">
          <div className="text-label text-meta mb-0.5">กำไรสุทธิ</div>
          <div className={`text-label font-semibold ${announcement.netProfit != null && announcement.netProfit < 0 ? 'text-[#E24B4A]' : 'text-white'}`}>
            {fmtMoney(announcement.netProfit)}
          </div>
        </div>
        <div className="bg-white/[0.03] rounded-lg px-3 py-2">
          <div className="text-label text-meta mb-0.5">ปีก่อน</div>
          <div className="text-label font-semibold text-white/60">{fmtMoney(announcement.netProfitPrior)}</div>
        </div>
        <div className="bg-white/[0.03] rounded-lg px-3 py-2">
          <div className="text-label text-meta mb-0.5">%YoY</div>
          <YoyBadge value={announcement.netProfitYoY} />
        </div>
        <div className="bg-white/[0.03] rounded-lg px-3 py-2">
          <div className="text-label text-meta mb-0.5">EPS</div>
          <div className="text-label font-semibold text-white/80">
            {announcement.eps != null ? announcement.eps.toFixed(2) : '—'}
          </div>
        </div>
      </div>

      <div>
        <div className="text-label text-meta mb-1">สาเหตุ</div>
        {announcement.reason ? (
          <div className="text-label text-white/70 leading-relaxed">{announcement.reason}</div>
        ) : (
          <div className="text-label text-meta">— ไม่พบข้อมูลสาเหตุจากเอกสาร MD&amp;A</div>
        )}
      </div>

      <div className="flex flex-col gap-1.5 pt-2 border-t border-white/[0.06]">
        <button
          onClick={() => router.push(`/stock/${announcement.ticker}`)}
          className="w-full py-2 rounded-lg bg-white/10 hover:bg-white/15 text-label font-semibold text-white transition-colors"
        >
          เปิดหน้าหุ้น {announcement.ticker}
        </button>
        <div className="flex gap-1.5">
          {announcement.statementUrl && (
            <a
              href={announcement.statementUrl} target="_blank" rel="noopener noreferrer"
              className="flex-1 text-center py-1.5 rounded-lg text-label font-medium bg-white/[0.05] text-white/50 hover:text-white/80 transition-colors"
            >
              งบการเงิน
            </a>
          )}
          {announcement.mdaUrl && (
            <a
              href={announcement.mdaUrl} target="_blank" rel="noopener noreferrer"
              className="flex-1 text-center py-1.5 rounded-lg text-label font-medium bg-white/[0.05] text-white/50 hover:text-white/80 transition-colors"
            >
              MD&amp;A
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// Desktop (>=1024px): docked beside the table. `top` accounts for the
// app's 56px (h-14) header, sticky so it stays in view when the table
// scrolls past it, capped to the viewport with its own scrollbar so a long
// reason never pushes the buttons below off-screen (the previous
// unbounded-height version needed a page-level scroll to reach them).
function AnnouncementSidePanel({
  announcement,
  onClose,
}: {
  announcement: EarningsAnnouncement;
  onClose: () => void;
}) {
  return (
    <div
      className="w-[320px] flex-shrink-0 bg-[#13161e] border border-white/[0.07] rounded-xl p-4 sticky overflow-y-auto"
      style={{ top: '4.5rem', maxHeight: 'calc(100vh - 5.5rem)' }}
    >
      <AnnouncementPanelContent announcement={announcement} onClose={onClose} />
    </div>
  );
}

// Narrow screens (<1024px): a bottom sheet instead of a side dock (a
// 320px-wide column doesn't fit) - slides up over the table with a
// backdrop, capped at 85% of the viewport with its own scroll.
function AnnouncementBottomSheet({
  announcement,
  onClose,
}: {
  announcement: EarningsAnnouncement;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full bg-[#13161e] border-t border-white/[0.1] rounded-t-2xl p-4 pb-6 max-h-[85vh] overflow-y-auto">
        <div className="w-10 h-1 rounded-full bg-white/15 mx-auto mb-3" />
        <AnnouncementPanelContent announcement={announcement} onClose={onClose} />
      </div>
    </div>
  );
}

function EarningsKnowledgeBase() {
  return (
    <div className="bg-[#13161e] border border-white/[0.07] rounded-2xl p-5 space-y-4 shadow-sm">
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
        <h2 className="text-[15px] font-bold text-white flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
          💡 คลังความรู้และคำอธิบายสภาวะกำไร (Earnings Knowledge Base)
        </h2>
        <span className="text-[11.5px] text-white/40">คู่มือการอ่านสถานะผลประกอบการและโมเมนตัมหุ้น</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: YoY Buckets */}
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 space-y-2.5">
          <h3 className="text-[13px] font-bold text-white flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            1. สภาวะกำไรเทียบปีก่อน (%YoY Buckets)
          </h3>
          <p className="text-[11.5px] text-white/60 leading-relaxed">
            เปรียบเทียบกำไรสุทธิไตรมาสล่าสุดกับไตรมาสเดียวกันของปีก่อนหน้า (6 สภาวะหลัก):
          </p>
          <ul className="text-[11px] text-white/70 space-y-1.5 list-none pl-0">
            <li className="flex items-start gap-1.5">
              <span className="font-bold text-[#1D9E75] shrink-0">🚀 กำไรโต:</span>
              <span>กำไรสุทธิเป็นบวกและเติบโตขึ้นเมื่อเทียบกับปีก่อน (%YoY ≥ 0)</span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="font-bold text-[#3B82F6] shrink-0">🔄 พลิกกำไร:</span>
              <span>ปีก่อนขาดทุนสุทธิ แต่ไตรมาสนี้พลิกกลับมากำไรสุทธิเป็นบวก (Turnaround)</span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="font-bold text-[#EF9F27] shrink-0">📉 กำไรหด:</span>
              <span>ยังมีกำไรสุทธิเป็นบวก แต่จำนวนกำไรลดลงเมื่อเทียบกับปีก่อน (%YoY &lt; 0)</span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="font-bold text-[#EAB308] shrink-0">🩹 ขาดทุนลดลง:</span>
              <span>ยังคงขาดทุนสุทธิ แต่ตัวเลขขาดทุนน้อยลงกว่าปีก่อน (ผลประกอบการปรับดีขึ้น)</span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="font-bold text-[#E24B4A] shrink-0">🔻 ขาดทุน-แย่ลง:</span>
              <span>ขาดทุนสุทธิหนักขึ้น หรือปีก่อนมีกำไรแต่ไตรมาสนี้พลิกเป็นขาดทุน</span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="font-bold text-[#8A8F98] shrink-0">🔘 ไม่มีฐานเทียบ:</span>
              <span>ปีก่อนไม่มีฐานตัวเลขเทียบ (เช่น หุ้น IPO ใหม่ หรือปรับโครงสร้างงบ)</span>
            </li>
          </ul>
        </div>

        {/* Card 2: QoQ Buckets */}
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 space-y-2.5">
          <h3 className="text-[13px] font-bold text-white flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-400" />
            2. สภาวะกำไรเทียบไตรมาสก่อน (%QoQ Growth)
          </h3>
          <p className="text-[11.5px] text-white/60 leading-relaxed">
            เปรียบเทียบกำไรสุทธิไตรมาสล่าสุดกับไตรมาสที่เพิ่งผ่านมา (5 สภาวะ):
          </p>
          <ul className="text-[11px] text-white/70 space-y-1.5 list-none pl-0">
            <li className="flex items-start gap-1.5">
              <span className="font-bold text-[#1D9E75] shrink-0">🟩 กำไรเพิ่มขึ้น:</span>
              <span>กำไรสุทธิเติบโตเพิ่มขึ้นจากไตรมาสก่อนหน้า (%QoQ &gt; 0)</span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="font-bold text-[#3B82F6] shrink-0">🟦 กำไรเท่าเดิม:</span>
              <span>กำไรสุทธิทรงตัวใกล้เคียงกับไตรมาสก่อนหน้า (%QoQ ≈ 0%)</span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="font-bold text-[#EF9F27] shrink-0">🟧 กำไรลดลง:</span>
              <span>กำไรสุทธิลดลงเมื่อเทียบกับไตรมาสก่อนหน้า (%QoQ &lt; 0)</span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="font-bold text-[#EAB308] shrink-0">🟨 ขาดทุนลดลง:</span>
              <span>ยอดขาดทุนสุทธิน้อยลงกว่าไตรมาสก่อนหน้า</span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="font-bold text-[#E24B4A] shrink-0">🟥 ขาดทุนเพิ่มขึ้น:</span>
              <span>ยอดขาดทุนสุทธิเพิ่มสูงขึ้นกว่าไตรมาสก่อนหน้า</span>
            </li>
          </ul>
        </div>

        {/* Card 3: Momentum & Acceleration */}
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 space-y-2.5">
          <h3 className="text-[13px] font-bold text-white flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-purple-400" />
            3. สัญญาณความเร่งและโมเมนตัม (Momentum &amp; PEAD)
          </h3>
          <p className="text-[11.5px] text-white/60 leading-relaxed">
            ตัวชี้วัดความเร่งของกำไรและสัญญาณติดตามต่อตามกลยุทธ์การลงทุน:
          </p>
          <ul className="text-[11px] text-white/70 space-y-1.5 list-none pl-0">
            <li className="flex items-start gap-1.5">
              <span className="font-bold text-emerald-400 shrink-0">⚡ กำไรเร่งตัว:</span>
              <span>กำไรเติบโตบวกคู่ทั้งเทียบปีก่อน (%YoY &gt; 0) และเทียบไตรมาสก่อน (%QoQ &gt; 0) แรงส่งสูงสุด</span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="font-bold text-purple-300 shrink-0">🚀 Double Turnaround:</span>
              <span>พลิกจากขาดทุนกลับมากำไรสุทธิพร้อมกันทั้งระดับ YoY และ QoQ</span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="font-bold text-emerald-400 shrink-0">🔥 PEAD Momentum:</span>
              <span>หุ้นงบปัง (YoY ≥ 20% หรือ Turnaround) ซึ่งมีแนวโน้มราคาพุ่งต่อตามงบ (Post-Earnings Announcement Drift)</span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="font-bold text-amber-400 shrink-0">⚠️ Deceleration:</span>
              <span>กำไร YoY ยังเป็นบวก แต่ QoQ เริ่มลดลง สัญญาณเตือนกำไรเริ่มชะลอตัว</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function EarningsPage() {
  const [feed, setFeed] = useState<EarningsFeed>(EMPTY_FEED);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<EarningsAnnouncement | null>(null);
  const [bucketFilter, setBucketFilter] = useState<BucketFilterOpt>('ทั้งหมด');

  const announcedCount = useMemo(() => new Set(feed.announcements.map(a => a.ticker)).size, [feed.announcements]);
  const quarterCount = useMemo(
    () => new Set(feed.announcements.map(a => a.quarter).filter(Boolean)).size,
    [feed.announcements]
  );

  const loadData = async () => {
    setLoading(true);
    setError(false);
    setSelected(null);
    try {
      const res = await fetch('/api/earnings');
      if (!res.ok) throw new Error();
      const data = await res.json();
      setFeed(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-section text-ink">
            <FileBarChart size={17} className="text-meta" /> ประกาศงบ
          </h1>
          <p className="text-label text-meta mt-0.5">
            F45 / งบการเงิน / MD&A ทั้งตลาด (SET + mai) · หน้าต่าง {feed.windowDays} วันล่าสุด
          </p>
          {!loading && (
            <p className="text-label text-meta mt-1">
              {feed.generatedAt
                ? `ข้อมูล ณ ${isoDateTimeToThai(feed.generatedAt)} (อัปเดตจากรอบ batch 09:45 / 17:30 / 20:00 — ไม่ใช่ real-time)`
                : 'ยังไม่มีข้อมูล — รอรอบ batch ถัดไป'}
            </p>
          )}
          {!loading && feed.announcements.length > 0 && (
            <p className="text-label text-meta mt-1 font-medium">
              ประกาศแล้ว {announcedCount} บริษัท · {quarterCount} งวด
            </p>
          )}
        </div>
        <button
          onClick={loadData}
          className="p-1.5 rounded-lg border border-white/[0.07] text-meta hover:text-white/60 transition-colors flex-shrink-0"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading ? (
        <TableSkeleton rows={10} />
      ) : error ? (
        <div className="py-16 text-center space-y-3">
          <p className="text-label text-meta">ไม่สามารถโหลดข้อมูลได้</p>
          <button onClick={loadData} className="px-4 py-1.5 rounded-lg text-label border border-white/10 text-white/50 hover:text-white/80 transition-colors">
            ลองอีกครั้ง
          </button>
        </div>
      ) : (
        <>
          <div className="flex gap-4 items-stretch">
            <div className="flex-1 min-w-0 space-y-4">

              <WeekCalendarStrip feed={feed} />
              <KpiSummaryHighlights feed={feed} />
              <PeadWatchSection announcements={feed.announcements} />
              <BucketCards feed={feed} activeFilter={bucketFilter} onFilterChange={setBucketFilter} />
              <AnnouncementsTable
                announcements={feed.announcements}
                onSelect={setSelected}
                selectedTicker={selected?.ticker ?? null}
                bucketFilter={bucketFilter}
                onClearBucketFilter={() => setBucketFilter('ทั้งหมด')}
              />
              <EarningsKnowledgeBase />
              <p className="text-label text-meta text-right">
                แหล่งข้อมูล: SET (ผ่าน Settrade) · ลิงก์เอกสารเปิดที่ set.or.th โดยตรง · ครอบคลุม {feed.universeSize} หลักทรัพย์
              </p>
            </div>
            {selected && (
              <div className="hidden lg:block">
                <AnnouncementSidePanel announcement={selected} onClose={() => setSelected(null)} />
              </div>
            )}
          </div>
          {selected && (
            <div className="lg:hidden">
              <AnnouncementBottomSheet announcement={selected} onClose={() => setSelected(null)} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
