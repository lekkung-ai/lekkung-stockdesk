'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { bangkokDateKey, bangkokParts } from '@/lib/utils';
import Link from 'next/link';
import { AlertTriangle, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import TableSkeleton from '@/components/TableSkeleton';
import rawCombined from '@/data/scans/combined.json';
import type { CalendarRow } from '@/app/api/corporate-action/route';
import type { EarningsAnnouncement, EarningsFeed } from '@/app/api/earnings/route';
import { BUCKET_ORDER, BUCKET_LABEL, BUCKET_COLOR, type EarningsBucket } from '@/lib/earningsBucket';
import { loadMyStockSymbols } from '@/lib/myStocks';
import { isHalted, listingCalc, xrCalc, type CapitalEvent, type CapitalEventsFile } from '@/lib/capitalCalc';
import type { NewsFlagsFile } from '@/lib/newsFlags';
import CapitalDetail, { capitalMainLine, type CapitalRowInput } from './CapitalDetail';

// ─── Combined-scan price lookup (XD yield, capital-event numbers) ───
type CombinedEntry = { ticker: string; price: number };
const _rawC = rawCombined as unknown as CombinedEntry[] | { data: CombinedEntry[] };
const combinedData: CombinedEntry[] = Array.isArray(_rawC) ? _rawC : _rawC.data;
const PRICE_MAP = new Map(combinedData.map(c => [c.ticker, c.price]));

const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const WEEKDAYS_TH = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

function todayISO(): string {
  return bangkokDateKey(); // today in Asia/Bangkok (toISOString is UTC: wrong day before 07:00)
}
function addDaysISO(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function isoToThaiLabel(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${parseInt(d)} ${MONTHS[parseInt(m) - 1]} ${parseInt(y) + 543}`;
}
function daysUntil(iso: string): number {
  const target = new Date(iso + 'T00:00:00Z').getTime();
  const today = new Date(todayISO() + 'T00:00:00Z').getTime();
  return Math.round((target - today) / 86400000);
}

// ─── Unified event model - earnings (real+predicted) and every corporate-action
// type, merged so the calendar shows everything in one layer instead of
// requiring two separate pages to get the full picture ───
type EventKind = 'earnings' | 'XD' | 'XR' | 'XW' | 'XM' | 'XA' | 'NEW' | 'BOARD'; // NEW/BOARD: capital_events.json

interface UnifiedEvent {
  key: string;
  kind: EventKind;
  ticker: string;
  date: string; // primary sort/group date - announceDate (earnings) or xDate (CA)
  // earnings-only
  earningsStatus?: 'confirmed' | 'predicted';
  bucket?: EarningsBucket | null;
  bucketIsLastKnown?: boolean; // true => this is the ticker's last confirmed bucket, shown faded, not this event's own result
  quarter?: string | null;
  // corporate-action-only
  detail?: string;
  payDate?: string | null;
  dividendAmount?: number | null;
  ratio?: string | null;
  subscriptionPrice?: number | null;
  allotShare?: number | null;
  // capital detail block (XR / XW / NEW / BOARD)
  capital?: CapitalEvent;
  cap?: CapitalRowInput;
  warn?: boolean;
}

const CA_COLOR: Record<Exclude<EventKind, 'earnings'>, string> = {
  XD: '#EAB308',  // yellow - cash event
  XR: '#A855F7',  // purple - dilution, must stand out
  XW: '#EF9F27',  // orange
  XM: 'rgba(255,255,255,0.5)', // gray - lowest priority
  XA: 'rgba(255,255,255,0.35)',
  NEW: '#E879F9', // pink - new shares entering the market
  BOARD: 'rgba(255,255,255,0.35)',
};
const CA_LABEL: Record<Exclude<EventKind, 'earnings'>, string> = {
  XD: 'เงินปันผล (XD)', XR: 'เพิ่มทุน (XR)', XW: 'แจกวอร์แรนต์ (XW)', XM: 'ประชุมผู้ถือหุ้น (XM)', XA: 'อื่นๆ',
  NEW: 'หุ้นใหม่เข้า', BOARD: 'บอร์ดอนุมัติเพิ่มทุน',
};
const CA_BADGE_CLS: Record<Exclude<EventKind, 'earnings'>, string> = {
  XD: 'bg-[#EAB308]/15 text-[#EAB308] ring-1 ring-[#EAB308]/30',
  XR: 'bg-[#A855F7]/15 text-[#A855F7] ring-1 ring-[#A855F7]/30',
  XW: 'bg-[#EF9F27]/15 text-[#EF9F27] ring-1 ring-[#EF9F27]/30',
  XM: 'bg-white/10 text-white/50 ring-1 ring-white/10',
  XA: 'bg-white/[0.07] text-white/40 ring-1 ring-white/10',
  NEW: 'bg-[#E879F9]/15 text-[#f0abfc] ring-1 ring-[#E879F9]/30',
  BOARD: 'bg-white/[0.06] text-white/50 ring-1 ring-white/10',
};

type EventFilter = 'all' | 'earnings' | 'XD' | 'XR_XW' | 'NEW' | 'XM';
const EVENT_FILTER_OPTS: { key: EventFilter; label: string }[] = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'earnings', label: 'ประกาศงบ' },
  { key: 'XD', label: 'XD' },
  { key: 'XR_XW', label: 'XR+XW' },
  { key: 'NEW', label: 'หุ้นใหม่เข้า' },
  { key: 'XM', label: 'XM' },
];
function passesEventFilter(e: UnifiedEvent, f: EventFilter): boolean {
  if (f === 'all') return true;
  if (f === 'earnings') return e.kind === 'earnings';
  if (f === 'XD') return e.kind === 'XD';
  if (f === 'XR_XW') return e.kind === 'XR' || e.kind === 'XW';
  if (f === 'NEW') return e.kind === 'NEW' || e.kind === 'BOARD';
  if (f === 'XM') return e.kind === 'XM';
  return true;
}

// ─── Event row (shared shell across all kinds) ───
function EarningsBadge({ bucket, isLastKnown }: { bucket: EarningsBucket | null | undefined; isLastKnown: boolean }) {
  if (!bucket) {
    return <span className="text-[13px] text-white/20">—</span>;
  }
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${isLastKnown ? 'opacity-45' : ''}`}>
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: BUCKET_COLOR[bucket] }} />
      <span className="text-[12px] font-medium" style={{ color: BUCKET_COLOR[bucket] }}>
        {BUCKET_LABEL[bucket]}{isLastKnown ? ' (งวดก่อน)' : ''}
      </span>
    </span>
  );
}

function EventTypeBadge({ event }: { event: UnifiedEvent }) {
  return event.kind === 'earnings' ? (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-white/10 text-white/60 whitespace-nowrap">
      {event.earningsStatus === 'predicted' ? 'คาดการณ์' : 'ประกาศงบ'}
    </span>
  ) : (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold whitespace-nowrap ${CA_BADGE_CLS[event.kind]}`}>
      {event.warn && <AlertTriangle size={11} className="flex-shrink-0" />}
      {event.kind === 'NEW' ? (event.capital?.source_type ? `${event.capital.source_type} เข้า` : 'หุ้นใหม่เข้า')
        : event.kind === 'BOARD' ? 'ประกาศแล้ว' : event.kind}
    </span>
  );
}

function EventDetail({ event, yieldPct }: { event: UnifiedEvent; yieldPct: number | null }) {
  return event.kind === 'earnings' ? (
    <div className="flex items-center gap-2 flex-wrap">
      <EarningsBadge bucket={event.bucket} isLastKnown={!!event.bucketIsLastKnown} />
      {event.quarter && <span className="text-white/30 text-[11px]">{event.quarter}</span>}
    </div>
  ) : event.kind === 'XD' ? (
    <span>
      เงินปันผล {event.dividendAmount != null ? `${event.dividendAmount} บาท/หุ้น` : '—'}
      {yieldPct != null && <span className="text-[#1D9E75] ml-1.5">(yield ~{yieldPct.toFixed(2)}%)</span>}
    </span>
  ) : event.kind === 'XR' ? (
    <span className="text-[#A855F7]">
      {event.ratio ? `อัตราส่วน ${event.ratio}` : ''}{event.subscriptionPrice != null ? ` ราคาใช้สิทธิ ${event.subscriptionPrice} บาท` : ''}
      {!event.ratio && event.subscriptionPrice == null && event.detail}
    </span>
  ) : event.kind === 'XW' ? (
    <span>{event.ratio ? `อัตราส่วน ${event.ratio}` : event.detail}</span>
  ) : (event.kind === 'NEW' || event.kind === 'BOARD') && event.capital ? (
    <span className={event.kind === 'NEW' ? 'text-[#f0abfc]' : 'text-white/45'}>{capitalMainLine(event.capital)}</span>
  ) : (
    <span>{event.detail}</span>
  );
}

function EventRow({ event }: { event: UnifiedEvent }) {
  const days = daysUntil(event.date);
  const dayBadge =
    days < 0 ? <span className="text-[10px] text-white/25 ml-1.5 whitespace-nowrap">ผ่านมาแล้ว {Math.abs(days)} วัน</span>
    : days === 0 ? <span className="text-[10px] font-semibold text-white/45 bg-white/[0.06] px-1.5 py-0.5 rounded ml-1.5 whitespace-nowrap">วันนี้</span>
    : <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ml-1.5 whitespace-nowrap ${days <= 3 ? 'bg-[#E24B4A]/15 text-[#E24B4A]' : days <= 7 ? 'bg-[#EF9F27]/15 text-[#EF9F27]' : 'bg-white/[0.05] text-white/30'}`}>เหลือ {days} วัน</span>;

  const price = PRICE_MAP.get(event.ticker);
  const yieldPct = event.kind === 'XD' && event.dividendAmount != null && price ? (event.dividendAmount / price) * 100 : null;

  return (
    <div className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors">
      {/* Mobile: 2-line card - no fixed-width columns, nothing can push past
          the viewport edge. Desktop: original fixed-width row layout. */}
      <div className="md:hidden px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Link href={`/stock/${event.ticker}`} className="text-[14px] font-semibold text-blue-400 hover:text-blue-300 flex-shrink-0">
              {event.ticker}
            </Link>
            <EventTypeBadge event={event} />
          </div>
          <span className="text-[12px] text-white/55 whitespace-nowrap flex-shrink-0">{isoToThaiLabel(event.date)}</span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-1.5">
          <div className="text-[12.5px] text-white/65 min-w-0 truncate">
            <EventDetail event={event} yieldPct={yieldPct} />
          </div>
          {dayBadge}
        </div>
        {event.payDate && (
          <div className="text-[11px] text-white/35 mt-1">จ่ายเงิน {isoToThaiLabel(event.payDate)}</div>
        )}
      </div>

      <div className="hidden md:flex items-start gap-3 px-3 py-3">
        <div className="w-[110px] flex-shrink-0 text-[13px] text-white/55">
          {isoToThaiLabel(event.date)}
          {dayBadge}
        </div>
        <div className="w-[70px] flex-shrink-0">
          <Link href={`/stock/${event.ticker}`} className="text-[14px] font-semibold text-blue-400 hover:text-blue-300">
            {event.ticker}
          </Link>
        </div>
        <div className="w-[90px] flex-shrink-0">
          <EventTypeBadge event={event} />
        </div>
        <div className="flex-1 min-w-0 text-[13px] text-white/65">
          <EventDetail event={event} yieldPct={yieldPct} />
        </div>
        <div className="w-[100px] flex-shrink-0 text-[12px] text-white/40 text-right">
          {event.payDate ? isoToThaiLabel(event.payDate) : event.capital?.announce_date ? `ประกาศ ${isoToThaiLabel(event.capital.announce_date)}` : ''}
        </div>
      </div>
      {event.cap && <CapitalDetail r={event.cap} />}
    </div>
  );
}

// ─── Legend (collapsible on mobile, matches the existing earnings-color legend pattern) ───
function Legend() {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="px-1">
      <button onClick={() => setExpanded(v => !v)} className="md:hidden flex items-center gap-2 text-left">
        <span className="flex items-center gap-1">
          {BUCKET_ORDER.map(b => <span key={b} className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: BUCKET_COLOR[b] }} />)}
          {(['XD', 'XR', 'XW', 'XM'] as const).map(k => <span key={k} className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: CA_COLOR[k] }} />)}
        </span>
        <span className="text-[11px] text-white/25">สีของ event {expanded ? '▲' : '▼'}</span>
      </button>
      <div className={`${expanded ? 'flex' : 'hidden'} md:flex flex-wrap gap-x-4 gap-y-1.5 items-center mt-2 md:mt-0`}>
        <span className="text-[11px] text-white/25">ผลประกอบการ:</span>
        {BUCKET_ORDER.map(b => (
          <span key={b} className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: BUCKET_COLOR[b] }} />
            <span className="text-[11px] text-white/45">{BUCKET_LABEL[b]}</span>
          </span>
        ))}
        <span className="text-[11px] text-white/25 ml-2">Corporate action:</span>
        {(['XD', 'XR', 'XW', 'XM'] as const).map(k => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: CA_COLOR[k] }} />
            <span className="text-[11px] text-white/45">{CA_LABEL[k]}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Month grid view ───
function MonthGrid({
  year, month, events, selectedDate, onSelectDate,
}: {
  year: number; month: number; events: UnifiedEvent[]; selectedDate: string; onSelectDate: (d: string) => void;
}) {
  const eventsByDate = useMemo(() => {
    const map = new Map<string, UnifiedEvent[]>();
    for (const e of events) {
      const arr = map.get(e.date) ?? [];
      arr.push(e);
      map.set(e.date, arr);
    }
    return map;
  }, [events]);

  const firstOfMonth = new Date(Date.UTC(year, month, 1));
  const startWeekday = firstOfMonth.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: { iso: string; inMonth: boolean }[] = [];
  for (let i = 0; i < startWeekday; i++) {
    const d = new Date(Date.UTC(year, month, 1 - (startWeekday - i)));
    cells.push({ iso: d.toISOString().slice(0, 10), inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ iso: new Date(Date.UTC(year, month, d)).toISOString().slice(0, 10), inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1];
    const d = new Date(last.iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    cells.push({ iso: d.toISOString().slice(0, 10), inMonth: false });
  }

  return (
    <div>
      <div className="grid grid-cols-7 text-center text-[10px] text-white/25 mb-1">
        {WEEKDAYS_TH.map(w => <div key={w} className="py-1">{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map(({ iso, inMonth }) => {
          const dayEvents = eventsByDate.get(iso) ?? [];
          const isSelected = iso === selectedDate;
          const isToday = iso === todayISO();
          return (
            <button
              key={iso}
              onClick={() => onSelectDate(iso)}
              className={`aspect-square rounded-lg p-1 text-left flex flex-col transition-colors ${
                isSelected ? 'bg-white/15 ring-1 ring-white/25' : 'bg-white/[0.03] hover:bg-white/[0.07]'
              } ${!inMonth ? 'opacity-30' : ''}`}
            >
              <span className={`text-[11px] ${isToday ? 'font-bold text-[#1D9E75]' : 'text-white/50'}`}>
                {parseInt(iso.slice(8, 10))}
              </span>
              <div className="flex flex-wrap gap-0.5 mt-auto">
                {dayEvents.slice(0, 4).map((e, i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: e.kind === 'earnings' ? (e.bucket ? BUCKET_COLOR[e.bucket] : 'rgba(255,255,255,0.3)') : CA_COLOR[e.kind] }}
                    title={`${e.ticker} · ${e.kind === 'earnings' ? 'ประกาศงบ' : e.kind}`}
                  />
                ))}
                {dayEvents.length > 4 && <span className="text-[8px] text-white/30">+{dayEvents.length - 4}</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function CalendarPage() {
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [eventFilter, setEventFilter] = useState<EventFilter>('all');
  const [myOnly, setMyOnly] = useState(false); // "☆ เฉพาะ My Stocks" toggle (off = every stock)
  const [myStocks, setMyStocks] = useState<Set<string>>(new Set());

  const [fromDate, setFromDate] = useState(todayISO());
  const [toDate, setToDate] = useState(addDaysISO(todayISO(), 14));
  const [monthCursor, setMonthCursor] = useState(() => {
    const p = bangkokParts(new Date());
    return { year: p.year, month: p.month - 1 };
  });
  const [selectedDate, setSelectedDate] = useState(todayISO());

  const [caRows, setCaRows] = useState<CalendarRow[]>([]);
  const [earningsFeed, setEarningsFeed] = useState<EarningsFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // capital_events.json (facts) + news_flags.json (SP/H marks) - static files; missing → rows as before
  const [capFile, setCapFile] = useState<CapitalEventsFile | null>(null);
  const [capState, setCapState] = useState<'loading' | 'ok' | 'missing'>('loading');
  const [haltedSet, setHaltedSet] = useState<Set<string>>(new Set());

  // My Stocks is localStorage-only - hydrate client-side after mount.
  useEffect(() => { setMyStocks(new Set(loadMyStockSymbols())); }, []);

  // Earnings feed covers its own fixed window (real + predicted) regardless
  // of view mode - fetched once, filtered client-side same as CA events.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/earnings');
        if (res.ok) setEarningsFeed(await res.json());
      } catch { /* earnings events just won't show */ }
    })();
  }, []);

  useEffect(() => {
    fetch('/data/capital_events.json')
      .then(r => (r.ok ? (r.json() as Promise<CapitalEventsFile>) : null))
      .then(f => {
        const ok = !!f && Array.isArray(f.events);
        setCapFile(ok ? f : null);
        setCapState(ok ? 'ok' : 'missing');
      })
      .catch(() => setCapState('missing'));
    fetch('/data/news_flags.json')
      .then(r => (r.ok ? (r.json() as Promise<NewsFlagsFile>) : null))
      .then(f => {
        const s = new Set<string>();
        for (const [t, flags] of Object.entries(f?.flags ?? {})) {
          if (Array.isArray(flags) && isHalted(flags.filter(x => x?.type === 'mark').map(x => x.label))) s.add(t);
        }
        setHaltedSet(s);
      })
      .catch(() => { /* no marks → nothing treated as halted */ });
  }, []);

  const rangeFrom = viewMode === 'month'
    ? new Date(Date.UTC(monthCursor.year, monthCursor.month, 1)).toISOString().slice(0, 10)
    : fromDate;
  const rangeTo = viewMode === 'month'
    ? new Date(Date.UTC(monthCursor.year, monthCursor.month + 1, 0)).toISOString().slice(0, 10)
    : toDate;

  const loadCA = useCallback(async (from: string, to: string) => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/corporate-action?from=${from}&to=${to}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setCaRows(data.rows ?? []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCA(rangeFrom, rangeTo); }, [loadCA, rangeFrom, rangeTo]);

  // ─── Merge earnings (real + predicted) and every CA type into one list ───
  const allEvents = useMemo<UnifiedEvent[]>(() => {
    const events: UnifiedEvent[] = [];

    if (earningsFeed) {
      const latestByTicker = new Map<string, EarningsAnnouncement>();
      for (const ann of earningsFeed.announcements ?? []) {
        const prev = latestByTicker.get(ann.ticker);
        if (!prev || ann.announceDate > prev.announceDate) latestByTicker.set(ann.ticker, ann);
      }
      for (const entry of earningsFeed.calendar ?? []) {
        // entry.date is a full ISO datetime for predicted entries (isoformat()
        // on the Python side) but a plain date for confirmed ones - normalize
        // both to YYYY-MM-DD before any comparison/date-math, or daysUntil()
        // and the range filter below silently produce NaN/wrong results.
        const dateOnly = entry.date.slice(0, 10);
        if (dateOnly < rangeFrom || dateOnly > rangeTo) continue;
        if (entry.status === 'confirmed') {
          const match = (earningsFeed.announcements ?? []).find(a => a.ticker === entry.ticker && a.announceDate.slice(0, 10) === dateOnly);
          events.push({
            key: `earn-${entry.ticker}-${dateOnly}`, kind: 'earnings', ticker: entry.ticker, date: dateOnly,
            earningsStatus: 'confirmed', bucket: match?.bucket ?? null, bucketIsLastKnown: false, quarter: entry.quarter,
          });
        } else {
          const last = latestByTicker.get(entry.ticker);
          events.push({
            key: `earn-${entry.ticker}-${dateOnly}`, kind: 'earnings', ticker: entry.ticker, date: dateOnly,
            earningsStatus: 'predicted', bucket: last?.bucket ?? null, bucketIsLastKnown: true, quarter: entry.quarter,
          });
        }
      }
    }

    const capEvents = capFile?.events ?? [];
    const roResults = capEvents.filter(c => c.kind === 'ro_result');
    const closeOf = (t: string) => { const p = PRICE_MAP.get(t); return typeof p === 'number' && p > 0 ? p : null; };
    const keyCount = new Map<string, number>();
    for (const row of caRows) {
      // one ticker can have two rows of a type on one day (two warrant series) - keys must stay unique
      const base = `ca-${row.ticker}-${row.caType}-${row.xDate}`;
      const n = keyCount.get(base) ?? 0;
      keyCount.set(base, n + 1);
      const ev: UnifiedEvent = {
        key: n ? `${base}-${n + 1}` : base, kind: row.bucket, ticker: row.ticker, date: row.xDate,
        detail: row.detail, payDate: row.payDate, dividendAmount: row.dividendAmount, ratio: row.ratio, subscriptionPrice: row.subscriptionPrice,
        allotShare: row.allotShare,
      };
      if (row.bucket === 'XR' || row.bucket === 'XW') {
        const halted = haltedSet.has(row.ticker);
        const xw = row.bucket === 'XR' ? caRows.find(x => x.bucket === 'XW' && x.ticker === row.ticker && x.xDate === row.xDate) : undefined;
        const res = row.bucket === 'XR'
          ? roResults.find(c => c.ticker === row.ticker && c.date >= row.xDate && (c.price == null || c.price === row.subscriptionPrice))
          : undefined;
        ev.cap = {
          kind: row.bucket, ticker: row.ticker, upcoming: daysUntil(row.xDate) >= 0, close: closeOf(row.ticker), halted,
          ratio: row.ratio, exercise: row.subscriptionPrice, allotShare: row.allotShare ?? null,
          withWarrant: xw ? { ratio: xw.ratio, allotShare: xw.allotShare ?? null } : null,
          result: res && res.take_up_pct != null
            ? { news_id: res.origin?.news_id ?? null, allotted: res.allotted ?? 0, sold: res.sold ?? 0, take_up_pct: res.take_up_pct }
            : null,
        };
        if (row.bucket === 'XR') {
          ev.warn = !!xrCalc({ ratio: row.ratio, exercise: row.subscriptionPrice, close: ev.cap.close, upcoming: ev.cap.upcoming, halted })?.warn;
        }
      }
      events.push(ev);
    }

    for (const c of capEvents) {
      if (c.kind !== 'listing' && c.kind !== 'board') continue;
      if (!c.date || c.date < rangeFrom || c.date > rangeTo) continue;
      const kind: EventKind = c.kind === 'listing' ? 'NEW' : 'BOARD';
      const halted = haltedSet.has(c.ticker);
      const close = closeOf(c.ticker);
      events.push({
        key: `cap-${c.id}`, kind, ticker: c.ticker, date: c.date, capital: c,
        cap: { kind, ticker: c.ticker, upcoming: daysUntil(c.date) >= 0, close, halted, capital: c },
        warn: kind === 'NEW' && !!listingCalc({ old: c.shares?.old, added: c.shares?.new, price: c.price, close, halted })?.warn,
      });
    }

    events.sort((a, b) => a.date.localeCompare(b.date) || a.ticker.localeCompare(b.ticker));
    return events;
  }, [earningsFeed, caRows, capFile, haltedSet, rangeFrom, rangeTo]);

  const filteredEvents = useMemo(() => {
    return allEvents.filter(e => {
      if (!passesEventFilter(e, eventFilter)) return false;
      if (myOnly && !myStocks.has(e.ticker)) return false;
      return true;
    });
  }, [allEvents, eventFilter, myOnly, myStocks]);

  // My Stocks holding an XR/XW within 14 days - dilution/warrant events are
  // rare but high-impact, worth a standing warning regardless of filters.
  const dilutionWarnings = useMemo(() => {
    return allEvents.filter(e =>
      (e.kind === 'XR' || e.kind === 'XW') && myStocks.has(e.ticker) &&
      daysUntil(e.date) >= 0 && daysUntil(e.date) <= 14
    );
  }, [allEvents, myStocks]);

  const myStocksWithEvents = useMemo(() => {
    const s = new Set<string>();
    allEvents.filter(e => passesEventFilter(e, eventFilter) && myStocks.has(e.ticker)).forEach(e => s.add(e.ticker));
    return s;
  }, [allEvents, eventFilter, myStocks]);

  const myStocksWithoutEvents = useMemo(() => {
    if (!myOnly) return [];
    const missing: string[] = [];
    myStocks.forEach(ticker => {
      if (!myStocksWithEvents.has(ticker)) missing.push(ticker);
    });
    return missing;
  }, [myOnly, myStocks, myStocksWithEvents]);

  const monthEvents = viewMode === 'month' ? filteredEvents : [];
  const selectedDayEvents = viewMode === 'month' ? filteredEvents.filter(e => e.date === selectedDate) : filteredEvents;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[18px] font-bold text-white">ปฏิทินหลักทรัพย์</h1>
          <p className="text-[12px] text-white/35 mt-0.5 md:hidden">งบ + XD/XR/XW/XM ชั้นเดียว</p>
          <p className="hidden md:block text-[12px] text-white/35 mt-0.5">
            ประกาศงบ (จริง+คาดการณ์) และ corporate action ทุกชนิด ในปฏิทินเดียว
          </p>
        </div>
        <button
          onClick={() => loadCA(rangeFrom, rangeTo)}
          className="p-1.5 rounded-lg border border-white/[0.07] text-white/35 hover:text-white/60 transition-colors flex-shrink-0"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {dilutionWarnings.length > 0 && (
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-[#A855F7]/10 border border-[#A855F7]/30 text-[12.5px] text-[#A855F7]">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          <span>
            หุ้นที่คุณถือกำลังจะเพิ่มทุน/แจกวอร์แรนต์:{' '}
            {dilutionWarnings.map((e, i) => (
              <span key={e.key}>
                {i > 0 && ', '}
                <Link href={`/stock/${e.ticker}`} className="font-semibold underline decoration-dotted">{e.ticker}</Link>
                {' '}วันที่ {isoToThaiLabel(e.date)}
              </span>
            ))}
          </span>
        </div>
      )}

      {/* My Stocks Status Banner */}
      {myOnly && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3.5 text-[12px] text-white/80 space-y-1 shadow-sm">
          <p className="font-semibold text-blue-300 flex items-center gap-1.5">
            <span>📌</span>
            <span>My Stocks ของคุณมีทั้งหมด {myStocks.size} หุ้น:</span>
            <span className="text-white font-bold">{Array.from(myStocks).join(', ') || 'ไม่มีหุ้น'}</span>
          </p>
          <p className="text-white/60 text-[11.5px] leading-relaxed">
            * หน้าปฏิทินแสดงเฉพาะ <strong className="text-white">เหตุการณ์ (ประกาศงบ / XD / XR / XW / XM) ที่เกิดขึ้นในช่วงวันที่เลือก ({isoToThaiLabel(rangeFrom)} – {isoToThaiLabel(rangeTo)})</strong>
            {myStocksWithoutEvents.length > 0 && (
              <span className="block mt-1 text-amber-300/90 font-medium">
                • หุ้นที่ไม่มีเหตุการณ์ในช่วงเวลานี้: {myStocksWithoutEvents.join(', ')} (สามารถขยายช่วงวันที่เพื่อดูเหตุการณ์ในเดือนอื่นๆ ได้)
              </span>
            )}
          </p>
        </div>
      )}

      {/* View toggle */}
      <div className="flex items-center gap-1.5">
        {(['week', 'month'] as const).map(v => (
          <button
            key={v}
            onClick={() => setViewMode(v)}
            className={`px-3 py-1.5 rounded-lg text-[12.5px] font-semibold transition-all ${
              viewMode === v ? 'bg-white/15 text-white' : 'bg-white/[0.04] text-white/30 hover:text-white/60'
            }`}
          >
            {v === 'week' ? 'สัปดาห์' : 'เดือน'}
          </button>
        ))}
      </div>

      {/* Event TYPE row (default "all" so rare XR events are never hidden) + one My Stocks toggle at its end. */}
      <div className="space-y-1.5">
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-[12px] text-white/40 w-14 flex-shrink-0">ประเภท</span>
          {EVENT_FILTER_OPTS.map(o => (
            <button
              key={o.key}
              onClick={() => setEventFilter(o.key)}
              className={`px-3 py-1.5 rounded text-[12.5px] font-semibold transition-all ${
                eventFilter === o.key ? 'bg-white/15 text-white' : 'bg-white/[0.04] text-white/30 hover:text-white/60'
              }`}
            >
              {o.label}
            </button>
          ))}
          <button
            onClick={() => setMyOnly(v => !v)}
            aria-pressed={myOnly}
            className={`ml-2 px-3 py-1.5 rounded text-[12.5px] font-semibold border transition-all ${
              myOnly ? 'bg-white/15 text-white border-white/25' : 'bg-transparent text-white/45 border-white/15 hover:text-white/70'
            }`}
          >
            {myOnly ? '★' : '☆'} เฉพาะ My Stocks
          </button>
        </div>
      </div>

      {viewMode === 'week' ? (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={fromDate}
            max={toDate}
            onChange={e => setFromDate(e.target.value)}
            className="px-2 py-2 bg-[#13161e] border border-white/[0.07] rounded-xl text-[12px] text-white/70 outline-none focus:border-white/20 [color-scheme:dark]"
          />
          <span className="text-white/25 text-[11px]">ถึง</span>
          <input
            type="date"
            value={toDate}
            min={fromDate}
            onChange={e => setToDate(e.target.value)}
            className="px-2 py-2 bg-[#13161e] border border-white/[0.07] rounded-xl text-[12px] text-white/70 outline-none focus:border-white/20 [color-scheme:dark]"
          />
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMonthCursor(c => c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 })}
            className="p-1.5 rounded-lg border border-white/[0.07] text-white/40 hover:text-white/70"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="text-[13px] font-semibold text-white/80 min-w-[110px] text-center">
            {MONTHS[monthCursor.month]} {monthCursor.year + 543}
          </span>
          <button
            onClick={() => setMonthCursor(c => c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 })}
            className="p-1.5 rounded-lg border border-white/[0.07] text-white/40 hover:text-white/70"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      <Legend />

      {viewMode === 'month' && (
        <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-3">
          <MonthGrid
            year={monthCursor.year}
            month={monthCursor.month}
            events={monthEvents}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
          />
        </div>
      )}

      <div className="bg-[#13161e] border border-white/[0.07] rounded-xl overflow-hidden" style={{ borderLeft: '3px solid #4B9EF5' }}>
        {viewMode === 'month' && (
          <div className="px-3 py-2 border-b border-white/[0.06] text-[12px] text-white/40">
            เหตุการณ์วันที่ {isoToThaiLabel(selectedDate)}
          </div>
        )}
        {loading && viewMode === 'week' ? (
          <TableSkeleton rows={8} />
        ) : error ? (
          <div className="py-16 text-center space-y-3">
            <p className="text-[13px] text-white/30">ไม่สามารถโหลดข้อมูลได้</p>
            <button
              onClick={() => loadCA(rangeFrom, rangeTo)}
              className="px-4 py-1.5 rounded-lg text-[12px] border border-white/10 text-white/50 hover:text-white/80 transition-colors"
            >
              ลองอีกครั้ง
            </button>
          </div>
        ) : selectedDayEvents.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-[13px] text-white/30">
              {eventFilter === 'NEW' && capState === 'missing' ? 'ยังไม่มีข้อมูลหุ้นใหม่เข้า' : 'ไม่พบเหตุการณ์ที่ตรงกับตัวกรอง'}
            </p>
          </div>
        ) : (
          <div>
            {selectedDayEvents.map(e => <EventRow key={e.key} event={e} />)}
          </div>
        )}
      </div>

      <p className="text-[10px] text-white/20 text-right">
        แหล่งข้อมูล: SET (ผ่าน Settrade) + ประกาศ SET (เพิ่มทุน/PP{capFile?.generated_at ? ` · ${capFile.generated_at.slice(0, 16).replace('T', ' ')}` : ''}) + earnings feed · {filteredEvents.length} รายการ
      </p>
    </div>
  );
}
