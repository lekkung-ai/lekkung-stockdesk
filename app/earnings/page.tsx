'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Search, ChevronLeft, ChevronRight, ExternalLink, FileBarChart } from 'lucide-react';
import TableSkeleton from '@/components/TableSkeleton';
import TrendSparkline from '@/components/TrendSparkline';
import { sparklineMap } from '@/lib/sparklineData';
import { BUCKET_ORDER, BUCKET_LABEL, BUCKET_COLOR, BUCKET_BADGE_STYLE, type EarningsBucket } from '@/lib/earningsBucket';
import type { EarningsFeed, EarningsAnnouncement, EarningsCalendarEntry } from '@/app/api/earnings/route';

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

// ── Bucket summary cards ────────────────────────────────────────────────────

function BucketCards({ feed }: { feed: EarningsFeed }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {BUCKET_ORDER.map(key => {
        const b = feed.buckets[key];
        const color = BUCKET_COLOR[key];
        return (
          <div
            key={key}
            className="bg-[#13161e] border border-white/[0.07] rounded-xl p-3.5"
            style={{ borderLeft: `3px solid ${color}` }}
          >
            <div className="text-label font-semibold" style={{ color }}>{BUCKET_LABEL[key]}</div>
            <div className="text-stat text-ink mt-0.5 tabular-nums">{b?.count ?? 0}</div>
            <div className="mt-2 space-y-0.5">
              {(b?.top3 ?? []).length === 0 ? (
                <div className="text-label text-meta">—</div>
              ) : (
                b.top3.map(t => (
                  <div key={t.ticker} className="flex items-center justify-between text-label">
                    <span className="text-white/60 font-medium">{t.ticker}</span>
                    <span className="tabular-nums" style={{ color }}>
                      {t.netProfitYoY >= 0 ? '+' : ''}{t.netProfitYoY.toFixed(1)}%
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Week calendar strip ─────────────────────────────────────────────────────

function WeekCalendarStrip({ feed }: { feed: EarningsFeed }) {
  const router = useRouter();
  const [weekOffset, setWeekOffset] = useState(0);

  const todayAnchor = feed.generatedAt ? feed.generatedAt.slice(0, 10) : new Date().toISOString().slice(0, 10);
  const weekMonday = addDaysISO(mondayOf(todayAnchor), weekOffset * 7);
  const weekDates = [0, 1, 2, 3, 4].map(i => addDaysISO(weekMonday, i));

  const announcementByTicker = useMemo(
    () => new Map(feed.announcements.map(a => [a.ticker, a])),
    [feed.announcements]
  );

  const chipsByDate = useMemo(() => {
    const map = new Map<string, { confirmed: EarningsCalendarEntry[]; predicted: EarningsCalendarEntry[] }>();
    for (const c of feed.calendar) {
      const raw = c.date.slice(0, 10);
      const effDate = c.status === 'predicted' ? rollToWeekday(raw) : raw;
      if (!map.has(effDate)) map.set(effDate, { confirmed: [], predicted: [] });
      map.get(effDate)![c.status].push(c);
    }
    return map;
  }, [feed.calendar]);

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
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="grid grid-cols-5 gap-2 min-w-[600px]">
          {weekDates.map((date, i) => {
            const chips = chipsByDate.get(date);
            const isToday = date === todayAnchor;
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
                  {!chips && <div className="text-label text-meta">—</div>}
                </div>
              </div>
            );
          })}
        </div>
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

// ── Announcements table ──────────────────────────────────────────────────────

const BUCKET_FILTER_OPTS = ['ทั้งหมด', ...BUCKET_ORDER] as const;
type BucketFilterOpt = (typeof BUCKET_FILTER_OPTS)[number];
type ProfitFilterOpt = 'all' | 'profit' | 'loss';

function YoyBadge({ value }: { value: number | null }) {
  if (value == null) return <span className="text-meta">—</span>;
  const cls = value >= 0 ? 'bg-[#1D9E75]/15 text-[#1D9E75]' : 'bg-[#E24B4A]/15 text-[#E24B4A]';
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-label font-bold tabular-nums ${cls}`}>
      {value >= 0 ? '+' : ''}{value.toFixed(1)}%
    </span>
  );
}

function AnnouncementsTable({
  announcements,
  onSelect,
  selectedTicker,
}: {
  announcements: EarningsAnnouncement[];
  onSelect: (a: EarningsAnnouncement) => void;
  selectedTicker: string | null;
}) {
  const router = useRouter();
  const [bucketFilter, setBucketFilter] = useState<BucketFilterOpt>('ทั้งหมด');
  const [profitFilter, setProfitFilter] = useState<ProfitFilterOpt>('all');
  const [quarterFilter, setQuarterFilter] = useState('ทั้งหมด');
  const [query, setQuery] = useState('');

  const quarters = useMemo(() => {
    const s = new Set<string>();
    announcements.forEach(a => { if (a.quarter) s.add(a.quarter); });
    return ['ทั้งหมด', ...Array.from(s)];
  }, [announcements]);

  const filtered = useMemo(() => {
    return announcements
      .filter(a => bucketFilter === 'ทั้งหมด' || a.bucket === bucketFilter)
      .filter(a => profitFilter === 'all' || (profitFilter === 'profit' ? (a.netProfit ?? -1) > 0 : a.netProfit != null && a.netProfit <= 0))
      .filter(a => quarterFilter === 'ทั้งหมด' || a.quarter === quarterFilter)
      .filter(a => !query.trim() || a.ticker.toLowerCase().includes(query.trim().toLowerCase()))
      .sort((a, b) => (b.announceDate || '').localeCompare(a.announceDate || ''));
  }, [announcements, bucketFilter, profitFilter, quarterFilter, query]);

  // Row click always opens the detail panel now - desktop docks it beside
  // the table, narrow screens get a bottom sheet instead (see
  // AnnouncementSidePanel/AnnouncementBottomSheet below). The ticker button
  // itself still navigates straight to the stock page on any screen size.
  function handleRowClick(a: EarningsAnnouncement) {
    onSelect(a);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex flex-wrap gap-1.5">
          {BUCKET_FILTER_OPTS.map(b => (
            <button
              key={b}
              onClick={() => setBucketFilter(b)}
              className={`px-3 py-1.5 rounded text-label font-semibold transition-all ${
                bucketFilter === b
                  ? (b === 'ทั้งหมด' ? 'bg-white/15 text-white' : BUCKET_BADGE_STYLE[b as EarningsBucket])
                  : 'bg-white/[0.04] text-meta hover:text-white/60'
              }`}
            >
              {b === 'ทั้งหมด' ? 'ทั้งหมด' : BUCKET_LABEL[b as EarningsBucket]}
            </button>
          ))}
          <span className="w-px self-stretch bg-white/[0.08] mx-0.5" />
          <button
            onClick={() => setProfitFilter(f => (f === 'profit' ? 'all' : 'profit'))}
            className={`px-3 py-1.5 rounded text-label font-semibold transition-all ${
              profitFilter === 'profit' ? 'bg-[#1D9E75]/15 text-[#1D9E75]' : 'bg-white/[0.04] text-meta hover:text-white/60'
            }`}
          >
            มีกำไร
          </button>
          <button
            onClick={() => setProfitFilter(f => (f === 'loss' ? 'all' : 'loss'))}
            className={`px-3 py-1.5 rounded text-label font-semibold transition-all ${
              profitFilter === 'loss' ? 'bg-[#E24B4A]/15 text-[#E24B4A]' : 'bg-white/[0.04] text-meta hover:text-white/60'
            }`}
          >
            ขาดทุน
          </button>
        </div>
        <select
          value={quarterFilter}
          onChange={e => setQuarterFilter(e.target.value)}
          className="px-2.5 py-1.5 bg-[#13161e] border border-white/[0.07] rounded-lg text-label text-white/70 outline-none focus:border-white/20"
        >
          {quarters.map(q => <option key={q} value={q}>{q}</option>)}
        </select>
        <div className="relative flex-1 min-w-[160px]">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-meta" />
          <input
            type="text"
            placeholder="ค้นหาหุ้น..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full pl-7 pr-3 py-1.5 bg-[#13161e] border border-white/[0.07] rounded-lg text-label text-white/80 placeholder:text-meta outline-none focus:border-white/20"
          />
        </div>
      </div>

      <div className="bg-[#13161e] border border-white/[0.07] rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-14 text-center text-label text-meta">
            {announcements.length === 0 ? 'ยังไม่มีประกาศงบในช่วง 45 วันล่าสุด' : 'ไม่พบผลลัพธ์ที่ตรงกับตัวกรอง'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="px-3 py-3 text-label font-semibold uppercase tracking-wider text-meta whitespace-nowrap">เวลาประกาศ</th>
                  <th className="px-3 py-3 text-label font-semibold uppercase tracking-wider text-meta whitespace-nowrap">หุ้น</th>
                  <th className="px-3 py-3 text-label font-semibold uppercase tracking-wider text-meta whitespace-nowrap">งวด</th>
                  <th className="px-3 py-3 text-label font-semibold uppercase tracking-wider text-meta whitespace-nowrap text-right">กำไรสุทธิ</th>
                  <th className="px-3 py-3 text-label font-semibold uppercase tracking-wider text-meta whitespace-nowrap text-right hidden md:table-cell">ปีก่อน</th>
                  <th className="px-3 py-3 text-label font-semibold uppercase tracking-wider text-meta whitespace-nowrap">%YoY</th>
                  <th className="px-3 py-3 text-label font-semibold uppercase tracking-wider text-meta whitespace-nowrap text-right hidden md:table-cell">EPS</th>
                  <th className="px-3 py-3 text-label font-semibold uppercase tracking-wider text-meta whitespace-nowrap">เอกสาร</th>
                  <th className="px-3 py-3 text-label font-semibold uppercase tracking-wider text-meta whitespace-nowrap">สาเหตุ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {filtered.map((a, i) => (
                  <tr
                    key={`${a.ticker}-${a.announceDate}-${i}`}
                    onClick={() => handleRowClick(a)}
                    className={`cursor-pointer transition-colors border-l-2 ${
                      selectedTicker === a.ticker
                        ? 'bg-[#7F77DD]/[0.14] border-l-[#7F77DD]'
                        : 'border-l-transparent hover:bg-white/[0.02]'
                    }`}
                  >
                    <td className="px-3 py-3 text-label text-white/55 whitespace-nowrap">
                      <div>{isoDateTimeToThai(a.announceDate).replace(/ \d{2}:\d{2} น\.$/, '')}</div>
                      <div className="text-label text-meta">{timeOnly(a.announceDate)} น.</div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <button
                        onClick={(e) => { e.stopPropagation(); router.push(`/stock/${a.ticker}`); }}
                        className="text-body font-semibold text-blue-400 hover:text-blue-300"
                      >
                        {a.ticker}
                      </button>
                      {a.isCorrection && (
                        <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-label font-bold bg-[#EF9F27]/15 text-[#EF9F27] align-middle">
                          แก้ไข
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-label text-white/50 whitespace-nowrap">{a.quarter ?? '—'}</td>
                    <td className={`px-3 py-3 text-label font-semibold tabular-nums text-right whitespace-nowrap ${
                      a.netProfit != null && a.netProfit < 0 ? 'text-[#E24B4A]' : 'text-white/80'
                    }`}>
                      {fmtMoney(a.netProfit)}
                    </td>
                    <td className="px-3 py-3 text-label tabular-nums text-meta text-right whitespace-nowrap hidden md:table-cell">
                      {fmtMoney(a.netProfitPrior)}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap"><YoyBadge value={a.netProfitYoY} /></td>
                    <td className="px-3 py-3 text-label tabular-nums text-white/50 text-right whitespace-nowrap hidden md:table-cell">
                      {a.eps != null ? a.eps.toFixed(2) : '—'}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        {a.statementUrl && (
                          <a href={a.statementUrl} target="_blank" rel="noopener noreferrer"
                             className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-label font-medium bg-white/[0.05] text-white/50 hover:text-white/80 transition-colors">
                            งบ <ExternalLink size={9} />
                          </a>
                        )}
                        {a.mdaUrl && (
                          <a href={a.mdaUrl} target="_blank" rel="noopener noreferrer"
                             className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-label font-medium bg-white/[0.05] text-white/50 hover:text-white/80 transition-colors">
                            MD&A <ExternalLink size={9} />
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-label max-w-[220px]">
                      {a.reason ? (
                        <div className="text-white/50 line-clamp-2" title={a.reason}>{a.reason}</div>
                      ) : (
                        <span className="text-meta">—</span>
                      )}
                    </td>
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

// ── Page ─────────────────────────────────────────────────────────────────────

export default function EarningsPage() {
  const [feed, setFeed] = useState<EarningsFeed>(EMPTY_FEED);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<EarningsAnnouncement | null>(null);

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
          {/* loading / has-data / genuinely-empty are 3 distinct states - a
              slow connection must never see the "no data" copy while the
              fetch is still in flight (that's what generatedAt === '' in
              the EMPTY_FEED placeholder used to look like). */}
          {!loading && (
            <p className="text-label text-meta mt-1">
              {feed.generatedAt
                ? `ข้อมูล ณ ${isoDateTimeToThai(feed.generatedAt)} (อัปเดตจากรอบ batch 09:45 / 17:30 — ไม่ใช่ real-time)`
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
          {/* items-stretch (not items-start) is load-bearing: a sticky
              child only has room to stick while its OWN containing block
              (this row's second flex item) is taller than the child
              itself. items-start made that wrapper hug the panel's own
              height exactly, so the panel had zero room to detach from
              document flow and scrolled away immediately - looked
              identical to position:static. Stretching both columns to the
              row's full height (the table column, being taller, is
              unaffected) fixes it. */}
          <div className="flex gap-4 items-stretch">
            <div className="flex-1 min-w-0 space-y-4">
              <WeekCalendarStrip feed={feed} />
              <BucketCards feed={feed} />
              <AnnouncementsTable announcements={feed.announcements} onSelect={setSelected} selectedTicker={selected?.ticker ?? null} />
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
