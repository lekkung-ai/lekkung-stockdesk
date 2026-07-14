'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Search, ChevronLeft, ChevronRight, ExternalLink, FileBarChart } from 'lucide-react';
import TableSkeleton from '@/components/TableSkeleton';
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
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {BUCKET_ORDER.map(key => {
        const b = feed.buckets[key];
        const color = BUCKET_COLOR[key];
        return (
          <div
            key={key}
            className="bg-[#13161e] border border-white/[0.07] rounded-xl p-3.5"
            style={{ borderLeft: `3px solid ${color}` }}
          >
            <div className="text-[11px] font-semibold" style={{ color }}>{BUCKET_LABEL[key]}</div>
            <div className="text-[22px] font-bold text-white mt-0.5 tabular-nums">{b?.count ?? 0}</div>
            <div className="mt-2 space-y-0.5">
              {(b?.top3 ?? []).length === 0 ? (
                <div className="text-[11px] text-white/20">—</div>
              ) : (
                b.top3.map(t => (
                  <div key={t.ticker} className="flex items-center justify-between text-[11px]">
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
        <div className="text-[12px] font-semibold text-white/60">
          สัปดาห์ {isoToThaiDate(weekDates[0])} – {isoToThaiDate(weekDates[4])}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setWeekOffset(w => w - 1)}
            className="p-1.5 rounded-lg border border-white/[0.07] text-white/40 hover:text-white/70 transition-colors"
          >
            <ChevronLeft size={13} />
          </button>
          {weekOffset !== 0 && (
            <button
              onClick={() => setWeekOffset(0)}
              className="px-2 py-1 rounded-lg text-[11px] text-white/40 hover:text-white/70 transition-colors"
            >
              สัปดาห์นี้
            </button>
          )}
          <button
            onClick={() => setWeekOffset(w => w + 1)}
            className="p-1.5 rounded-lg border border-white/[0.07] text-white/40 hover:text-white/70 transition-colors"
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
                <div className="text-[10px] text-white/30 mb-1">
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
                        className="px-1.5 py-0.5 rounded text-[10px] font-semibold transition-opacity hover:opacity-80"
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
                      className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-white/[0.04] text-white/35 border border-dashed border-white/10 hover:text-white/55 transition-colors"
                    >
                      {c.ticker}
                    </button>
                  ))}
                  {!chips && <div className="text-[10px] text-white/15">—</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-3 mt-3 text-[10px] text-white/25">
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

function YoyBadge({ value }: { value: number | null }) {
  if (value == null) return <span className="text-white/20">—</span>;
  const cls = value >= 0 ? 'bg-[#1D9E75]/15 text-[#1D9E75]' : 'bg-[#E24B4A]/15 text-[#E24B4A]';
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold tabular-nums ${cls}`}>
      {value >= 0 ? '+' : ''}{value.toFixed(1)}%
    </span>
  );
}

function AnnouncementsTable({ announcements }: { announcements: EarningsAnnouncement[] }) {
  const router = useRouter();
  const [bucketFilter, setBucketFilter] = useState<BucketFilterOpt>('ทั้งหมด');
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
      .filter(a => quarterFilter === 'ทั้งหมด' || a.quarter === quarterFilter)
      .filter(a => !query.trim() || a.ticker.toLowerCase().includes(query.trim().toLowerCase()))
      .sort((a, b) => (b.announceDate || '').localeCompare(a.announceDate || ''));
  }, [announcements, bucketFilter, quarterFilter, query]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex flex-wrap gap-1.5">
          {BUCKET_FILTER_OPTS.map(b => (
            <button
              key={b}
              onClick={() => setBucketFilter(b)}
              className={`px-3 py-1.5 rounded text-[12px] font-semibold transition-all ${
                bucketFilter === b
                  ? (b === 'ทั้งหมด' ? 'bg-white/15 text-white' : BUCKET_BADGE_STYLE[b as EarningsBucket])
                  : 'bg-white/[0.04] text-white/30 hover:text-white/60'
              }`}
            >
              {b === 'ทั้งหมด' ? 'ทั้งหมด' : BUCKET_LABEL[b as EarningsBucket]}
            </button>
          ))}
        </div>
        <select
          value={quarterFilter}
          onChange={e => setQuarterFilter(e.target.value)}
          className="px-2.5 py-1.5 bg-[#13161e] border border-white/[0.07] rounded-lg text-[12px] text-white/70 outline-none focus:border-white/20"
        >
          {quarters.map(q => <option key={q} value={q}>{q}</option>)}
        </select>
        <div className="relative flex-1 min-w-[160px]">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            type="text"
            placeholder="ค้นหาหุ้น..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full pl-7 pr-3 py-1.5 bg-[#13161e] border border-white/[0.07] rounded-lg text-[12px] text-white/80 placeholder:text-white/25 outline-none focus:border-white/20"
          />
        </div>
      </div>

      <div className="bg-[#13161e] border border-white/[0.07] rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-14 text-center text-[13px] text-white/30">
            {announcements.length === 0 ? 'ยังไม่มีประกาศงบในช่วง 45 วันล่าสุด' : 'ไม่พบผลลัพธ์ที่ตรงกับตัวกรอง'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/25 whitespace-nowrap">เวลาประกาศ</th>
                  <th className="px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/25 whitespace-nowrap">หุ้น</th>
                  <th className="px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/25 whitespace-nowrap">งวด</th>
                  <th className="px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/25 whitespace-nowrap text-right">กำไรสุทธิ</th>
                  <th className="px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/25 whitespace-nowrap text-right hidden md:table-cell">ปีก่อน</th>
                  <th className="px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/25 whitespace-nowrap">%YoY</th>
                  <th className="px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/25 whitespace-nowrap text-right hidden md:table-cell">EPS</th>
                  <th className="px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/25 whitespace-nowrap">เอกสาร</th>
                  <th className="px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/25 whitespace-nowrap">สาเหตุ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {filtered.map((a, i) => (
                  <tr key={`${a.ticker}-${a.announceDate}-${i}`} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-3 py-3 text-[12.5px] text-white/55 whitespace-nowrap">
                      <div>{isoDateTimeToThai(a.announceDate).replace(/ \d{2}:\d{2} น\.$/, '')}</div>
                      <div className="text-[10px] text-white/30">{timeOnly(a.announceDate)} น.</div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <button
                        onClick={() => router.push(`/stock/${a.ticker}`)}
                        className="text-[14px] font-semibold text-blue-400 hover:text-blue-300"
                      >
                        {a.ticker}
                      </button>
                      {a.isCorrection && (
                        <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-[#EF9F27]/15 text-[#EF9F27] align-middle">
                          แก้ไข
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-[12.5px] text-white/50 whitespace-nowrap">{a.quarter ?? '—'}</td>
                    <td className={`px-3 py-3 text-[13px] font-semibold tabular-nums text-right whitespace-nowrap ${
                      a.netProfit != null && a.netProfit < 0 ? 'text-[#E24B4A]' : 'text-white/80'
                    }`}>
                      {fmtMoney(a.netProfit)}
                    </td>
                    <td className="px-3 py-3 text-[12.5px] tabular-nums text-white/40 text-right whitespace-nowrap hidden md:table-cell">
                      {fmtMoney(a.netProfitPrior)}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap"><YoyBadge value={a.netProfitYoY} /></td>
                    <td className="px-3 py-3 text-[12.5px] tabular-nums text-white/50 text-right whitespace-nowrap hidden md:table-cell">
                      {a.eps != null ? a.eps.toFixed(2) : '—'}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {a.statementUrl && (
                          <a href={a.statementUrl} target="_blank" rel="noopener noreferrer"
                             className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10.5px] font-medium bg-white/[0.05] text-white/50 hover:text-white/80 transition-colors">
                            งบ <ExternalLink size={9} />
                          </a>
                        )}
                        {a.mdaUrl && (
                          <a href={a.mdaUrl} target="_blank" rel="noopener noreferrer"
                             className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10.5px] font-medium bg-white/[0.05] text-white/50 hover:text-white/80 transition-colors">
                            MD&A <ExternalLink size={9} />
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-[12px] text-white/15">—</td>
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

// ── Page ─────────────────────────────────────────────────────────────────────

export default function EarningsPage() {
  const [feed, setFeed] = useState<EarningsFeed>(EMPTY_FEED);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError(false);
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
          <h1 className="flex items-center gap-2 text-[18px] font-bold text-white">
            <FileBarChart size={17} className="text-white/40" /> ประกาศงบ
          </h1>
          <p className="text-[12px] text-white/35 mt-0.5">
            F45 / งบการเงิน / MD&A ทั้งตลาด (SET + mai) · หน้าต่าง {feed.windowDays} วันล่าสุด
          </p>
          <p className="text-[11px] text-white/25 mt-1">
            {feed.generatedAt
              ? `ข้อมูล ณ ${isoDateTimeToThai(feed.generatedAt)} (อัปเดตจากรอบ batch 09:45 / 17:30 — ไม่ใช่ real-time)`
              : 'ยังไม่มีข้อมูล — รอรอบ batch ถัดไป'}
          </p>
        </div>
        <button
          onClick={loadData}
          className="p-1.5 rounded-lg border border-white/[0.07] text-white/35 hover:text-white/60 transition-colors flex-shrink-0"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading ? (
        <TableSkeleton rows={10} />
      ) : error ? (
        <div className="py-16 text-center space-y-3">
          <p className="text-[13px] text-white/30">ไม่สามารถโหลดข้อมูลได้</p>
          <button onClick={loadData} className="px-4 py-1.5 rounded-lg text-[12px] border border-white/10 text-white/50 hover:text-white/80 transition-colors">
            ลองอีกครั้ง
          </button>
        </div>
      ) : (
        <>
          <WeekCalendarStrip feed={feed} />
          <BucketCards feed={feed} />
          <AnnouncementsTable announcements={feed.announcements} />
          <p className="text-[10px] text-white/20 text-right">
            แหล่งข้อมูล: SET (ผ่าน Settrade) · ลิงก์เอกสารเปิดที่ set.or.th โดยตรง · ครอบคลุม {feed.universeSize} หลักทรัพย์
          </p>
        </>
      )}
    </div>
  );
}
