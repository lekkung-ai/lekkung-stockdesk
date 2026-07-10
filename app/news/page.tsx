'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import TableSkeleton from '@/components/TableSkeleton';

interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  ts: number;
  source: string;
  tickers: string[];
  sentiment: 'pos' | 'neg' | 'neu';
}

const PAGE_SIZE = 20;

// Per-source badge colours (unknown sources fall back to grey).
const SOURCE_STYLE: Record<string, string> = {
  InfoQuest: 'bg-[#E6F1FB] text-[#0C447C]',
  'ข่าวหุ้น': 'bg-[#FAEEDA] text-[#633806]',
  'ข่าวหุ้น (ด่วน)': 'bg-[#FAEEDA] text-[#633806]',
  'ข่าวหุ้น (ทั่วไป)': 'bg-[#FAEEDA] text-[#633806]',
  'RYT9 (SET)': 'bg-[#F2EDF9] text-[#4F2D7F]',
  'RYT9 (หุ้น)': 'bg-[#F2EDF9] text-[#4F2D7F]',
  'กรุงเทพธุรกิจ': 'bg-[#EAF3DE] text-[#27500A]',
  'มิติหุ้น': 'bg-[#EAF3DE] text-[#27500A]',
  'หุ้นสมาร์ท': 'bg-[#FBE8E8] text-[#8A1A1A]',
  'Share2Trade': 'bg-[#F3E8FB] text-[#5B2A86]',
  'Wealthy Thai': 'bg-[#FCEBEB] text-[#791F1F]',
  'ประชาชาติธุรกิจ': 'bg-[#EAF3DE] text-[#27500A]',
  'ฐานเศรษฐกิจ': 'bg-[#E6F1FB] text-[#0C447C]',
  'มติชน': 'bg-[#DFF3EE] text-[#0F5C4C]',
  'Investing.com': 'bg-[#E5EDFB] text-[#1A4A8A]',
  'RYT9 (IPO)': 'bg-[#F2EDF9] text-[#4F2D7F]',
};
const sourceCls = (s: string) => SOURCE_STYLE[s] ?? 'bg-white/[0.07] text-white/50';

// ── helpers ──────────────────────────────────────────────────────────────────
function localDate(ts: number): string {
  // YYYY-MM-DD in the viewer's local timezone
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
    new Date(ts).toLocaleString('th-TH', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }) + ' น.'
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

export default function NewsPage() {
  const [allNews, setAllNews] = useState<NewsItem[] | null>(null);
  const [error, setError] = useState(false);

  // filters
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [tickerInput, setTickerInput] = useState('');
  const [tickerFilter, setTickerFilter] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const today = useMemo(() => new Date().toLocaleDateString('en-CA'), []);
  const minDate = useMemo(
    () => new Date(Date.now() - 6 * 86400000).toLocaleDateString('en-CA'),
    []
  );
  const [selectedDate, setSelectedDate] = useState(today);
  const [page, setPage] = useState(0);

  const tickerBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/news/all')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(d => {
        if (active) setAllNews(d.news ?? []);
      })
      .catch(() => {
        if (active) {
          setAllNews([]);
          setError(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  // close ticker dropdown on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (tickerBoxRef.current && !tickerBoxRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // reset to first page whenever a filter changes
  useEffect(() => {
    setPage(0);
  }, [selectedSources, tickerFilter, selectedDate]);

  // distinct sources present in the data (for the chip bar)
  const sources = useMemo(() => {
    if (!allNews) return [];
    const seen: string[] = [];
    for (const n of allNews) if (!seen.includes(n.source)) seen.push(n.source);
    return seen;
  }, [allNews]);

  // tickers present in the data (for the search dropdown)
  const tickerOptions = useMemo(() => {
    if (!allNews) return [];
    const set = new Set<string>();
    for (const n of allNews) for (const t of n.tickers) set.add(t);
    return [...set].sort();
  }, [allNews]);

  const suggestions = useMemo(() => {
    const q = tickerInput.trim().toUpperCase();
    if (!q) return tickerOptions.slice(0, 8);
    return tickerOptions.filter(t => t.includes(q)).slice(0, 8);
  }, [tickerInput, tickerOptions]);

  const filtered = useMemo(() => {
    if (!allNews) return [];
    return allNews.filter(n => {
      if (localDate(n.ts) !== selectedDate) return false;
      if (selectedSources.length && !selectedSources.includes(n.source)) return false;
      if (tickerFilter && !n.tickers.includes(tickerFilter)) return false;
      return true;
    });
  }, [allNews, selectedDate, selectedSources, tickerFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  function toggleSource(s: string) {
    setSelectedSources(prev =>
      prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
    );
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
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-[18px] font-bold text-white">ข่าวตลาด</h1>
        <p className="text-[12px] text-white/35 mt-0.5">
          รวมข่าวล่าสุดจากหลายแหล่ง · กรองตามแหล่ง หุ้น และวันที่
        </p>
      </div>

      {/* ── Filter bar ── */}
      <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-3 md:p-4 space-y-3">
        {/* [1] sources */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-white/25 mr-1">แหล่งข่าว</span>
          <button
            onClick={() => setSelectedSources([])}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
              selectedSources.length === 0
                ? 'bg-white/15 text-white'
                : 'bg-white/[0.04] text-white/40 hover:text-white/70'
            }`}
          >
            ทั้งหมด
          </button>
          {sources.map(s => {
            const on = selectedSources.includes(s);
            return (
              <button
                key={s}
                onClick={() => toggleSource(s)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                  on ? sourceCls(s) : 'bg-white/[0.04] text-white/40 hover:text-white/70'
                }`}
              >
                {s}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          {/* [2] ticker search */}
          <div ref={tickerBoxRef} className="relative flex-1 min-w-0">
            <label className="text-[10px] uppercase tracking-wider text-white/25 block mb-1">หุ้นที่เกี่ยวข้อง</label>
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
                className="flex-1 min-w-0 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-[12px] text-white placeholder:text-white/25 focus:outline-none focus:border-white/20"
              />
              {tickerFilter && (
                <button
                  onClick={clearTicker}
                  className="flex-shrink-0 text-[11px] text-white/40 hover:text-white/70 px-2 py-1"
                >
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
                    className="block w-full text-left px-3 py-2 text-[12px] text-white/70 hover:bg-white/[0.06] hover:text-white"
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* [3] date */}
          <div className="sm:w-44 flex-shrink-0">
            <label className="text-[10px] uppercase tracking-wider text-white/25 block mb-1">วันที่</label>
            <input
              type="date"
              value={selectedDate}
              min={minDate}
              max={today}
              onChange={e => setSelectedDate(e.target.value || today)}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-[12px] text-white focus:outline-none focus:border-white/20 [color-scheme:dark]"
            />
          </div>
        </div>
      </div>

      {/* ── Results ── */}
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] text-white/30">
          {allNews === null ? 'กำลังโหลด…' : `${filtered.length} ข่าว`}
          {tickerFilter && ` · กรอง ${tickerFilter}`}
        </span>
        {totalPages > 1 && (
          <span className="text-[11px] text-white/25">หน้า {page + 1}/{totalPages}</span>
        )}
      </div>

      <div className="bg-[#13161e] border border-white/[0.07] rounded-xl overflow-hidden">
        {allNews === null ? (
          <TableSkeleton rows={10} />
        ) : pageItems.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-[13px] text-white/30">
              {error ? 'โหลดข่าวไม่สำเร็จ ลองใหม่อีกครั้ง' : 'ไม่พบข่าวตามเงื่อนไขที่เลือก'}
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
                  className="block text-[13px] text-white/85 leading-snug hover:text-[#5B9BD5] transition-colors"
                >
                  {item.title}
                </a>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${sourceCls(item.source)}`}>
                    {item.source}
                  </span>
                  {item.tickers.map(t => (
                    <button
                      key={t}
                      onClick={() => commitTicker(t)}
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ring-1 transition-colors ${
                        tickerFilter === t
                          ? 'bg-[#5B9BD5] text-white ring-[#5B9BD5]'
                          : 'bg-[#5B9BD5]/15 text-[#8FC1EA] ring-[#5B9BD5]/30 hover:bg-[#5B9BD5]/25 hover:text-white'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                  <span className="text-[11px] text-white/25 ml-auto">{postTime(item.ts)}</span>
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
            className="px-2.5 py-1.5 rounded-lg text-[12px] text-white/50 hover:text-white hover:bg-white/[0.06] disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            ‹
          </button>
          {pageList(page, totalPages).map((p, idx) =>
            p === '…' ? (
              <span key={`e${idx}`} className="px-1 text-[12px] text-white/25">…</span>
            ) : (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`min-w-[32px] px-2 py-1.5 rounded-lg text-[12px] transition-colors ${
                  p === page
                    ? 'bg-white/15 text-white font-semibold'
                    : 'text-white/50 hover:text-white hover:bg-white/[0.06]'
                }`}
              >
                {p + 1}
              </button>
            )
          )}
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page === totalPages - 1}
            className="px-2.5 py-1.5 rounded-lg text-[12px] text-white/50 hover:text-white hover:bg-white/[0.06] disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}
