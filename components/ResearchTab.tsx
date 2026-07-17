'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import TableSkeleton from '@/components/TableSkeleton';
import { classifyRating, RATING_BUCKET_STYLE, IAA_SOURCE_NAME } from '@/lib/researchRating';

interface ResearchItem {
  title: string;
  link: string;
  pubDate: string;
  ts: number;
  source: string;
  tickers: string[];
  broker: string | null;
  targetPrice: number | null;
  rating: string | null;
  companyName?: string | null;
  fileUrl?: string | null;
}

const PAGE_SIZE = 20;

const SOURCE_STYLE: Record<string, string> = {
  Kaohoon: 'bg-[#FAEEDA] text-[#633806]',
  'มิติหุ้น': 'bg-[#EAF3DE] text-[#27500A]',
  [IAA_SOURCE_NAME]: 'bg-[#E5EDFB] text-[#1A4A8A]',
};
const sourceCls = (s: string) => SOURCE_STYLE[s] ?? 'bg-white/[0.07] text-white/50';

function localDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-CA');
}

function postTime(ts: number): string {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  if (mins < 1) return 'เมื่อสักครู่';
  if (mins < 60) return `เมื่อ ${mins} นาที`;
  if (hrs < 24) return `เมื่อ ${hrs} ชม.`;
  return (
    new Date(ts).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' น.'
  );
}

function pageList(cur: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);
  const out: (number | '…')[] = [0];
  if (cur > 2) out.push('…');
  for (let i = Math.max(1, cur - 1); i <= Math.min(total - 2, cur + 1); i++) out.push(i);
  if (cur < total - 3) out.push('…');
  out.push(total - 1);
  return out;
}

// Same filter-bar / pagination shape as app/news/page.tsx's news tab, adapted
// for research-specific fields (broker instead of source-only filtering,
// target price + rating badges). Items where parsing found nothing (no
// broker/target/rating) still render — just as a plain headline card, same
// as a regular news item — per the "never drop on parse failure" rule.
export default function ResearchTab({ initialTicker = '' }: { initialTicker?: string }) {
  const [items, setItems] = useState<ResearchItem[] | null>(null);
  const [error, setError] = useState(false);

  const [selectedBrokers, setSelectedBrokers] = useState<string[]>([]);
  const [tickerInput, setTickerInput] = useState(initialTicker);
  const [tickerFilter, setTickerFilter] = useState(initialTicker);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const today = useMemo(() => new Date().toLocaleDateString('en-CA'), []);
  const minDate = useMemo(() => new Date(Date.now() - 6 * 86400000).toLocaleDateString('en-CA'), []);
  const [selectedDate, setSelectedDate] = useState(today);
  const [page, setPage] = useState(0);

  const tickerBoxRef = useRef<HTMLDivElement>(null);
  const dateAutoSet = useRef(false);

  useEffect(() => {
    let active = true;
    fetch('/api/research/all')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(d => {
        if (!active) return;
        const list: ResearchItem[] = d.research ?? [];
        setItems(list);
        // Broker research only publishes on trading days, unlike general
        // news — defaulting to "today" leaves the tab looking broken (empty)
        // on weekends/holidays or before the day's batch is out. Jump to the
        // newest date that actually has data instead, once, on first load.
        if (!dateAutoSet.current && list.length > 0) {
          dateAutoSet.current = true;
          // If we landed here filtered to a specific ticker (from a stock
          // page's "ดูทั้งหมด" link), base the date on that ticker's newest
          // item, not the feed's newest overall — otherwise the two filters
          // can fight and still show empty.
          const tk = initialTicker.trim().toUpperCase();
          const relevant = tk ? list.filter(it => it.tickers.includes(tk)) : list;
          const basis = relevant.length > 0 ? relevant : list;
          setSelectedDate(localDate(basis[0].ts));
        }
      })
      .catch(() => {
        if (active) {
          setItems([]);
          setError(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (tickerBoxRef.current && !tickerBoxRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  useEffect(() => {
    setPage(0);
  }, [selectedBrokers, tickerFilter, selectedDate]);

  const brokers = useMemo(() => {
    if (!items) return [];
    const seen: string[] = [];
    for (const it of items) if (it.broker && !seen.includes(it.broker)) seen.push(it.broker);
    return seen;
  }, [items]);

  const tickerOptions = useMemo(() => {
    if (!items) return [];
    const set = new Set<string>();
    for (const it of items) for (const t of it.tickers) set.add(t);
    return [...set].sort();
  }, [items]);

  const suggestions = useMemo(() => {
    const q = tickerInput.trim().toUpperCase();
    if (!q) return tickerOptions.slice(0, 8);
    return tickerOptions.filter(t => t.includes(q)).slice(0, 8);
  }, [tickerInput, tickerOptions]);

  const filtered = useMemo(() => {
    if (!items) return [];
    return items.filter(it => {
      if (localDate(it.ts) !== selectedDate) return false;
      if (selectedBrokers.length && (!it.broker || !selectedBrokers.includes(it.broker))) return false;
      if (tickerFilter && !it.tickers.includes(tickerFilter)) return false;
      return true;
    });
  }, [items, selectedDate, selectedBrokers, tickerFilter]);

  // Quick-glance summary: today's items with both broker+rating resolved
  // (mostly IAA, which guarantees both - Kaohoon/มิติหุ้น only sometimes do)
  // bucketed into buy/neutral/sell.
  const todaySummary = useMemo(() => {
    if (!items) return null;
    const counts = { buy: 0, neutral: 0, sell: 0 };
    let any = false;
    for (const it of items) {
      if (localDate(it.ts) !== today || !it.broker || !it.rating) continue;
      any = true;
      counts[classifyRating(it.rating)]++;
    }
    return any ? counts : null;
  }, [items, today]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  function toggleBroker(b: string) {
    setSelectedBrokers(prev => (prev.includes(b) ? prev.filter(x => x !== b) : [...prev, b]));
  }
  function commitTicker(t: string) {
    setTickerFilter(t);
    setTickerInput(t);
    setDropdownOpen(false);
  }
  function clearTicker() {
    setTickerFilter('');
    setTickerInput('');
    setDropdownOpen(false);
  }

  return (
    <>
      {/* ── Filter bar ── */}
      <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-3 md:p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-label uppercase tracking-wider text-meta mr-1">โบรกเกอร์</span>
          <button
            onClick={() => setSelectedBrokers([])}
            className={`px-2.5 py-1 rounded-lg text-label font-medium transition-colors ${
              selectedBrokers.length === 0 ? 'bg-white/15 text-white' : 'bg-white/[0.04] text-meta hover:text-white/70'
            }`}
          >
            ทั้งหมด
          </button>
          {brokers.map(b => {
            const on = selectedBrokers.includes(b);
            return (
              <button
                key={b}
                onClick={() => toggleBroker(b)}
                className={`px-2.5 py-1 rounded-lg text-label font-medium transition-colors ${
                  on ? 'bg-[#7F77DD]/20 text-[#7F77DD]' : 'bg-white/[0.04] text-meta hover:text-white/70'
                }`}
              >
                {b}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div ref={tickerBoxRef} className="relative flex-1 min-w-0">
            <label className="text-label uppercase tracking-wider text-meta block mb-1">หุ้นที่เกี่ยวข้อง</label>
            <div className="flex items-center gap-2">
              <input
                value={tickerInput}
                onChange={e => {
                  setTickerInput(e.target.value);
                  setDropdownOpen(true);
                }}
                onFocus={() => setDropdownOpen(true)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const up = tickerInput.trim().toUpperCase();
                    if (tickerOptions.includes(up)) commitTicker(up);
                    else if (suggestions.length === 1) commitTicker(suggestions[0]);
                  }
                }}
                placeholder="พิมพ์ ticker เช่น DELTA"
                className="flex-1 min-w-0 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-label text-white placeholder:text-meta focus:outline-none focus:border-white/20"
              />
              {tickerFilter && (
                <button onClick={clearTicker} className="flex-shrink-0 text-label text-meta hover:text-white/70 px-2 py-1">
                  ล้าง ✕
                </button>
              )}
            </div>
            {dropdownOpen && suggestions.length > 0 && (
              <div className="absolute z-20 mt-1 left-0 right-0 max-h-56 overflow-y-auto bg-[#1a1e28] border border-white/[0.1] rounded-lg shadow-xl">
                {suggestions.map(t => (
                  <button
                    key={t}
                    onClick={() => commitTicker(t)}
                    className="block w-full text-left px-3 py-2 text-label text-white/70 hover:bg-white/[0.06] hover:text-white"
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="sm:w-44 flex-shrink-0">
            <label className="text-label uppercase tracking-wider text-meta block mb-1">วันที่</label>
            <input
              type="date"
              value={selectedDate}
              min={minDate}
              max={today}
              onChange={e => setSelectedDate(e.target.value || today)}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-label text-white focus:outline-none focus:border-white/20 [color-scheme:dark]"
            />
          </div>
        </div>
      </div>

      {/* ── Today's rating summary ── */}
      {todaySummary && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-[#13161e] border border-white/[0.07] text-label">
          <span className="text-meta">วันนี้</span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#1D9E75]" />
            <span className="text-white/70">Buy {todaySummary.buy}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
            <span className="text-white/70">Neutral {todaySummary.neutral}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#E24B4A]" />
            <span className="text-white/70">Sell {todaySummary.sell}</span>
          </span>
        </div>
      )}

      {/* ── Results ── */}
      <div className="flex items-center justify-between px-1">
        <span className="text-label text-meta">
          {items === null ? 'กำลังโหลด…' : `${filtered.length} บทวิเคราะห์`}
          {tickerFilter && ` · กรอง ${tickerFilter}`}
        </span>
        {totalPages > 1 && <span className="text-label text-meta">หน้า {page + 1}/{totalPages}</span>}
      </div>

      <div className="bg-[#13161e] border border-white/[0.07] rounded-xl overflow-hidden">
        {items === null ? (
          <TableSkeleton rows={10} />
        ) : pageItems.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-label text-meta">
              {error ? 'โหลดบทวิเคราะห์ไม่สำเร็จ ลองใหม่อีกครั้ง' : 'ไม่พบบทวิเคราะห์ตามเงื่อนไขที่เลือก'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {pageItems.map((item, i) => (
              <div key={(item.link || '') + i} className="px-5 py-4">
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-label text-white/85 leading-snug hover:text-[#5B9BD5] transition-colors"
                >
                  {item.title}
                </a>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <span className={`text-label font-semibold px-1.5 py-0.5 rounded ${sourceCls(item.source)}`}>
                    {item.source}
                  </span>
                  {item.broker && (
                    <span className="text-label font-bold px-1.5 py-0.5 rounded bg-[#7F77DD]/15 text-[#7F77DD] ring-1 ring-[#7F77DD]/30">
                      {item.broker}
                    </span>
                  )}
                  {item.tickers.map(t => (
                    <button
                      key={t}
                      onClick={() => commitTicker(t)}
                      className={`text-label font-bold px-1.5 py-0.5 rounded ring-1 transition-colors ${
                        tickerFilter === t
                          ? 'bg-[#5B9BD5] text-white ring-[#5B9BD5]'
                          : 'bg-[#5B9BD5]/15 text-[#8FC1EA] ring-[#5B9BD5]/30 hover:bg-[#5B9BD5]/25 hover:text-white'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                  {item.rating && (
                    <span className={`text-label font-bold px-1.5 py-0.5 rounded ${RATING_BUCKET_STYLE[classifyRating(item.rating)]}`}>
                      {item.rating}
                    </span>
                  )}
                  {item.targetPrice != null && (
                    <span className="text-label font-semibold px-1.5 py-0.5 rounded bg-white/[0.06] text-white/60">
                      เป้า {item.targetPrice} บาท
                    </span>
                  )}
                  {item.fileUrl && (
                    <a
                      href={item.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="text-label font-semibold px-1.5 py-0.5 rounded bg-white/[0.06] text-white/50 hover:text-white hover:bg-white/[0.1] transition-colors"
                    >
                      PDF
                    </a>
                  )}
                  <span className="text-label text-meta ml-auto">{postTime(item.ts)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 pt-1">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-2.5 py-1.5 rounded-lg text-label text-white/50 hover:text-white hover:bg-white/[0.06] disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            ‹
          </button>
          {pageList(page, totalPages).map((p, idx) =>
            p === '…' ? (
              <span key={`e${idx}`} className="px-1 text-label text-meta">…</span>
            ) : (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`min-w-[32px] px-2 py-1.5 rounded-lg text-label transition-colors ${
                  p === page ? 'bg-white/15 text-white font-semibold' : 'text-white/50 hover:text-white hover:bg-white/[0.06]'
                }`}
              >
                {p + 1}
              </button>
            )
          )}
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page === totalPages - 1}
            className="px-2.5 py-1.5 rounded-lg text-label text-white/50 hover:text-white hover:bg-white/[0.06] disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            ›
          </button>
        </div>
      )}
    </>
  );
}
