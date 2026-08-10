'use client';

import { useState, useMemo } from 'react';
import rawHistory from '@/data/scans/sector_rs_history.json';
import { ArrowUp, ArrowDown, Minus, Info, AlertTriangle } from 'lucide-react';

type Market = 'SET' | 'MAI';
type Quadrant = 'Leading' | 'Weakening' | 'Improving' | 'Lagging';
type SortField = 'rs' | 'momentum' | 'name';
type SortOrder = 'asc' | 'desc';

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
  'Agro':        '#5D9E4A',
  'Consump':     '#E24B4A',
  'Consumer':    '#E24B4A',
  'Financials':  '#378ADD',
  'Industrials': '#E67E22',
  'Property':    '#27AE60',
  'Resources':   '#EF9F27',
  'Services':    '#7F77DD',
  'Technology':  '#1D9E75',
};

function sectorColor(sector: string): string {
  return SECTOR_COLORS[sector] ?? '#6b7280';
}

export interface CalculatedSector {
  sector: string;
  count: number;
  rsNow: number;
  rsPrev: number;
  momentum: number;
  incomplete20Days: boolean;
  quadrant: Quadrant;
  rsSeries: number[];
}

export function computeSectorRotationData(market: Market): {
  sectors: CalculatedSector[];
  quadrantCounts: Record<Quadrant, number>;
  dates: string[];
  totalSectors: number;
} {
  const marketSectorsMap = historyData.sectors?.[market] ?? {};
  const dates = historyData.dates ?? [];

  const sectors: CalculatedSector[] = [];
  const quadrantCounts: Record<Quadrant, number> = {
    Leading: 0,
    Weakening: 0,
    Improving: 0,
    Lagging: 0,
  };

  for (const [sector, item] of Object.entries(marketSectorsMap)) {
    const rawSeries = Array.isArray(item?.rs_series) ? item.rs_series : [];
    const series = rawSeries.filter((v): v is number => typeof v === 'number');
    if (series.length === 0) continue;

    const count = typeof item.count === 'number' ? item.count : 0;
    const rsNow = series[series.length - 1];

    const incomplete20Days = series.length < 21;
    const rsPrevIndex = incomplete20Days ? 0 : series.length - 1 - 20;
    const rsPrev = series[rsPrevIndex] ?? rsNow;

    const momentum = Number((rsNow - rsPrev).toFixed(2));

    // 50 = midpoint of RS 1-99, can adjust to market median later
    const quadrant: Quadrant =
      rsNow >= 50
        ? momentum >= 0
          ? 'Leading'
          : 'Weakening'
        : momentum >= 0
        ? 'Improving'
        : 'Lagging';

    quadrantCounts[quadrant] = (quadrantCounts[quadrant] ?? 0) + 1;

    sectors.push({
      sector,
      count,
      rsNow,
      rsPrev,
      momentum,
      incomplete20Days,
      quadrant,
      rsSeries: series,
    });
  }

  return {
    sectors,
    quadrantCounts,
    dates,
    totalSectors: sectors.length,
  };
}

function Sparkline({ series, color }: { series: number[]; color: string }) {
  if (!series || series.length < 2) return null;
  const min = Math.min(...series, 0);
  const max = Math.max(...series, 100);
  const range = max - min || 1;
  const width = 80;
  const height = 24;

  const points = series
    .map((val, idx) => {
      const x = (idx / (series.length - 1)) * width;
      const y = height - ((val - min) / range) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const lastX = width;
  const lastY = height - ((series[series.length - 1] - min) / range) * (height - 4) - 2;

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
      <circle cx={lastX} cy={lastY} r="2.5" fill={color} />
    </svg>
  );
}

export default function RotationLeaderboard() {
  const [market, setMarket] = useState<Market>('SET');
  const [sortField, setSortField] = useState<SortField>('rs');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [selectedQuadrant, setSelectedQuadrant] = useState<Quadrant | 'All'>('All');

  const { sectors, quadrantCounts, dates, totalSectors } = useMemo(
    () => computeSectorRotationData(market),
    [market]
  );

  const filteredAndSortedSectors = useMemo(() => {
    let result = [...sectors];

    if (selectedQuadrant !== 'All') {
      result = result.filter(s => s.quadrant === selectedQuadrant);
    }

    result.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'rs') {
        cmp = b.rsNow - a.rsNow;
      } else if (sortField === 'momentum') {
        cmp = b.momentum - a.momentum;
      } else if (sortField === 'name') {
        cmp = a.sector.localeCompare(b.sector);
      }
      return sortOrder === 'desc' ? cmp : -cmp;
    });

    return result;
  }, [sectors, selectedQuadrant, sortField, sortOrder]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const QUADRANT_CONFIG: Record<
    Quadrant,
    { label: string; bg: string; text: string; border: string; desc: string }
  > = {
    Leading: {
      label: 'Leading',
      bg: 'bg-emerald-500/10',
      text: 'text-emerald-400',
      border: 'border-emerald-500/25',
      desc: 'RS ≥ 50 & Momentum ≥ 0',
    },
    Weakening: {
      label: 'Weakening',
      bg: 'bg-amber-500/10',
      text: 'text-amber-400',
      border: 'border-amber-500/25',
      desc: 'RS ≥ 50 & Momentum < 0',
    },
    Improving: {
      label: 'Improving',
      bg: 'bg-sky-500/10',
      text: 'text-sky-400',
      border: 'border-sky-500/25',
      desc: 'RS < 50 & Momentum ≥ 0',
    },
    Lagging: {
      label: 'Lagging',
      bg: 'bg-rose-500/10',
      text: 'text-rose-400',
      border: 'border-rose-500/25',
      desc: 'RS < 50 & Momentum < 0',
    },
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Market Toggle */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#13161e] border border-white/[0.08] rounded-2xl p-5 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[20px] font-bold text-white tracking-tight">
              Sector Rotation Leaderboard
            </h1>
            <span className="px-2 py-0.5 text-[11px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-full">
              RRG Phase 2
            </span>
          </div>
          <p className="text-[13px] text-white/40 mt-1">
            จัดอันดับ Sector ตาม Relative Strength (RS) และ Momentum 20 วันทำการ
            {dates.length > 0 && ` (${dates[0]} ถึง ${dates[dates.length - 1]})`}
          </p>
        </div>

        {/* Market Toggle */}
        <div className="flex gap-2">
          {(['SET', 'MAI'] as Market[]).map(m => (
            <button
              key={m}
              onClick={() => setMarket(m)}
              className={[
                'px-4 py-2 rounded-xl text-[12px] font-bold uppercase tracking-wider transition-all border shadow-sm',
                market === m
                  ? 'bg-white text-black border-white'
                  : 'bg-white/[0.04] border-white/[0.08] text-white/50 hover:bg-white/[0.08] hover:text-white',
              ].join(' ')}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(['Leading', 'Weakening', 'Improving', 'Lagging'] as Quadrant[]).map(q => {
          const cfg = QUADRANT_CONFIG[q];
          const count = quadrantCounts[q] ?? 0;
          const isSelected = selectedQuadrant === q;

          return (
            <button
              key={q}
              onClick={() => setSelectedQuadrant(prev => (prev === q ? 'All' : q))}
              className={[
                'text-left p-4 rounded-2xl border transition-all relative overflow-hidden',
                cfg.bg,
                cfg.border,
                isSelected ? 'ring-2 ring-white/30 scale-[1.02]' : 'hover:border-white/20',
              ].join(' ')}
            >
              <div className="flex items-center justify-between">
                <span className={`text-[12px] font-bold tracking-wide uppercase ${cfg.text}`}>
                  {cfg.label}
                </span>
                <span className="text-[20px] font-extrabold text-white tabular-nums">
                  {count}
                </span>
              </div>
              <p className="text-[11px] text-white/40 mt-1">{cfg.desc}</p>
            </button>
          );
        })}
      </div>

      {/* Leaderboard Table Box */}
      <div className="bg-[#13161e] border border-white/[0.08] rounded-2xl overflow-hidden shadow-sm">
        {/* Table Controls */}
        <div className="p-4 border-b border-white/[0.08] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-white">
              {market} Sectors ({filteredAndSortedSectors.length} / {totalSectors})
            </span>
            {selectedQuadrant !== 'All' && (
              <button
                onClick={() => setSelectedQuadrant('All')}
                className="text-[11px] text-white/40 hover:text-white underline ml-2"
              >
                Clear Quadrant Filter
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 text-[12px]">
            <span className="text-white/40 font-medium">เรียงตาม:</span>
            <button
              onClick={() => toggleSort('rs')}
              className={`px-3 py-1.5 rounded-lg border font-semibold transition-all ${
                sortField === 'rs'
                  ? 'bg-white/10 text-white border-white/20'
                  : 'bg-white/[0.03] text-white/50 border-white/[0.06] hover:text-white'
              }`}
            >
              RS {sortField === 'rs' ? (sortOrder === 'desc' ? '▼' : '▲') : ''}
            </button>
            <button
              onClick={() => toggleSort('momentum')}
              className={`px-3 py-1.5 rounded-lg border font-semibold transition-all ${
                sortField === 'momentum'
                  ? 'bg-white/10 text-white border-white/20'
                  : 'bg-white/[0.03] text-white/50 border-white/[0.06] hover:text-white'
              }`}
            >
              Momentum {sortField === 'momentum' ? (sortOrder === 'desc' ? '▼' : '▲') : ''}
            </button>
            <button
              onClick={() => toggleSort('name')}
              className={`px-3 py-1.5 rounded-lg border font-semibold transition-all ${
                sortField === 'name'
                  ? 'bg-white/10 text-white border-white/20'
                  : 'bg-white/[0.03] text-white/50 border-white/[0.06] hover:text-white'
              }`}
            >
              ชื่อ Sector {sortField === 'name' ? (sortOrder === 'desc' ? '▼' : '▲') : ''}
            </button>
          </div>
        </div>

        {/* Table Content */}
        {filteredAndSortedSectors.length === 0 ? (
          <div className="p-8 text-center text-white/40 text-[13px]">
            ไม่พบ Sector ใน Quadrant นี้
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-white/[0.02] text-white/40 font-semibold border-b border-white/[0.06] text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4 w-12 text-center">#</th>
                  <th className="py-3 px-4">Sector</th>
                  <th className="py-3 px-4 text-center">RS Score</th>
                  <th className="py-3 px-4 text-center">Momentum (20d)</th>
                  <th className="py-3 px-4 text-center">Quadrant</th>
                  <th className="py-3 px-4 min-w-[120px]">RS Strength Bar</th>
                  <th className="py-3 px-4 text-center w-[100px]">30d Trend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {filteredAndSortedSectors.map((item, idx) => {
                  const color = sectorColor(item.sector);
                  const qCfg = QUADRANT_CONFIG[item.quadrant];

                  return (
                    <tr
                      key={item.sector}
                      className="hover:bg-white/[0.02] transition-colors group cursor-default"
                    >
                      {/* Rank */}
                      <td className="py-3 px-4 text-center font-bold text-white/40 tabular-nums">
                        {idx + 1}
                      </td>

                      {/* Sector Name */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-1.5 h-7 rounded-full flex-shrink-0"
                            style={{ backgroundColor: color }}
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-white text-[14px]">
                                {item.sector}
                              </span>
                              {item.incomplete20Days && (
                                <span
                                  className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-400/10 border border-amber-400/20 px-1.5 py-0.5 rounded"
                                  title="ข้อมูลไม่ครบ 20 วันทำการ ใช้ข้อมูลเก่าสุดที่มี"
                                >
                                  <AlertTriangle size={10} /> ข้อมูล &lt; 20 วัน
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-white/35 font-medium">
                              {item.count} หุ้น
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* RS Score */}
                      <td className="py-3 px-4 text-center">
                        <span className="font-extrabold text-[15px] text-white tabular-nums">
                          {item.rsNow.toFixed(1)}
                        </span>
                      </td>

                      {/* Momentum */}
                      <td className="py-3 px-4 text-center">
                        <div className="inline-flex items-center gap-1 font-bold text-[13px] tabular-nums">
                          {item.momentum > 0 ? (
                            <span className="text-emerald-400 flex items-center gap-0.5">
                              <ArrowUp size={13} />+{item.momentum.toFixed(1)}
                            </span>
                          ) : item.momentum < 0 ? (
                            <span className="text-rose-400 flex items-center gap-0.5">
                              <ArrowDown size={13} />{item.momentum.toFixed(1)}
                            </span>
                          ) : (
                            <span className="text-white/40 flex items-center gap-0.5">
                              <Minus size={13} />0.0
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Quadrant Badge */}
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-bold border ${qCfg.bg} ${qCfg.text} ${qCfg.border}`}
                        >
                          {qCfg.label}
                        </span>
                      </td>

                      {/* Mini Bar RS */}
                      <td className="py-3 px-4">
                        <div className="w-full bg-white/[0.06] h-2 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{
                              width: `${Math.min(100, Math.max(0, item.rsNow))}%`,
                              backgroundColor: color,
                            }}
                          />
                        </div>
                      </td>

                      {/* Sparkline */}
                      <td className="py-3 px-4 text-center">
                        <Sparkline series={item.rsSeries} color={color} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Info note at bottom */}
      <div className="flex items-start gap-2 p-4 bg-white/[0.02] border border-white/[0.05] rounded-xl text-[12px] text-white/40">
        <Info size={14} className="mt-0.5 flex-shrink-0 text-white/50" />
        <div>
          <p className="font-semibold text-white/60">วิธีการคำนวณ Quadrant:</p>
          <p className="mt-0.5">
            • <b>Leading</b> (RS ≥ 50, Momentum ≥ 0) | <b>Weakening</b> (RS ≥ 50, Momentum &lt; 0)
            <br />• <b>Improving</b> (RS &lt; 50, Momentum ≥ 0) | <b>Lagging</b> (RS &lt; 50, Momentum &lt; 0)
            <br />• Threshold RS 50 คือจุดกึ่งกลาง scale RS (1-99) — สามารถปรับเปลี่ยนตาม Market Median ได้ในภายหลัง
          </p>
        </div>
      </div>
    </div>
  );
}
