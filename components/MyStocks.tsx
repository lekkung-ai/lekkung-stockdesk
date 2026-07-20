'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, X, Search, Star } from 'lucide-react';
import { useStock } from '@/context/stock';
import { stockNames } from '@/lib/stockNames';
import { peColor, roeColor } from '@/lib/utils';
import { loadMyStockSymbols as loadSymbols, saveMyStockSymbols } from '@/lib/myStocks';
import PriceChart from './PriceChart';

type LivePrice = { price: number; changePercent: number };

export default function MyStocks() {
  const { selectedMarket } = useStock();
  const [symbols, setSymbols] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [priceMap, setPriceMap] = useState<Record<string, LivePrice>>({});
  const [hydrated, setHydrated] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Hydrate from localStorage on mount (client-only to avoid SSR mismatch).
  useEffect(() => {
    const stored = loadSymbols();
    setSymbols(stored);
    if (stored.length > 0) setSelected(stored[0]);
    setHydrated(true);
  }, []);

  // Persist whenever the list changes — but only after the initial load, so the
  // empty starting value doesn't overwrite the stored list on remount.
  useEffect(() => {
    if (!hydrated) return;
    saveMyStockSymbols(symbols);
  }, [symbols, hydrated]);

  // Fetch live prices for the current list whenever it changes.
  useEffect(() => {
    if (symbols.length === 0) {
      setPriceMap({});
      return;
    }
    const qs = symbols.map(t => encodeURIComponent(t)).join(',');
    let cancelled = false;
    fetch(`/api/prices?symbols=${qs}`)
      .then(r => r.json())
      .then(json => { if (!cancelled && json.prices) setPriceMap(json.prices); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [symbols]);

  function addSymbol() {
    const sym = draft.trim().toUpperCase();
    if (!sym) return;
    if (symbols.includes(sym)) {
      setSelected(sym);
      setDraft('');
      return;
    }
    setSymbols(prev => [...prev, sym]);
    setSelected(sym);
    setDraft('');
    inputRef.current?.focus();
  }

  function removeSymbol(sym: string) {
    setSymbols(prev => {
      const next = prev.filter(s => s !== sym);
      if (selected === sym) setSelected(next[0] ?? null);
      return next;
    });
  }

  return (
    <div className="flex flex-col md:flex-row gap-5 items-start">
      {/* ── Left: manual watchlist ─────────────────────────────── */}
      <div className="w-full md:flex-1 md:min-w-0">
        <div className="bg-[#13161e] border border-white/[0.07] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/[0.07]">
            <h2 className="text-[13px] font-semibold text-white">My Stocks</h2>
            <p className="text-[11px] text-white/35 mt-0.5">
              {symbols.length === 0 ? 'ยังไม่มีหุ้น · เพิ่มหุ้นด้านล่าง' : `${symbols.length} หุ้น`}
            </p>
          </div>

          {/* Add row */}
          <div className="px-3 py-3 border-b border-white/[0.07] flex items-center gap-2">
            <div className="relative flex-1">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/25" />
              <input
                ref={inputRef}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addSymbol(); }}
                placeholder="เพิ่มหุ้น เช่น DELTA, AOT, AAPL"
                className="w-full bg-[#0b0d12] border border-white/[0.08] rounded-lg pl-8 pr-3 py-2 text-[12.5px] text-white placeholder:text-white/25 outline-none focus:border-[#1D9E75]/60 transition-colors uppercase"
              />
            </div>
            <button
              onClick={addSymbol}
              disabled={!draft.trim()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#1D9E75] text-white text-[12.5px] font-medium hover:bg-[#1b8e6a] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
            >
              <Plus size={14} />
              <span className="hidden sm:inline">เพิ่ม</span>
            </button>
          </div>

          {/* List */}
          {symbols.length === 0 ? (
            <div className="px-4 py-14 flex flex-col items-center text-center">
              <div className="w-11 h-11 rounded-full bg-white/[0.04] flex items-center justify-center mb-3">
                <Star size={18} className="text-white/25" />
              </div>
              <p className="text-[13px] text-white/45 font-medium">ยังไม่มีหุ้นในรายการ</p>
              <p className="text-[11.5px] text-white/25 mt-1 max-w-[220px]">
                พิมพ์ชื่อย่อหุ้นแล้วกด &quot;เพิ่ม&quot; เพื่อเริ่มสร้างรายการของคุณ
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {symbols.map(sym => (
                <WatchRow
                  key={sym}
                  sym={sym}
                  live={priceMap[sym]}
                  selected={sym === selected}
                  onSelect={() => setSelected(sym)}
                  onRemove={() => removeSymbol(sym)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Right: detail of selected stock ────────────────────── */}
      <div className="w-full md:w-[460px] lg:w-[520px] md:flex-shrink-0">
        {selected ? (
          <StockDetail symbol={selected} market={selectedMarket} />
        ) : (
          <div className="bg-[#13161e] border border-white/[0.07] rounded-xl px-4 py-16 flex flex-col items-center text-center">
            <Search size={20} className="text-white/20 mb-3" />
            <p className="text-[12.5px] text-white/40">เลือกหุ้นจากรายการเพื่อดูรายละเอียด</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Watchlist row — fetches its own fundamentals (PE / ROE / Mkt Cap) ──
type Fundamental = {
  pe: number | null;
  pb: number | null;
  roe: number | null;
  eps: number | null;
  de: number | null;
  divYield: number | null;
  marketCap: string;
};

function WatchRow({
  sym, live, selected, onSelect, onRemove,
}: {
  sym: string;
  live?: LivePrice;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const [fund, setFund] = useState<Fundamental | null | undefined>(undefined);
  const name = stockNames[sym];

  useEffect(() => {
    let cancelled = false;
    setFund(undefined);
    fetch(`/api/fundamental/${encodeURIComponent(sym)}`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(j => {
        if (!cancelled) setFund({
          pe: j.pe, pb: j.pb, roe: j.roe, eps: j.eps,
          de: j.de, divYield: j.divYield, marketCap: j.marketCap,
        });
      })
      .catch(() => { if (!cancelled) setFund(null); });
    return () => { cancelled = true; };
  }, [sym]);

  const change = live?.changePercent ?? 0;
  const isPos = change >= 0;

  return (
    <div
      className={`group flex items-center gap-3 px-4 py-3 min-h-[52px] transition-colors ${
        selected ? 'bg-white/[0.07]' : 'hover:bg-white/[0.04]'
      }`}
    >
      <button onClick={onSelect} className="flex items-center gap-3 flex-1 min-w-0 text-left">
        <div
          className={`w-0.5 h-9 rounded-full flex-shrink-0 transition-colors ${
            selected ? 'bg-[#1D9E75]' : 'bg-transparent'
          }`}
        />
        <div className="flex-1 min-w-0">
          <p className="text-[16px] font-semibold text-white">{sym}</p>
          {name && <p className="text-[12.5px] text-white/40 truncate">{name}</p>}
          {/* Fundamentals */}
          {fund === undefined ? (
            <div className="flex gap-1.5 mt-1.5">
              <div className="h-3.5 w-14 bg-white/[0.04] rounded animate-pulse" />
              <div className="h-3.5 w-14 bg-white/[0.04] rounded animate-pulse" />
              <div className="h-3.5 w-14 bg-white/[0.04] rounded animate-pulse" />
            </div>
          ) : fund ? (
            <div className="flex flex-wrap gap-x-1.5 gap-y-1 mt-1.5">
              {([
                { label: 'P/E', value: fund.pe != null ? fund.pe.toFixed(2) : '—', color: peColor(fund.pe) },
                { label: 'P/BV', value: fund.pb != null ? fund.pb.toFixed(2) : '—' },
                { label: 'EPS', value: fund.eps != null ? fund.eps.toFixed(2) : '—' },
                { label: 'ROE', value: fund.roe != null ? `${fund.roe.toFixed(1)}%` : '—', color: roeColor(fund.roe) },
                { label: 'D/E', value: fund.de != null ? fund.de.toFixed(2) : '—' },
                { label: 'Yield', value: fund.divYield != null ? `${fund.divYield.toFixed(2)}%` : '—' },
                { label: 'Mkt', value: fund.marketCap },
              ] as { label: string; value: string; color?: string }[]).map(m => (
                <span
                  key={m.label}
                  className="inline-flex items-baseline gap-1 rounded bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-white/35 tabular-nums"
                >
                  {m.label}{' '}
                  <span className="font-medium" style={{ color: m.color || 'rgba(255,255,255,0.65)' }}>
                    {m.value}
                  </span>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[10.5px] text-white/25 mt-1">ไม่มีข้อมูลพื้นฐาน</p>
          )}
        </div>
        <div className="text-right flex-shrink-0 self-start pt-0.5">
          {live ? (
            <>
              <p className="text-[16px] font-semibold text-white">{live.price.toFixed(2)}</p>
              <p className={`text-[12.5px] font-medium ${isPos ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>
                {isPos ? '+' : ''}{change.toFixed(2)}%
              </p>
            </>
          ) : (
            <div className="space-y-1">
              <div className="h-3.5 w-14 bg-white/[0.06] rounded animate-pulse ml-auto" />
              <div className="h-3 w-10 bg-white/[0.04] rounded animate-pulse ml-auto" />
            </div>
          )}
        </div>
      </button>
      <button
        onClick={onRemove}
        title={`ลบ ${sym}`}
        className="p-1.5 rounded text-white/20 hover:text-[#E24B4A] hover:bg-white/[0.05] transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 flex-shrink-0 self-start"
      >
        <X size={14} />
      </button>
    </div>
  );
}

// ── Detail panel — fetches real data for any ticker ─────────────
type QuoteData = { price: number; change1d: number; shortName: string };
type NewsItem = { title: string; link: string; source: string; pubDate: string; sentiment: 'pos' | 'neg' | 'neu' };

function sentBadge(sent: string) {
  if (sent === 'pos') return { label: 'Positive', cls: 'bg-[#EAF3DE] text-[#27500A]' };
  if (sent === 'neg') return { label: 'Negative', cls: 'bg-[#FCEBEB] text-[#791F1F]' };
  return { label: 'Neutral', cls: 'bg-white/[0.08] text-white/45' };
}

function StockDetail({ symbol, market }: { symbol: string; market: string }) {
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [quoteErr, setQuoteErr] = useState(false);
  const [news, setNews] = useState<NewsItem[]>([]);

  const fallbackName = useMemo(() => stockNames[symbol] ?? symbol, [symbol]);

  useEffect(() => {
    let cancelled = false;
    setQuote(null);
    setQuoteErr(false);
    setNews([]);

    fetch(`/api/quote/${encodeURIComponent(symbol)}`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(json => { if (!cancelled && json && typeof json.price === 'number') setQuote(json); })
      .catch(() => { if (!cancelled) setQuoteErr(true); });

    fetch(`/api/news/${encodeURIComponent(symbol)}`)
      .then(r => r.json())
      .then(json => { if (!cancelled && Array.isArray(json.news)) setNews(json.news.slice(0, 6)); })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [symbol]);

  const isPos = (quote?.change1d ?? 0) >= 0;
  const changeAmt = quote ? (quote.price * quote.change1d) / 100 : 0;

  return (
    <div className="bg-[#13161e] border border-white/[0.07] rounded-xl overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-white/[0.07]">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[18px] font-bold text-white leading-none">{symbol}</p>
            <p className="text-[11.5px] text-white/45 mt-1 truncate">{quote?.shortName ?? fallbackName}</p>
          </div>
          <div className="text-right flex-shrink-0">
            {quote ? (
              <>
                <p className="text-[19px] font-bold text-white leading-none">{quote.price.toFixed(2)}</p>
                <p className={`text-[11.5px] font-medium mt-1 ${isPos ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>
                  {isPos ? '+' : ''}{changeAmt.toFixed(2)} ({isPos ? '+' : ''}{quote.change1d.toFixed(2)}%)
                </p>
              </>
            ) : quoteErr ? (
              <p className="text-[11px] text-white/30 mt-2">ไม่พบราคา</p>
            ) : (
              <div className="space-y-1.5">
                <div className="h-5 w-16 bg-white/[0.06] rounded animate-pulse ml-auto" />
                <div className="h-3 w-12 bg-white/[0.04] rounded animate-pulse ml-auto" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chart */}
      <PriceChart ticker={symbol} market={market} height={240} />

      {/* Chart legend */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-white/[0.06]">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 bg-[#1D9E75] rounded-sm" />
          <span className="text-[11px] text-white/35">ขึ้น</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 bg-[#E24B4A] rounded-sm" />
          <span className="text-[11px] text-white/35">ลง</span>
        </div>
        <div className="flex items-center gap-1.5">
          <svg width="14" height="3" viewBox="0 0 14 3" className="flex-shrink-0">
            <line x1="0" y1="1.5" x2="14" y2="1.5" stroke="#F9C942" strokeWidth="1.5" />
          </svg>
          <span className="text-[11px] text-white/35">EMA 50</span>
        </div>
        <div className="flex items-center gap-1.5">
          <svg width="14" height="3" viewBox="0 0 14 3" className="flex-shrink-0">
            <line x1="0" y1="1.5" x2="14" y2="1.5" stroke="#AA00FF" strokeWidth="1.5" />
          </svg>
          <span className="text-[11px] text-white/35">EMA 200</span>
        </div>
      </div>

      {/* News */}
      <div className="flex-1 min-h-0">
        <p className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-white/25 border-b border-white/[0.06]">
          ข่าวล่าสุด
        </p>
        {news.length === 0 ? (
          <p className="px-4 py-6 text-[11.5px] text-white/25 text-center">ไม่มีข่าวที่เกี่ยวข้อง</p>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {news.map((item, i) => {
              const badge = sentBadge(item.sentiment);
              return (
                <a
                  key={item.link || i}
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block px-4 py-3 hover:bg-white/[0.03] transition-colors"
                >
                  <div className="flex items-start gap-2 mb-1.5">
                    <span className={`flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded ${badge.cls}`}>
                      {badge.label}
                    </span>
                    <p className="text-[12px] text-white/70 leading-snug">{item.title}</p>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-white/30">
                    <span>{item.source}</span>
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
