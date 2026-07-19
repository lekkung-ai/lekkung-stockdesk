'use client';

import { useState, useEffect, useRef, useCallback, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Clock, X } from 'lucide-react';
import { newsBySymbol } from '@/lib/mockData';
import { stockNames } from '@/lib/stockNames';
import { ALL_SET_TICKERS, SECTOR_INFO } from '@/lib/setTickers';

const RECENT_KEY = 'sd_recent';

function fuzzySearch(query: string, limit = 8): string[] {
  const q = query.toUpperCase();
  const startsWith: string[] = [];
  const contains: string[] = [];
  for (const t of ALL_SET_TICKERS) {
    if (startsWith.length >= limit) break;
    if (t.startsWith(q)) startsWith.push(t);
    else if (t.includes(q) && contains.length < limit) contains.push(t);
  }
  return [...startsWith, ...contains].slice(0, limit);
}

const sentBadge = (sent: string) => {
  if (sent === 'pos') return { label: 'Positive', cls: 'bg-[#EAF3DE] text-[#27500A]' };
  if (sent === 'neg') return { label: 'Negative', cls: 'bg-[#FCEBEB] text-[#791F1F]' };
  return { label: 'Neutral', cls: 'bg-white/[0.08] text-white/45' };
};

export default function SearchBox() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      setRecent(JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').slice(0, 5));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === 'Escape') {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const onClickOut = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOut);
    return () => document.removeEventListener('mousedown', onClickOut);
  }, []);

  const results = query.trim() ? fuzzySearch(query) : [];
  const topTicker = results[0];
  const topNews = topTicker ? (newsBySymbol[topTicker] ?? []).slice(0, 3) : [];

  // Reset keyboard selection whenever the candidate list changes, so an old
  // highlight doesn't point at a since-shifted row.
  useEffect(() => {
    setActiveIndex(-1);
  }, [query]);

  const handleSelect = useCallback(
    (ticker: string) => {
      const updated = [ticker, ...recent.filter(s => s !== ticker)].slice(0, 5);
      setRecent(updated);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
      } catch { /* ignore */ }
      setQuery('');
      setOpen(false);
      router.push(`/stock/${ticker}`);
    },
    [recent, router]
  );

  const handleInputKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLInputElement>) => {
      const list = query.trim() ? results : recent;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (list.length === 0) return;
        setOpen(true);
        setActiveIndex(prev => (prev + 1) % list.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (list.length === 0) return;
        setOpen(true);
        setActiveIndex(prev => (prev - 1 + list.length) % list.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (list.length === 0) return;
        // Highlighted row wins; otherwise an exact ticker match; otherwise
        // just go to the top result — matches how the dropdown is displayed.
        if (activeIndex >= 0 && activeIndex < list.length) {
          handleSelect(list[activeIndex]);
          return;
        }
        const exact = query.trim().toUpperCase();
        if (query.trim() && list.includes(exact)) {
          handleSelect(exact);
          return;
        }
        handleSelect(list[0]);
      } else if (e.key === 'Escape') {
        setOpen(false);
        inputRef.current?.blur();
      }
    },
    [query, results, recent, activeIndex, handleSelect]
  );

  return (
    <div ref={wrapperRef} className="relative w-full max-w-lg">
      <div
        className={`flex items-center gap-2 px-3 py-2 bg-white/[0.06] border rounded-xl transition-colors ${
          open ? 'border-white/25' : 'border-white/[0.09]'
        }`}
      >
        <Search size={14} className="text-white/35 flex-shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleInputKeyDown}
          role="combobox"
          aria-expanded={open}
          aria-controls="search-listbox"
          aria-activedescendant={activeIndex >= 0 ? `search-option-${activeIndex}` : undefined}
          placeholder="ค้นหา ticker เช่น KBANK, DELTA..."
          className="flex-1 bg-transparent text-[13px] text-white/90 placeholder:text-white/28 outline-none min-w-0"
        />
        {query && (
          <button onClick={() => setQuery('')} className="text-white/30 hover:text-white/60 flex-shrink-0 transition-colors">
            <X size={13} />
          </button>
        )}
        {/* Keyboard shortcut hint is meaningless on touch devices (no physical
            keyboard) — show only when the primary pointer is fine (mouse/trackpad). */}
        <kbd className="hidden [@media(pointer:fine)]:block text-[10px] text-white/20 font-mono flex-shrink-0 px-1.5 py-0.5 border border-white/[0.1] rounded">
          ⌘K
        </kbd>
      </div>

      {open && (
        <div id="search-listbox" role="listbox" className="absolute top-full mt-2 left-0 right-0 z-50 bg-[#13161e] border border-white/[0.1] rounded-xl shadow-2xl overflow-hidden max-h-[70vh] overflow-y-auto">

          {/* Recent searches */}
          {!query.trim() && (
            <div className="p-2">
              {recent.length > 0 ? (
                <>
                  <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/25">
                    ดูล่าสุด
                  </p>
                  {recent.map((sym, i) => {
                    const sec = SECTOR_INFO[sym];
                    return (
                      <button
                        key={sym}
                        id={`search-option-${i}`}
                        role="option"
                        aria-selected={activeIndex === i}
                        onClick={() => handleSelect(sym)}
                        onMouseEnter={() => setActiveIndex(i)}
                        className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left transition-colors ${
                          activeIndex === i ? 'bg-white/[0.08]' : 'hover:bg-white/[0.05]'
                        }`}
                      >
                        <Clock size={12} className="text-white/25 flex-shrink-0" />
                        <span className="text-[13px] font-semibold text-white">{sym}</span>
                        {stockNames[sym] && (
                          <span className="text-[12px] text-white/35 truncate">{stockNames[sym]}</span>
                        )}
                        {sec && (
                          <span className="text-[11px] text-white/20 ml-auto flex-shrink-0">{sec.sector}</span>
                        )}
                      </button>
                    );
                  })}
                </>
              ) : (
                <p className="px-3 py-5 text-center text-[12px] text-white/25">
                  พิมพ์ ticker เพื่อค้นหา หรือกด ⌘K
                </p>
              )}
            </div>
          )}

          {/* Search results */}
          {query.trim() && results.length > 0 && (
            <div className="p-2">
              {results.map((ticker, i) => {
                const sec = SECTOR_INFO[ticker];
                const name = stockNames[ticker];
                return (
                  <button
                    key={ticker}
                    id={`search-option-${i}`}
                    role="option"
                    aria-selected={activeIndex === i}
                    onClick={() => handleSelect(ticker)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={`w-full flex items-center gap-3 px-2 py-2.5 rounded-lg text-left transition-colors ${
                      activeIndex === i ? 'bg-white/[0.08]' : 'hover:bg-white/[0.05]'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-white/[0.07] flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-white/45">
                      {ticker.slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[13px] font-semibold text-white">{ticker}</span>
                        {name && <span className="text-[11px] text-white/40 truncate">{name}</span>}
                      </div>
                      {sec && (
                        <div className="text-[11px] text-white/25 mt-0.5">
                          {sec.sector}
                          {sec.subsector && ` · ${sec.subsector}`}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}

              {topNews.length > 0 && (
                <div className="mt-1 pt-2 border-t border-white/[0.06]">
                  <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-white/25">
                    ข่าวล่าสุด — {topTicker}
                  </p>
                  {topNews.map(news => {
                    const badge = sentBadge(news.sent);
                    return (
                      <div key={news.id} className="px-2 py-2 rounded-lg hover:bg-white/[0.04]">
                        <div className="flex items-start gap-2">
                          <span className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded ${badge.cls}`}>
                            {badge.label}
                          </span>
                          <p className="text-[12px] text-white/65 leading-snug line-clamp-2">{news.title}</p>
                        </div>
                        <div className="flex gap-2 mt-1 text-[11px] text-white/30">
                          <span>{news.source}</span>
                          <span>·</span>
                          <span>{news.time}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* No results */}
          {query.trim() && results.length === 0 && (
            <p className="px-3 py-6 text-center text-[12px] text-white/25">
              ไม่พบหุ้น &ldquo;{query}&rdquo; ในระบบ
            </p>
          )}
        </div>
      )}
    </div>
  );
}
