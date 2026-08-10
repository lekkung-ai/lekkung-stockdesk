'use client';

import { useState, useMemo } from 'react';
import rawHistory from '@/data/scans/sector_rs_history.json';
import { computeSectorSpreads, SectorSpreadInfo } from '@/components/RotationLeaderboard';
import { Info, AlertTriangle, ChevronLeft } from 'lucide-react';

type Market = 'SET' | 'MAI';
type Quadrant = 'Leading' | 'Weakening' | 'Improving' | 'Lagging';

interface SectorHistoryItem {
  rs_series?: (number | null)[];
  count?: number;
  subsectors?: Record<string, { rs_series?: (number | null)[]; count?: number }>;
}

interface SectorRSHistoryData {
  generated_at?: string;
  method?: string;
  lookback_days?: number;
  dates?: string[];
  sectors?: Record<string, Record<string, SectorHistoryItem>>;
}

const historyData = (rawHistory as unknown) as SectorRSHistoryData;

const SECTOR_COLORS: Record<string, string> = {
  Agro: '#5D9E4A',
  Consump: '#E24B4A',
  Consumer: '#E24B4A',
  Financials: '#378ADD',
  Industrials: '#E67E22',
  Property: '#27AE60',
  Resources: '#EF9F27',
  Services: '#7F77DD',
  Technology: '#1D9E75',
};

function sectorColor(sector: string): string {
  return SECTOR_COLORS[sector] ?? '#9ca3af';
}

export interface TrailPoint {
  offset: number; // days ago (0 = last, 5, 10, 15)
  date: string;
  rs: number;
  mom: number;
  quadrant: Quadrant;
}

export interface SectorRRGData {
  sector: string;
  count: number;
  head: TrailPoint;
  trail: TrailPoint[];
  spreadInfo?: SectorSpreadInfo | null;
  isSmallSample?: boolean;
}

export function computeSectorRRGTrails(
  market: Market,
  selectedSector?: string | null
): {
  sectorsData: SectorRRGData[];
  dates: string[];
  maxAbsMom: number;
} {
  const isSubsectorMode = market === 'SET' && Boolean(selectedSector);
  let marketSectorsMap: Record<string, SectorHistoryItem> = {};

  if (isSubsectorMode && selectedSector) {
    marketSectorsMap = (historyData.sectors?.['SET']?.[selectedSector]?.subsectors ?? {}) as Record<
      string,
      SectorHistoryItem
    >;
  } else {
    marketSectorsMap = historyData.sectors?.[market] ?? {};
  }

  const spreadsMap = market === 'SET' ? computeSectorSpreads() : {};
  const dates = historyData.dates ?? [];

  const sectorsData: SectorRRGData[] = [];
  let globalMaxAbsMom = 10;

  for (const [sector, item] of Object.entries(marketSectorsMap)) {
    const rawSeries = Array.isArray(item?.rs_series) ? item.rs_series : [];
    const series = rawSeries.filter((v): v is number => typeof v === 'number');
    if (series.length === 0) continue;

    const count = typeof item.count === 'number' ? item.count : 0;
    const lastIdx = series.length - 1;

    // Trail points: 15, 10, 5, 0 days ago (oldest to newest)
    const offsets = [15, 10, 5, 0];
    const trail: TrailPoint[] = [];

    for (const off of offsets) {
      const idx = lastIdx - off;
      if (idx < 0) continue;

      const rs = series[idx];
      let mom = 0;
      let valid = false;

      const prev20Idx = idx - 20;
      if (prev20Idx >= 0 && typeof series[prev20Idx] === 'number') {
        mom = Number((rs - series[prev20Idx]).toFixed(2));
        valid = true;
      } else if (off === 0) {
        // Fallback for head point if series < 21 days
        const fallbackPrev = series[0];
        mom = Number((rs - fallbackPrev).toFixed(2));
        valid = true;
      }

      if (valid) {
        // 50 = midpoint of RS 1-99, can adjust to market median later
        const quadrant: Quadrant =
          rs >= 50
            ? mom >= 0
              ? 'Leading'
              : 'Weakening'
            : mom >= 0
            ? 'Improving'
            : 'Lagging';

        const dateStr = dates[idx] ?? `Day ${idx}`;
        trail.push({ offset: off, date: dateStr, rs, mom, quadrant });

        if (Math.abs(mom) > globalMaxAbsMom) {
          globalMaxAbsMom = Math.abs(mom);
        }
      }
    }

    if (trail.length > 0) {
      const head = trail[trail.length - 1];
      const spreadInfo = isSubsectorMode ? null : spreadsMap[sector] ?? null;
      const isSmallSample = isSubsectorMode ? count < 5 : false;

      sectorsData.push({
        sector,
        count,
        head,
        trail,
        spreadInfo,
        isSmallSample,
      });
    }
  }

  // Ceiling for symmetrical Y-axis scale with padding
  const maxAbsMom = Math.max(10, Math.ceil(globalMaxAbsMom * 1.15));

  return {
    sectorsData,
    dates,
    maxAbsMom,
  };
}

interface RRGChartProps {
  market?: Market;
  selectedSector?: string | null;
  onSelectSector?: (sector: string | null) => void;
  onMarketChange?: (m: Market) => void;
}

export default function RRGChart({
  market: propMarket,
  selectedSector: propSelectedSector,
  onSelectSector,
  onMarketChange,
}: RRGChartProps) {
  const [internalMarket, setInternalMarket] = useState<Market>('SET');
  const [hoveredSector, setHoveredSector] = useState<string | null>(null);
  const [maiNotice, setMaiNotice] = useState<string | null>(null);

  const market = propMarket ?? internalMarket;
  const setMarket = (m: Market) => {
    if (onMarketChange) onMarketChange(m);
    else setInternalMarket(m);
  };

  const selectedSector = propSelectedSector ?? null;

  const { sectorsData, dates, maxAbsMom } = useMemo(
    () => computeSectorRRGTrails(market, selectedSector),
    [market, selectedSector]
  );

  const quadrantCounts = useMemo(() => {
    const counts: Record<Quadrant, number> = {
      Leading: 0,
      Weakening: 0,
      Improving: 0,
      Lagging: 0,
    };
    for (const s of sectorsData) {
      counts[s.head.quadrant] = (counts[s.head.quadrant] ?? 0) + 1;
    }
    return counts;
  }, [sectorsData]);

  const handleSectorClick = (sectorName: string) => {
    if (selectedSector) return; // Already in subsector view

    if (market === 'MAI') {
      setMaiNotice(`ตลาด MAI ไม่มี Subsector (แสดงระดับ Sector สรุปภาพรวมเท่านั้น)`);
      setTimeout(() => setMaiNotice(null), 3500);
      return;
    }

    if (onSelectSector) {
      onSelectSector(sectorName);
    }
  };

  // SVG Dimension Constants
  const viewBoxWidth = 720;
  const viewBoxHeight = 520;
  const padding = { top: 40, right: 50, bottom: 50, left: 60 };

  const chartWidth = viewBoxWidth - padding.left - padding.right;
  const chartHeight = viewBoxHeight - padding.top - padding.bottom;

  // Coordinate Conversion Helpers
  const toX = (rs: number) => {
    const clamped = Math.max(0, Math.min(100, rs));
    return padding.left + (clamped / 100) * chartWidth;
  };

  const cy = padding.top + chartHeight / 2;
  const toY = (mom: number) => {
    const clamped = Math.max(-maxAbsMom, Math.min(maxAbsMom, mom));
    return cy - (clamped / maxAbsMom) * (chartHeight / 2);
  };

  const cx = toX(50); // RS = 50 center line

  return (
    <div className="bg-[#13161e] border border-white/[0.08] rounded-2xl p-4 md:p-6 space-y-4 shadow-sm">
      {/* MAI Notice Toast */}
      {maiNotice && (
        <div className="p-3 bg-amber-500/15 border border-amber-500/30 rounded-xl text-[12px] text-amber-300 flex items-center justify-between animate-fade-in">
          <span>{maiNotice}</span>
          <button
            onClick={() => setMaiNotice(null)}
            className="text-amber-300/60 hover:text-amber-300 text-[14px] font-bold px-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Chart Top Title & Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-white/[0.06]">
        <div>
          {selectedSector ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => onSelectSector?.(null)}
                className="flex items-center gap-1 text-[12px] text-indigo-400 hover:text-indigo-300 font-bold bg-indigo-500/10 border border-indigo-500/25 px-2.5 py-1 rounded-lg transition-colors"
              >
                <ChevronLeft size={14} /> กลับ Sector
              </button>
              <h2 className="text-[16px] font-bold text-white flex items-center gap-2">
                <span className="text-white/40">{market} /</span> {selectedSector}{' '}
                <span className="text-white/40 font-normal">→ Subsector RRG Chart</span>
              </h2>
            </div>
          ) : (
            <h2 className="text-[16px] font-bold text-white flex items-center gap-2">
              RRG Rotation Scatter Chart ({market})
            </h2>
          )}
          <p className="text-[12px] text-white/40 mt-0.5">
            แกน X: RS Score (0–100) · แกน Y: 20-Day RS Momentum (▲/▼) · หาง (Trail): 4 สัปดาห์ย้อนหลัง
            {dates.length > 0 && ` (${dates[0]} ถึง ${dates[dates.length - 1]})`}
          </p>
        </div>

        {/* Market Switcher & Quadrant Quick Legend */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Market Toggle */}
          {!selectedSector && (
            <div className="flex gap-1.5 bg-white/[0.04] p-1 rounded-xl border border-white/[0.08]">
              {(['SET', 'MAI'] as Market[]).map(m => (
                <button
                  key={m}
                  onClick={() => setMarket(m)}
                  className={[
                    'px-3 py-1 rounded-lg text-[11px] font-bold uppercase transition-all',
                    market === m
                      ? 'bg-white text-black shadow-sm'
                      : 'text-white/50 hover:text-white',
                  ].join(' ')}
                >
                  {m}
                </button>
              ))}
            </div>
          )}

          {!selectedSector && <div className="h-4 w-px bg-white/10 hidden sm:block" />}

          {/* Quadrant Quick Legend */}
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span className="w-2 h-2 rounded-full bg-emerald-400" /> Leading ({quadrantCounts.Leading})
            </span>
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <span className="w-2 h-2 rounded-full bg-amber-400" /> Weakening ({quadrantCounts.Weakening})
            </span>
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <span className="w-2 h-2 rounded-full bg-sky-400" /> Improving ({quadrantCounts.Improving})
            </span>
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <span className="w-2 h-2 rounded-full bg-rose-400" /> Lagging ({quadrantCounts.Lagging})
            </span>
          </div>
        </div>
      </div>

      {/* Main SVG Canvas Container */}
      <div className="relative w-full overflow-hidden select-none">
        <svg
          viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
          className="w-full h-auto text-white overflow-visible"
        >
          {/* Quadrant Background Fills */}
          {/* Top-Right: Leading */}
          <rect
            x={cx}
            y={padding.top}
            width={chartWidth / 2}
            height={chartHeight / 2}
            className="fill-emerald-500/[0.04]"
          />
          {/* Bottom-Right: Weakening */}
          <rect
            x={cx}
            y={cy}
            width={chartWidth / 2}
            height={chartHeight / 2}
            className="fill-amber-500/[0.04]"
          />
          {/* Top-Left: Improving */}
          <rect
            x={padding.left}
            y={padding.top}
            width={chartWidth / 2}
            height={chartHeight / 2}
            className="fill-sky-500/[0.04]"
          />
          {/* Bottom-Left: Lagging */}
          <rect
            x={padding.left}
            y={cy}
            width={chartWidth / 2}
            height={chartHeight / 2}
            className="fill-rose-500/[0.04]"
          />

          {/* Quadrant Watermark Titles */}
          <text
            x={viewBoxWidth - padding.right - 15}
            y={padding.top + 25}
            textAnchor="end"
            className="fill-emerald-400/30 text-[14px] font-black uppercase tracking-widest pointer-events-none"
          >
            Leading (เขียว)
          </text>
          <text
            x={viewBoxWidth - padding.right - 15}
            y={viewBoxHeight - padding.bottom - 15}
            textAnchor="end"
            className="fill-amber-400/30 text-[14px] font-black uppercase tracking-widest pointer-events-none"
          >
            Weakening (ส้ม)
          </text>
          <text
            x={padding.left + 15}
            y={padding.top + 25}
            textAnchor="start"
            className="fill-sky-400/30 text-[14px] font-black uppercase tracking-widest pointer-events-none"
          >
            Improving (ฟ้า)
          </text>
          <text
            x={padding.left + 15}
            y={viewBoxHeight - padding.bottom - 15}
            textAnchor="start"
            className="fill-rose-400/30 text-[14px] font-black uppercase tracking-widest pointer-events-none"
          >
            Lagging (แดง)
          </text>

          {/* Grid Lines & Axes */}
          {/* Vertical RS = 50 Line */}
          <line
            x1={cx}
            y1={padding.top}
            x2={cx}
            y2={viewBoxHeight - padding.bottom}
            stroke="rgba(255,255,255,0.2)"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />

          {/* Horizontal Momentum = 0 Line */}
          <line
            x1={padding.left}
            y1={cy}
            x2={viewBoxWidth - padding.right}
            y2={cy}
            stroke="rgba(255,255,255,0.2)"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />

          {/* X Axis Grid Ticks & Labels (RS 0, 25, 50, 75, 100) */}
          {[0, 25, 50, 75, 100].map(val => {
            const x = toX(val);
            return (
              <g key={`x-tick-${val}`}>
                <line
                  x1={x}
                  y1={padding.top}
                  x2={x}
                  y2={viewBoxHeight - padding.bottom}
                  stroke="rgba(255,255,255,0.05)"
                  strokeWidth="1"
                />
                <text
                  x={x}
                  y={viewBoxHeight - padding.bottom + 18}
                  textAnchor="middle"
                  className="fill-white/40 text-[11px] font-medium"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {/* Y Axis Grid Ticks & Labels */}
          {[-maxAbsMom, -Math.round(maxAbsMom / 2), 0, Math.round(maxAbsMom / 2), maxAbsMom].map(
            val => {
              const y = toY(val);
              return (
                <g key={`y-tick-${val}`}>
                  <line
                    x1={padding.left}
                    y1={y}
                    x2={viewBoxWidth - padding.right}
                    y2={y}
                    stroke="rgba(255,255,255,0.05)"
                    strokeWidth="1"
                  />
                  <text
                    x={padding.left - 8}
                    y={y + 4}
                    textAnchor="end"
                    className="fill-white/40 text-[11px] font-medium tabular-nums"
                  >
                    {val > 0 ? `+${val}` : val}
                  </text>
                </g>
              );
            }
          )}

          {/* Axis Titles */}
          <text
            x={padding.left + chartWidth / 2}
            y={viewBoxHeight - 10}
            textAnchor="middle"
            className="fill-white/50 text-[11px] font-bold tracking-wider"
          >
            Relative Strength (RS Score) →
          </text>
          <text
            x={15}
            y={padding.top + chartHeight / 2}
            textAnchor="middle"
            transform={`rotate(-90 15 ${padding.top + chartHeight / 2})`}
            className="fill-white/50 text-[11px] font-bold tracking-wider"
          >
            20-Day Momentum (RS Δ) →
          </text>

          {/* Sector Trails & Head Nodes */}
          {sectorsData.map(sec => {
            const color = sectorColor(selectedSector ?? sec.sector);
            const isHovered = hoveredSector === sec.sector;
            const isDimmed = hoveredSector !== null && !isHovered;

            // Generate polyline points from trail
            const polylinePoints = sec.trail
              .map(p => `${toX(p.rs).toFixed(1)},${toY(p.mom).toFixed(1)}`)
              .join(' ');

            const headX = toX(sec.head.rs);
            const headY = toY(sec.head.mom);

            return (
              <g
                key={sec.sector}
                onMouseEnter={() => setHoveredSector(sec.sector)}
                onMouseLeave={() => setHoveredSector(null)}
                onClick={() => handleSectorClick(sec.sector)}
                className={`transition-opacity duration-200 cursor-pointer ${
                  isDimmed ? 'opacity-25' : 'opacity-100'
                }`}
              >
                {/* Trail Line */}
                {sec.trail.length > 1 && (
                  <polyline
                    fill="none"
                    stroke={color}
                    strokeWidth={isHovered ? '3' : '2'}
                    strokeOpacity={isHovered ? 0.9 : 0.45}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={polylinePoints}
                  />
                )}

                {/* Historical Trail Dots (excluding head) */}
                {sec.trail.slice(0, -1).map((tp, pIdx) => {
                  const x = toX(tp.rs);
                  const y = toY(tp.mom);
                  return (
                    <circle
                      key={`trail-dot-${sec.sector}-${pIdx}`}
                      cx={x}
                      cy={y}
                      r={isHovered ? 4 : 3}
                      fill={color}
                      fillOpacity={0.6}
                    />
                  );
                })}

                {/* Current Head Node */}
                <circle
                  cx={headX}
                  cy={headY}
                  r={isHovered ? 9 : 7.5}
                  fill={color}
                  stroke="#ffffff"
                  strokeWidth={isHovered ? 2.5 : 1.75}
                  className="transition-all shadow-lg"
                />

                {/* Sector Name Label */}
                <text
                  x={headX + 10}
                  y={headY + 4}
                  className={`text-[12px] font-extrabold transition-all drop-shadow-md ${
                    isHovered ? 'fill-white text-[13px]' : 'fill-white/80'
                  }`}
                >
                  {sec.sector}
                  {sec.spreadInfo?.hasSpreadFlag ? ' ⚠' : ''}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Hovered Sector Tooltip Card Overlay */}
        {hoveredSector && (() => {
          const sec = sectorsData.find(s => s.sector === hoveredSector);
          if (!sec) return null;

          const qColor =
            sec.head.quadrant === 'Leading'
              ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
              : sec.head.quadrant === 'Weakening'
              ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
              : sec.head.quadrant === 'Improving'
              ? 'text-sky-400 border-sky-500/30 bg-sky-500/10'
              : 'text-rose-400 border-rose-500/30 bg-rose-500/10';

          return (
            <div className="absolute top-4 left-16 bg-[#0b0d12]/95 border border-white/20 rounded-xl p-3.5 shadow-2xl backdrop-blur-md max-w-[280px] space-y-2 pointer-events-none z-10">
              <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: sectorColor(selectedSector ?? sec.sector) }}
                  />
                  <span className="font-extrabold text-white text-[13px] truncate">
                    {sec.sector}
                  </span>
                </div>
                <span
                  className={`px-2 py-0.5 text-[10px] font-bold rounded border flex-shrink-0 ${qColor}`}
                >
                  {sec.head.quadrant}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[12px]">
                <div>
                  <p className="text-white/40 text-[10px] uppercase font-semibold">RS Score</p>
                  <p className="text-white font-extrabold tabular-nums">
                    {sec.head.rs.toFixed(1)}
                  </p>
                </div>
                <div>
                  <p className="text-white/40 text-[10px] uppercase font-semibold">20d Momentum</p>
                  <p
                    className={`font-extrabold tabular-nums ${
                      sec.head.mom > 0
                        ? 'text-emerald-400'
                        : sec.head.mom < 0
                        ? 'text-rose-400'
                        : 'text-white/50'
                    }`}
                  >
                    {sec.head.mom > 0 ? `+${sec.head.mom}` : sec.head.mom}
                  </p>
                </div>
              </div>

              {/* Spread Flag Warning Banner inside Tooltip */}
              {sec.spreadInfo?.hasSpreadFlag && (
                <div className="p-2 bg-amber-500/15 border border-amber-500/30 rounded-lg text-[11px] text-amber-300 space-y-1">
                  <div className="flex items-center gap-1 font-bold">
                    <AlertTriangle size={11} /> ⚠ subsector แตกแถว ({sec.spreadInfo.spread}pt)
                  </div>
                  <p className="text-[10.5px] text-amber-200/80 leading-tight">
                    กระจายตัวสูง: {sec.spreadInfo.maxSubsector} ({sec.spreadInfo.maxRs}) vs {sec.spreadInfo.minSubsector} ({sec.spreadInfo.minRs})
                  </p>
                  <p className="text-[10px] text-amber-400 font-semibold underline pt-0.5">
                    👉 กดที่จุดเพื่อดู Subsector RRG
                  </p>
                </div>
              )}

              {/* Small Sample Warning */}
              {sec.isSmallSample && (
                <div className="p-2 bg-sky-500/15 border border-sky-500/30 rounded-lg text-[11px] text-sky-300">
                  ℹ sample น้อย ({sec.count} หุ้น) — ค่า RS อาจแกว่งง่าย
                </div>
              )}

              <div className="pt-1.5 border-t border-white/10 text-[11px] text-white/50">
                <p className="font-semibold text-white/70 mb-1">ประวัติหาง (Trail History):</p>
                <div className="space-y-0.5">
                  {sec.trail.map((tp, idx) => (
                    <div key={idx} className="flex justify-between items-center tabular-nums">
                      <span>
                        {tp.offset === 0 ? 'วันนี้' : `${tp.offset}d ก่อน`} ({tp.date}):
                      </span>
                      <span className="font-mono text-white/80">
                        RS {tp.rs} | {tp.mom > 0 ? `+${tp.mom}` : tp.mom}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Bottom Info Tip */}
      <div className="flex items-center justify-between text-[11.5px] text-white/40 pt-1">
        <div className="flex items-center gap-2">
          <Info size={13} className="text-white/50 flex-shrink-0" />
          <span>
            <b>วิธีอ่าน RRG Chart:</b> ลากเมาส์เพื่อดูหาง 4w {!selectedSector && market === 'SET' && '· กดที่จุดเพื่อดู Subsector RRG'}
          </span>
        </div>
      </div>
    </div>
  );
}
