'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { scanData, type ScanEntry } from '@/lib/scanData';
import { tickerToSector, getSectorsGrouped } from '@/lib/sectorData';
import { stockNames } from '@/lib/stockNames';
import SparklineChart from '@/components/SparklineChart';

type LivePrice = { price: number; changePercent: number };

const ALL_STAGES = ['S.Bull', 'Bull', 'Accumulation', 'Recovery', 'Warning', 'Bear'];

function stageCls(stage: string): string {
  if (stage === 'Bull' || stage === 'S.Bull') return 'bg-[#EAF3DE] text-[#27500A]';
  if (stage === 'Accumulation' || stage === 'Recovery') return 'bg-[#E6F1FB] text-[#0C447C]';
  if (stage === 'Warning') return 'bg-[#FAEEDA] text-[#633806]';
  return 'bg-[#FCEBEB] text-[#791F1F]';
}

function rsColor(score: number): string {
  if (score >= 80) return '#1D9E75';
  if (score >= 50) return '#BA7517';
  return '#E24B4A';
}

// ──────────────────────────────── Row ─────────────────────────────────────
function StockRow({
  entry,
  rank,
  liveChangePercent,
}: {
  entry: ScanEntry;
  rank: number;
  liveChangePercent: number | null;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [sparkData, setSparkData] = useState<{ time: string; value: number }[]>([]);
  const [sparkLoaded, setSparkLoaded] = useState(false);

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          obs.disconnect();
          let cancelled = false;
          fetch(`/api/chart/${encodeURIComponent(entry.ticker)}?market=SET`)
            .then(r => r.json())
            .then(json => {
              if (cancelled) return;
              const raw: { time: string; close: number }[] = json.data ?? [];
              const last30 = raw.slice(-30);
              setSparkData(last30.map(d => ({ time: d.time, value: d.close })));
              setSparkLoaded(true);
            })
            .catch(() => setSparkLoaded(true));
          return () => { cancelled = true; };
        }
      },
      { rootMargin: '400px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [entry.ticker]);

  const sector = tickerToSector[entry.ticker];
  const name = stockNames[entry.ticker] ?? '';
  const logoUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(entry.ticker)}&background=1e2232&color=8899bb&size=40&font-size=0.42&bold=true`;

  return (
    <div
      ref={rowRef}
      className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.04] hover:bg-white/[0.025] transition-colors"
    >
      {/* Rank */}
      <div className="w-7 text-right text-[12px] text-white/20 tabular-nums flex-shrink-0">
        {rank}
      </div>

      {/* Logo */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logoUrl}
        alt={entry.ticker}
        width={36}
        height={36}
        className="rounded-xl flex-shrink-0 object-cover"
        loading="lazy"
      />

      {/* Ticker + Name + Sector */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[14px] font-bold text-white leading-none">{entry.ticker}</span>
          {entry.stage && (
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold leading-none ${stageCls(entry.stage)}`}>
              {entry.stage}
            </span>
          )}
        </div>
        {name && (
          <div className="text-[11px] text-white/35 truncate mt-0.5 max-w-[220px]">{name}</div>
        )}
        {sector && (
          <div className="text-[10px] text-white/20 mt-0.5">{sector.sector}</div>
        )}
      </div>

      {/* RS Score */}
      <div className="w-12 text-right flex-shrink-0">
        <span
          className="text-[22px] font-bold tabular-nums leading-none"
          style={{ color: rsColor(entry.rs_score) }}
        >
          {entry.rs_score}
        </span>
      </div>

      {/* Combo Score */}
      <div className="w-10 text-center flex-shrink-0">
        <span className="text-[11px] text-white/30 tabular-nums">{entry.combo_score}/4</span>
      </div>

      {/* Signal badges */}
      <div className="w-[72px] flex-shrink-0 hidden sm:block">
        <div className="flex flex-col gap-0.5">
          {entry.sepa && (
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-[#EAF3DE] text-[#27500A] inline-block w-fit leading-none">SEPA</span>
          )}
          {entry.kell && (
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-[#E6F1FB] text-[#0C447C] inline-block w-fit leading-none">Kell</span>
          )}
          {entry.breakout && (
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-[#E6F1FB] text-[#0C447C] inline-block w-fit leading-none">BO</span>
          )}
        </div>
      </div>

      {/* 1D% — from batch price API */}
      <div className="w-[60px] text-right flex-shrink-0 hidden md:block">
        {liveChangePercent !== null ? (
          <span
            className={`text-[12px] font-semibold tabular-nums ${liveChangePercent >= 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}
          >
            {liveChangePercent >= 0 ? '+' : ''}{liveChangePercent.toFixed(2)}%
          </span>
        ) : (
          <div className="h-3 w-10 bg-white/[0.05] rounded ml-auto animate-pulse" />
        )}
      </div>

      {/* Sparkline */}
      <div className="w-[120px] h-[40px] flex-shrink-0 hidden lg:block">
        {sparkData.length > 0 ? (
          <SparklineChart data={sparkData} width={120} height={40} />
        ) : sparkLoaded ? (
          <div className="w-full h-full bg-white/[0.03] rounded" />
        ) : (
          <div className="w-full h-full bg-white/[0.03] rounded animate-pulse" />
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────── Filter components ───────────────────────
function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all border ${
        value
          ? 'bg-[#1D9E75]/10 text-[#1D9E75] border-[#1D9E75]/25'
          : 'bg-white/[0.04] text-white/35 border-white/[0.06] hover:text-white/60 hover:border-white/15'
      }`}
    >
      <div
        className={`w-2.5 h-2.5 rounded-full transition-colors ${
          value ? 'bg-[#1D9E75]' : 'border border-white/25 bg-transparent'
        }`}
      />
      {label}
    </button>
  );
}

function SectorDropdown({
  allSectors,
  selected,
  onChange,
}: {
  allSectors: string[];
  selected: Set<string>;
  onChange: (s: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const label = selected.size === 0 ? 'All Sectors' : `${selected.size} selected`;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/[0.04] border border-white/[0.07] rounded-lg text-[11px] text-white/50 hover:text-white/70 hover:border-white/15 transition-all"
      >
        <span>{label}</span>
        <ChevronDown size={11} className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full mt-1.5 z-50 bg-[#181b24] border border-white/[0.1] rounded-xl shadow-2xl p-1.5 min-w-[180px] max-h-72 overflow-y-auto">
          <button
            onClick={() => { onChange(new Set()); setOpen(false); }}
            className={`w-full text-left px-2.5 py-1.5 text-[11px] rounded-lg transition-colors mb-0.5 ${
              selected.size === 0 ? 'text-white bg-white/[0.07]' : 'text-white/40 hover:bg-white/[0.04] hover:text-white/70'
            }`}
          >
            All Sectors
          </button>
          {allSectors.map(s => (
            <button
              key={s}
              onClick={() => {
                const next = new Set(selected);
                if (next.has(s)) next.delete(s);
                else next.add(s);
                onChange(next);
              }}
              className={`w-full text-left px-2.5 py-1.5 text-[11px] rounded-lg flex items-center gap-2 transition-colors ${
                selected.has(s) ? 'text-white' : 'text-white/40 hover:bg-white/[0.04] hover:text-white/70'
              }`}
            >
              <div
                className={`w-3.5 h-3.5 rounded flex-shrink-0 flex items-center justify-center border ${
                  selected.has(s) ? 'bg-[#1D9E75] border-[#1D9E75]' : 'border-white/20'
                }`}
              >
                {selected.has(s) && (
                  <svg width="8" height="6" viewBox="0 0 8 6">
                    <path d="M1 3l2 2 4-4" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────── Page ────────────────────────────────────
export default function RSLeadersPage() {
  const [rsMin, setRsMin] = useState(80);
  const [comboMin, setComboMin] = useState(0);
  const [stages, setStages] = useState<Set<string>>(new Set(ALL_STAGES));
  const [sectors, setSectors] = useState<Set<string>>(new Set());
  const [filterSepa, setFilterSepa] = useState(false);
  const [filterKell, setFilterKell] = useState(false);
  const [filterBreakout, setFilterBreakout] = useState(false);
  const [priceMap, setPriceMap] = useState<Record<string, LivePrice>>({});

  // Fetch all scanData prices once on mount
  useEffect(() => {
    const symbols = scanData.map(e => e.ticker).join(',');
    fetch(`/api/prices?symbols=${symbols}`)
      .then(r => r.json())
      .then(json => { if (json.prices) setPriceMap(json.prices); })
      .catch(() => {});
  }, []);

  const allSectors = useMemo(() => getSectorsGrouped().map(g => g.sector), []);
  const allStagesSelected = stages.size === ALL_STAGES.length;

  const isDirty =
    rsMin !== 80 || comboMin !== 0 || !allStagesSelected || sectors.size > 0 ||
    filterSepa || filterKell || filterBreakout;

  const filtered = useMemo(() => {
    return scanData
      .filter(s => s.rs_score >= rsMin)
      .filter(s => s.combo_score >= comboMin)
      .filter(s => allStagesSelected || (s.stage !== null && stages.has(s.stage)))
      .filter(s => sectors.size === 0 || sectors.has(tickerToSector[s.ticker]?.sector ?? ''))
      .filter(s => !filterSepa || s.sepa)
      .filter(s => !filterKell || s.kell)
      .filter(s => !filterBreakout || s.breakout)
      .sort((a, b) => b.rs_score - a.rs_score);
  }, [rsMin, comboMin, stages, sectors, filterSepa, filterKell, filterBreakout, allStagesSelected]);

  function resetFilters() {
    setRsMin(80);
    setComboMin(0);
    setStages(new Set(ALL_STAGES));
    setSectors(new Set());
    setFilterSepa(false);
    setFilterKell(false);
    setFilterBreakout(false);
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[18px] font-bold text-white">RS Leaders</h1>
          <p className="text-[12px] text-white/35 mt-0.5">
            <span className="text-white/65 font-medium">{filtered.length}</span> หุ้น
          </p>
        </div>
      </div>

      {/* ─── Filter bar ─── */}
      <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-white/40 whitespace-nowrap">RS ≥</span>
            <input
              type="range"
              min={50}
              max={99}
              value={rsMin}
              onChange={e => setRsMin(+e.target.value)}
              className="w-28 accent-[#1D9E75] cursor-pointer"
            />
            <span className="text-[13px] font-semibold text-[#1D9E75] tabular-nums w-6 text-right">{rsMin}</span>
          </div>

          <div className="h-4 w-px bg-white/[0.07] hidden sm:block" />

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-white/40 whitespace-nowrap">Combo ≥</span>
            <input
              type="range"
              min={0}
              max={4}
              value={comboMin}
              onChange={e => setComboMin(+e.target.value)}
              className="w-20 accent-[#1D9E75] cursor-pointer"
            />
            <span className="text-[13px] font-semibold text-[#1D9E75] tabular-nums w-3 text-right">{comboMin}</span>
          </div>

          <div className="h-4 w-px bg-white/[0.07] hidden sm:block" />

          <div className="flex items-center gap-1.5">
            <Toggle label="SEPA" value={filterSepa} onChange={setFilterSepa} />
            <Toggle label="Kell" value={filterKell} onChange={setFilterKell} />
            <Toggle label="Breakout" value={filterBreakout} onChange={setFilterBreakout} />
          </div>

          {isDirty && (
            <button
              onClick={resetFilters}
              className="ml-auto text-[11px] text-white/25 hover:text-white/60 transition-colors"
            >
              Reset
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] text-white/20 uppercase tracking-wider flex-shrink-0 mr-0.5">Stage</span>
          {ALL_STAGES.map(s => (
            <button
              key={s}
              onClick={() => {
                const next = new Set(stages);
                if (next.has(s)) next.delete(s);
                else next.add(s);
                setStages(next);
              }}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${
                stages.has(s) ? stageCls(s) : 'bg-white/[0.04] text-white/20 hover:text-white/40'
              }`}
            >
              {s}
            </button>
          ))}

          <div className="h-4 w-px bg-white/[0.07] mx-1" />

          <SectorDropdown
            allSectors={allSectors}
            selected={sectors}
            onChange={setSectors}
          />
        </div>
      </div>

      {/* ─── Table ─── */}
      <div className="bg-[#13161e] border border-white/[0.07] rounded-xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.06] bg-white/[0.015]">
          <div className="w-7 flex-shrink-0" />
          <div className="w-9 flex-shrink-0" />
          <div className="flex-1 text-[10px] font-semibold text-white/25 uppercase tracking-wider">Ticker</div>
          <div className="w-12 text-right text-[10px] font-semibold text-white/25 uppercase tracking-wider flex-shrink-0">RS</div>
          <div className="w-10 text-center text-[10px] font-semibold text-white/25 uppercase tracking-wider flex-shrink-0">Combo</div>
          <div className="w-[72px] text-[10px] font-semibold text-white/25 uppercase tracking-wider flex-shrink-0 hidden sm:block">Signals</div>
          <div className="w-[60px] text-right text-[10px] font-semibold text-white/25 uppercase tracking-wider flex-shrink-0 hidden md:block">1D%</div>
          <div className="w-[120px] text-[10px] font-semibold text-white/25 uppercase tracking-wider flex-shrink-0 hidden lg:block">30D</div>
        </div>

        {filtered.length === 0 ? (
          <div className="py-16 text-center text-[13px] text-white/25">
            ไม่พบหุ้นที่ตรงกับ filter ที่เลือก
          </div>
        ) : (
          filtered.map((entry, i) => (
            <StockRow
              key={entry.ticker}
              entry={entry}
              rank={i + 1}
              liveChangePercent={priceMap[entry.ticker]?.changePercent ?? null}
            />
          ))
        )}
      </div>
    </div>
  );
}
