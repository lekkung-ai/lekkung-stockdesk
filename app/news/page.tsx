'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import TableSkeleton from '@/components/TableSkeleton';
import ResearchTab from '@/components/ResearchTab';
import NewsCard from '@/components/NewsCard';
import { newsSourceCls } from '@/lib/newsSourceStyle';

interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  ts: number;
  source: string;
  tickers: string[];
  sentiment: 'pos' | 'neg' | 'neu';
  stale?: boolean;
}

const PAGE_SIZE = 20;

// ── helpers ──────────────────────────────────────────────────────────────────
function localDate(ts: number): string {
  // YYYY-MM-DD in the viewer's local timezone
  return new Date(ts).toLocaleDateString('en-CA');
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

function NewsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get('tab');
  const initialResearchTicker = searchParams.get('ticker') ?? '';

  const [activeTab, setActiveTab] = useState<'set' | 'news' | 'research'>(() =>
    rawTab === 'set' ? 'set' : rawTab === 'research' ? 'research' : 'news'
  );

  useEffect(() => {
    const targetTab = rawTab === 'set' ? 'set' : rawTab === 'research' ? 'research' : 'news';
    setActiveTab(targetTab);
  }, [rawTab]);

  function switchTab(next: 'set' | 'news' | 'research') {
    setActiveTab(next);
    setSelectedSources([]);
    setTickerFilter('');
    setTickerInput('');
    setPage(0);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', next);
    if (next !== 'research') params.delete('ticker');
    router.push(`/news?${params.toString()}`);
  }

  const [allNews, setAllNews] = useState<NewsItem[] | null>(null);
  const [error, setError] = useState(false);
  const [staleSources, setStaleSources] = useState<string[]>([]);

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
  const dateAutoSet = useRef(false);

  useEffect(() => {
    let active = true;
    // Pre-fetch research data in background so tab switching is instant
    fetch('/api/research/all').catch(() => {});

    fetch('/api/news/all')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(d => {
        if (active) {
          const list: NewsItem[] = d.news ?? [];
          setAllNews(list);
          setStaleSources(d.staleSources ?? []);

          if (!dateAutoSet.current && list.length > 0) {
            dateAutoSet.current = true;
            const counts = new Map<string, number>();
            for (const n of list) {
              const dateStr = localDate(n.ts);
              counts.set(dateStr, (counts.get(dateStr) ?? 0) + 1);
            }
            let latestDate = '';
            for (const dStr of counts.keys()) {
              if (dStr > latestDate) latestDate = dStr;
            }
            if (latestDate) setSelectedDate(latestDate);
          }
        }
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

  // Auto-adjust selectedDate when switching activeTab if selectedDate has no items for the tab
  useEffect(() => {
    if (!allNews || allNews.length === 0 || activeTab === 'research') return;

    const isSetTab = activeTab === 'set';
    const relevant = allNews.filter(n => {
      const isSet = n.source === 'SET (ตลาดหลักทรัพย์)' || n.link.includes('set.or.th');
      return isSetTab ? isSet : !isSet;
    });

    if (relevant.length === 0) return;

    const hasItemsOnSelected = relevant.some(n => localDate(n.ts) === selectedDate);
    if (!hasItemsOnSelected) {
      const counts = new Map<string, number>();
      for (const n of relevant) {
        const dStr = localDate(n.ts);
        counts.set(dStr, (counts.get(dStr) ?? 0) + 1);
      }
      let bestDate = localDate(relevant[0].ts);
      let bestCount = 0;
      for (const [dStr, cnt] of counts) {
        if (cnt > bestCount || (cnt === bestCount && dStr > bestDate)) {
          bestDate = dStr;
          bestCount = cnt;
        }
      }
      setSelectedDate(bestDate);
    }
  }, [allNews, activeTab, selectedDate]);

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
    for (const n of allNews) {
      if (activeTab === 'news' && (n.source === 'SET (ตลาดหลักทรัพย์)' || n.link.includes('set.or.th'))) continue;
      if (!seen.includes(n.source)) seen.push(n.source);
    }
    return seen;
  }, [allNews, activeTab]);

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
      const isSet = n.source === 'SET (ตลาดหลักทรัพย์)' || n.link.includes('set.or.th');
      if (activeTab === 'set' && !isSet) return false;
      if (activeTab === 'news' && isSet) return false;
      if (selectedSources.length && !selectedSources.includes(n.source)) return false;
      if (tickerFilter && !n.tickers.includes(tickerFilter)) return false;
      return true;
    });
  }, [allNews, selectedDate, selectedSources, tickerFilter, activeTab]);

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

  const sentimentSummary = useMemo(() => {
    if (!allNews) return null;
    const todayNews = allNews.filter(n => localDate(n.ts) === selectedDate);
    if (todayNews.length === 0) return null;
    let pos = 0, neg = 0, neu = 0;
    for (const n of todayNews) {
      if (n.sentiment === 'pos') pos++;
      else if (n.sentiment === 'neg') neg++;
      else neu++;
    }
    const total = todayNews.length;
    return {
      pos,
      neg,
      neu,
      total,
      posPct: Math.round((pos / total) * 100),
      negPct: Math.round((neg / total) * 100),
      neuPct: Math.round((neu / total) * 100),
    };
  }, [allNews, selectedDate]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-[18px] font-bold text-white">ข่าว & บทวิเคราะห์</h1>
        <p className="text-[12px] text-white/35 mt-0.5">
          {activeTab === 'set'
            ? 'ข่าวและประกาศแจ้งตลาดอย่างเป็นทางการจาก set.or.th'
            : activeTab === 'news'
            ? 'รวมข่าวหุ้นและการเงินจากหลายสำนักข่าว · กรองตามแหล่ง หุ้น และวันที่'
            : 'บทวิเคราะห์จากโบรกเกอร์ · กรองตามโบรก คำแนะนำ และวันที่'}
        </p>
      </div>

      {/* ── 3 Tab bar ── */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => switchTab('news')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold transition-colors ${
            activeTab === 'news'
              ? 'bg-[#1D9E75]/20 text-[#1D9E75] border border-[#1D9E75]/40 font-bold'
              : 'bg-white/[0.03] text-white/40 hover:text-white/70'
          }`}
        >
          📰 ข่าวทั่วไป (สื่อการเงิน)
        </button>
        <button
          onClick={() => switchTab('set')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold transition-colors ${
            activeTab === 'set'
              ? 'bg-[#3B82F6]/20 text-[#60A5FA] border border-[#3B82F6]/40 font-bold'
              : 'bg-white/[0.03] text-white/40 hover:text-white/70'
          }`}
        >
          📢 ข่าวแจ้งตลาด (set.or.th)
        </button>
        <button
          onClick={() => switchTab('research')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold transition-colors ${
            activeTab === 'research'
              ? 'bg-[#7F77DD]/20 text-[#7F77DD] border border-[#7F77DD]/40 font-bold'
              : 'bg-white/[0.03] text-white/40 hover:text-white/70'
          }`}
        >
          📊 บทวิเคราะห์ (โบรกเกอร์)
        </button>
      </div>

      {activeTab === 'research' ? (
        <ResearchTab initialTicker={initialResearchTicker} />
      ) : (
        <>
      {/* ── Daily Sentiment Summary Bar ── */}
      {sentimentSummary && (
        <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#1D9E75] animate-pulse" />
              <span className="text-label font-bold text-white">บรรยากาศข่าวประจำวัน:</span>
            </div>
            <span className={`px-2.5 py-0.5 rounded text-label font-bold ${
              sentimentSummary.posPct >= 50
                ? 'bg-[#1D9E75]/20 text-[#1D9E75] border border-[#1D9E75]/40'
                : sentimentSummary.negPct >= 30
                ? 'bg-[#E24B4A]/20 text-[#E24B4A] border border-[#E24B4A]/40'
                : 'bg-white/10 text-white/70'
            }`}>
              {sentimentSummary.posPct >= 50 ? '🟢 บรรยากาศเป็นบวก' : sentimentSummary.negPct >= 30 ? '🔴 บรรยากาศระมัดระวัง' : '⚪ บรรยากาศทรงตัว'}
            </span>
          </div>

          <div className="flex items-center gap-4 text-label">
            <div className="flex items-center gap-3 tabular-nums">
              <span className="text-[#1D9E75] font-semibold">บวก {sentimentSummary.posPct}% ({sentimentSummary.pos})</span>
              <span className="text-meta">|</span>
              <span className="text-[#E24B4A] font-semibold">ลบ {sentimentSummary.negPct}% ({sentimentSummary.neg})</span>
              <span className="text-meta">|</span>
              <span className="text-white/60">กลาง {sentimentSummary.neuPct}% ({sentimentSummary.neu})</span>
            </div>
          </div>
        </div>
      )}

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
            const isStale = staleSources.includes(s);
            return (
              <button
                key={s}
                onClick={() => toggleSource(s)}
                title={isStale ? `${s} — fetch สดล้มเหลว กำลังแสดงข่าวเก่าจาก archive แทน` : undefined}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-label font-medium transition-colors ${
                  on ? newsSourceCls(s) : 'bg-white/[0.04] text-meta hover:text-white/70'
                }`}
              >
                {s}
                {isStale && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#EF9F27] flex-shrink-0" aria-hidden="true" />
                )}
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
              <NewsCard
                key={(item.link || '') + i}
                item={item}
                tickerFilter={tickerFilter}
                onTickerClick={commitTicker}
              />
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
        </>
      )}
    </div>
  );
}

function NewsPageSkeleton() {
  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="h-6 w-48 rounded bg-white/[0.06] animate-pulse" />
      <div className="h-9 w-40 rounded-lg bg-white/[0.04] animate-pulse" />
      <div className="bg-[#13161e] border border-white/[0.07] rounded-xl overflow-hidden">
        <TableSkeleton rows={10} />
      </div>
    </div>
  );
}

export default function NewsPage() {
  return (
    <Suspense fallback={<NewsPageSkeleton />}>
      <NewsPageContent />
    </Suspense>
  );
}
