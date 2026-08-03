'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

export interface PEPoint {
  ticker: string;
  pe: number | null;
  roe?: number | null;
}

export interface BinDef {
  id: string;
  label: string;
  sublabel: string;
  color: string;        // Hex / CSS color for bar
  bgHover: string;      // Tailwind hover background
  borderActive: string; // Tailwind active border
  textHex: string;      // Color for text
  badgeBg: string;      // Badge bg color
  badgeText: string;    // Badge text color
}

const BINS_CONFIG: BinDef[] = [
  {
    id: 'loss',
    label: 'ต่ำกว่า 0',
    sublabel: 'ขาดทุน',
    color: '#888780',
    bgHover: 'hover:bg-[#888780]/15',
    borderActive: 'border-[#888780]',
    textHex: '#888780',
    badgeBg: 'bg-[#888780]/20',
    badgeText: 'text-[#a3a29b]',
  },
  {
    id: '0-10',
    label: '0 - 10x',
    sublabel: 'ถูก',
    color: '#1D9E75',
    bgHover: 'hover:bg-[#1D9E75]/15',
    borderActive: 'border-[#1D9E75]',
    textHex: '#1D9E75',
    badgeBg: 'bg-[#1D9E75]/20',
    badgeText: 'text-[#34D399]',
  },
  {
    id: '10-25',
    label: '10 - 25x',
    sublabel: 'กลาง',
    color: '#EF9F27',
    bgHover: 'hover:bg-[#EF9F27]/15',
    borderActive: 'border-[#EF9F27]',
    textHex: '#EF9F27',
    badgeBg: 'bg-[#EF9F27]/20',
    badgeText: 'text-[#FBBF24]',
  },
  {
    id: '25-40',
    label: '25 - 40x',
    sublabel: 'แพง',
    color: '#E24B4A',
    bgHover: 'hover:bg-[#E24B4A]/15',
    borderActive: 'border-[#E24B4A]',
    textHex: '#E24B4A',
    badgeBg: 'bg-[#E24B4A]/20',
    badgeText: 'text-[#F87171]',
  },
  {
    id: '40plus',
    label: '40x+',
    sublabel: 'แพงมาก',
    color: '#993C1D',
    bgHover: 'hover:bg-[#993C1D]/15',
    borderActive: 'border-[#993C1D]',
    textHex: '#993C1D',
    badgeBg: 'bg-[#993C1D]/20',
    badgeText: 'text-[#FCA5A5]',
  },
];

export default function SectorPEDistribution({ points }: { points: PEPoint[] }) {
  // Separate null PE from numeric PE and categorize into 5 bins
  const { bins, noDataPoints, totalWithData } = useMemo(() => {
    if (!points || points.length === 0) {
      return {
        bins: BINS_CONFIG.map((b) => ({ ...b, items: [] as PEPoint[] })),
        noDataPoints: [] as PEPoint[],
        totalWithData: 0,
      };
    }

    const noData: PEPoint[] = [];
    const itemsByBin: Record<string, PEPoint[]> = {
      loss: [],
      '0-10': [],
      '10-25': [],
      '25-40': [],
      '40plus': [],
    };

    for (const p of points) {
      if (p.pe === null || p.pe === undefined) {
        noData.push(p);
      } else if (p.pe <= 0) {
        itemsByBin['loss'].push(p);
      } else if (p.pe <= 10) {
        itemsByBin['0-10'].push(p);
      } else if (p.pe <= 25) {
        itemsByBin['10-25'].push(p);
      } else if (p.pe <= 40) {
        itemsByBin['25-40'].push(p);
      } else {
        itemsByBin['40plus'].push(p);
      }
    }

    // Sort items within each bin (by PE ascending, except loss by ticker)
    for (const key of Object.keys(itemsByBin)) {
      if (key === 'loss') {
        itemsByBin[key].sort((a, b) => a.ticker.localeCompare(b.ticker));
      } else {
        itemsByBin[key].sort((a, b) => (a.pe ?? 0) - (b.pe ?? 0));
      }
    }

    const compiledBins = BINS_CONFIG.map((b) => ({
      ...b,
      items: itemsByBin[b.id] || [],
    }));

    const totalCount = points.length - noData.length;

    return {
      bins: compiledBins,
      noDataPoints: noData.sort((a, b) => a.ticker.localeCompare(b.ticker)),
      totalWithData: totalCount,
    };
  }, [points]);

  // Max count in any single bin to scale bar width
  const maxBinCount = useMemo(() => {
    const counts = bins.map((b) => b.items.length);
    return Math.max(...counts, 1);
  }, [bins]);

  // Default selected bin: first non-empty bin or '0-10'
  const defaultBinId = useMemo(() => {
    const nonFav = bins.find((b) => b.items.length > 0);
    return nonFav ? nonFav.id : '0-10';
  }, [bins]);

  const [selectedBinId, setSelectedBinId] = useState<string | null>(null);

  // Active bin state fallback to default if not manually toggled
  const activeBinId = selectedBinId ?? defaultBinId;
  const activeBin = bins.find((b) => b.id === activeBinId) || bins[0];

  return (
    <div className="space-y-4">
      {/* Header Summary */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <span className="font-bold text-white/80 mr-1">การกระจายตัว P/E (Histogram):</span>
          <span className="px-2.5 py-1 rounded-lg bg-white/[0.05] border border-white/10 text-white/70 font-semibold">
            ประเมินได้: {totalWithData} ตัว
          </span>
          {noDataPoints.length > 0 && (
            <span className="px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/[0.08] text-white/40 font-medium">
              ไม่มีข้อมูล P/E: {noDataPoints.length} ตัว
            </span>
          )}
        </div>
        <span className="text-[11px] text-white/40">
          💡 คลิกที่แท่ง Histogram เพื่อดูรายชื่อหุ้นในแต่ละกลุ่ม P/E
        </span>
      </div>

      {/* Main Histogram Bars */}
      <div className="bg-[#13161e] border border-white/[0.08] rounded-xl p-4 sm:p-5 space-y-3">
        {bins.map((bin) => {
          const count = bin.items.length;
          const pctOfMax = (count / maxBinCount) * 100;
          const isSelected = activeBinId === bin.id;

          return (
            <div
              key={bin.id}
              onClick={() => setSelectedBinId(bin.id)}
              className={`group cursor-pointer rounded-xl p-2.5 sm:p-3 transition-all duration-200 border ${
                isSelected
                  ? `bg-white/[0.05] ${bin.borderActive} shadow-lg`
                  : 'bg-white/[0.015] border-white/[0.05] hover:bg-white/[0.03] hover:border-white/10'
              }`}
            >
              <div className="flex items-center gap-3">
                {/* Bin Label */}
                <div className="w-28 sm:w-32 flex-shrink-0 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: bin.color }}
                    />
                    <span className="text-[12px] sm:text-[13px] font-bold text-white/90">
                      {bin.label}
                    </span>
                  </div>
                  <span
                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${bin.badgeBg} ${bin.badgeText}`}
                  >
                    {bin.sublabel}
                  </span>
                </div>

                {/* Bar Area */}
                <div className="flex-1 h-7 bg-white/[0.03] rounded-lg overflow-hidden relative flex items-center px-1">
                  <div
                    className="h-5 rounded-md transition-all duration-500 relative group-hover:brightness-110"
                    style={{
                      width: count > 0 ? `${Math.max(pctOfMax, 3)}%` : '0%',
                      backgroundColor: bin.color,
                      opacity: isSelected ? 0.95 : 0.7,
                    }}
                  />
                  {/* Stock count inside/beside bar */}
                  <span className="ml-2 text-[12px] font-mono font-bold text-white/80">
                    {count} <span className="text-[10px] font-normal text-white/40">ตัว</span>
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Drill-down Section: Stock Chips for Selected Bin */}
      {activeBin && (
        <div className="bg-[#13161e] border border-white/[0.08] rounded-xl p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
            <div className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: activeBin.color }}
              />
              <h4 className="text-[14px] font-bold text-white">
                หุ้นกลุ่ม P/E {activeBin.label} ({activeBin.sublabel})
              </h4>
              <span
                className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-full ${activeBin.badgeBg} ${activeBin.badgeText}`}
              >
                {activeBin.items.length} ตัว
              </span>
            </div>
            <span className="text-[11px] text-white/35">เรียงตามค่า P/E (น้อย ➔ มาก)</span>
          </div>

          {activeBin.items.length === 0 ? (
            <div className="py-6 text-center text-[12.5px] text-white/40">
              ไม่มีหุ้นอยู่ในช่วง P/E นี้
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 pt-1">
              {activeBin.items.map((item) => (
                <Link
                  key={item.ticker}
                  href={`/stock/${item.ticker}`}
                  className="group flex items-center gap-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/20 px-3 py-1.5 rounded-xl transition-all duration-150 shadow-sm"
                >
                  <span className="text-[12.5px] font-extrabold text-white group-hover:text-emerald-400 transition-colors">
                    {item.ticker}
                  </span>
                  <span
                    className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded bg-black/40"
                    style={{ color: activeBin.textHex }}
                  >
                    {item.pe !== null && item.pe <= 0
                      ? 'ขาดทุน'
                      : `${item.pe?.toFixed(1)}x`}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* N/A Zone (No PE Data: pe === null) */}
      {noDataPoints.length > 0 && (
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-bold text-white/60 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-white/40" />
              โซน N/A — หุ้นไม่มีข้อมูล P/E: {noDataPoints.length} ตัว
            </span>
            <span className="text-[11px] text-white/35">
              ไม่นำมาจัดกลุ่ม Histogram
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {noDataPoints.map((item) => (
              <Link
                key={item.ticker}
                href={`/stock/${item.ticker}`}
                className="bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.07] px-2.5 py-1 rounded-lg text-[11px] flex items-center gap-1.5 transition-colors"
              >
                <span className="font-bold text-white/70">{item.ticker}</span>
                <span className="text-white/35 text-[10px]">(ไม่มีข้อมูล PE)</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
