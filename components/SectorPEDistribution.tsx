'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

export interface PEPoint {
  ticker: string;
  pe: number | null;
  roe?: number | null;
}

interface ValidPoint {
  ticker: string;
  pe: number;
}

interface InvalidPoint {
  ticker: string;
  reason: string;
}

export default function SectorPEDistribution({ points }: { points: PEPoint[] }) {
  const [hovered, setHovered] = useState<ValidPoint | null>(null);

  // Controls
  const [threshold, setThreshold] = useState<number>(20);
  const [sortByPE, setSortByPE] = useState<boolean>(true);
  const [customThresholdSet, setCustomThresholdSet] = useState<boolean>(false);

  // Process data into valid positive PE vs N/A PE
  const { validPoints, invalidPoints, medianPE, maxPE } = useMemo(() => {
    if (!points || points.length === 0) return { validPoints: [], invalidPoints: [], medianPE: 20, maxPE: 50 };

    const valid: ValidPoint[] = [];
    const invalid: InvalidPoint[] = [];

    for (const r of points) {
      if (r.pe === null || r.pe === undefined) {
        invalid.push({ ticker: r.ticker, reason: 'ไม่มีข้อมูล PE' });
      } else if (r.pe <= 0) {
        invalid.push({ ticker: r.ticker, reason: `PE ${r.pe.toFixed(2)}x (ขาดทุน)` });
      } else {
        valid.push({ ticker: r.ticker, pe: r.pe });
      }
    }

    // Calculate median PE
    let med = 20;
    let maxP = 50;
    if (valid.length > 0) {
      const sortedVals = [...valid.map((v) => v.pe)].sort((a, b) => a - b);
      const mid = Math.floor(sortedVals.length / 2);
      med = sortedVals.length % 2 !== 0
        ? sortedVals[mid]
        : (sortedVals[mid - 1] + sortedVals[mid]) / 2;
      med = Math.round(med * 10) / 10;
      maxP = Math.max(...sortedVals);
    }

    return { validPoints: valid, invalidPoints: invalid, medianPE: med, maxPE: maxP };
  }, [points]);

  // Set default threshold to median PE once loaded if user hasn't manually adjusted it
  useEffect(() => {
    if (validPoints.length > 0 && !customThresholdSet) {
      setThreshold(medianPE > 0 ? medianPE : 20);
    }
  }, [validPoints, medianPE, customThresholdSet]);

  // Display points ordered according to sortByPE
  const displayPoints = useMemo(() => {
    const list = [...validPoints];
    if (sortByPE) {
      list.sort((a, b) => a.pe - b.pe);
    } else {
      list.sort((a, b) => a.ticker.localeCompare(b.ticker));
    }
    return list;
  }, [validPoints, sortByPE]);

  // Under & Over counts
  const underCount = useMemo(
    () => validPoints.filter((p) => p.pe <= threshold).length,
    [validPoints, threshold]
  );
  const overCount = useMemo(
    () => validPoints.filter((p) => p.pe > threshold).length,
    [validPoints, threshold]
  );



  // Chart dimensions & scaling
  const chartHeight = 320;
  const padding = { top: 24, right: 24, bottom: 48, left: 45 };
  const effectiveMaxY = Math.max(Math.ceil(maxPE * 1.15), Math.ceil(threshold * 1.2), 30);

  // Handle threshold slider change
  const handleSliderChange = (val: number) => {
    setThreshold(val);
    setCustomThresholdSet(true);
  };

  return (
    <div className="space-y-4">
      {/* Controls & Summary Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
        {/* Under/Over Counters */}
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <span className="font-bold text-white/70 mr-1">การประเมินมูลค่า (Valuation):</span>
          <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-semibold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            ถูก (P/E ≤ {threshold}x): {underCount} ตัว
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-400 font-semibold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-400" />
            แพง (P/E &gt; {threshold}x): {overCount} ตัว
          </span>
          {invalidPoints.length > 0 && (
            <span className="px-2.5 py-1 rounded-lg bg-white/[0.05] border border-white/[0.1] text-white/50 font-medium">
              N/A (ขาดทุน/ไม่มี PE): {invalidPoints.length} ตัว
            </span>
          )}
        </div>

        {/* Interactive Controls (Threshold Slider + Sort Toggle) */}
        <div className="flex flex-wrap items-center gap-4">
          {/* Threshold Slider */}
          <div className="flex items-center gap-3 bg-black/30 border border-white/[0.08] px-3.5 py-1.5 rounded-xl">
            <label className="text-[11.5px] font-bold text-white/70 whitespace-nowrap">
              Threshold P/E: <span className="text-emerald-400 font-mono text-[13px]">{threshold}x</span>
            </label>
            <input
              type="range"
              min="5"
              max={Math.max(Math.ceil(maxPE), 50)}
              step="0.5"
              value={threshold}
              onChange={(e) => handleSliderChange(parseFloat(e.target.value))}
              className="w-28 sm:w-36 accent-emerald-400 cursor-pointer h-1.5 bg-white/20 rounded-lg"
            />
            {medianPE > 0 && (
              <button
                onClick={() => handleSliderChange(medianPE)}
                className="text-[10px] font-semibold bg-white/10 hover:bg-white/20 text-white/80 px-2 py-0.5 rounded transition-colors"
                title="ตั้งค่า Threshold เท่ากับค่า Median ของกลุ่ม"
              >
                Median ({medianPE}x)
              </button>
            )}
          </div>

          {/* Sort Toggle */}
          <div className="flex items-center gap-2 bg-black/30 border border-white/[0.08] p-1 rounded-xl">
            <button
              onClick={() => setSortByPE(true)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                sortByPE ? 'bg-white/15 text-white shadow-sm' : 'text-white/40 hover:text-white/70'
              }`}
            >
              เรียงตาม PE
            </button>
            <button
              onClick={() => setSortByPE(false)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                !sortByPE ? 'bg-white/15 text-white shadow-sm' : 'text-white/40 hover:text-white/70'
              }`}
            >
              เรียงชื่อ Ticker
            </button>
          </div>
        </div>
      </div>

      {/* Main Scatter Chart */}
      {displayPoints.length === 0 ? (
        <div className="py-12 text-center text-white/40 text-[13px] bg-white/[0.02] border border-white/[0.06] rounded-xl">
          ไม่มีหุ้นที่มีค่า P/E &gt; 0 ในกลุ่มนี้
        </div>
      ) : (
        <div className="bg-[#13161e] border border-white/[0.08] rounded-xl p-4 overflow-x-auto relative">
          <div className="min-w-[600px] w-full" style={{ height: `${chartHeight}px` }}>
            <svg
              className="w-full h-full overflow-visible"
              viewBox={`0 0 800 ${chartHeight}`}
              preserveAspectRatio="none"
            >
              {/* Y-Axis Gridlines & Labels */}
              {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                const val = Math.round(effectiveMaxY * ratio);
                const yPos = chartHeight - padding.bottom - ratio * (chartHeight - padding.top - padding.bottom);
                return (
                  <g key={ratio}>
                    <line
                      x1={padding.left}
                      y1={yPos}
                      x2={800 - padding.right}
                      y2={yPos}
                      stroke="rgba(255, 255, 255, 0.06)"
                      strokeDasharray="3 3"
                    />
                    <text
                      x={padding.left - 8}
                      y={yPos + 4}
                      fill="rgba(255, 255, 255, 0.35)"
                      fontSize="10"
                      textAnchor="end"
                      fontFamily="monospace"
                    >
                      {val}x
                    </text>
                  </g>
                );
              })}

              {/* Threshold Reference Line */}
              {threshold <= effectiveMaxY && (() => {
                const threshY =
                  chartHeight -
                  padding.bottom -
                  (threshold / effectiveMaxY) * (chartHeight - padding.top - padding.bottom);
                return (
                  <g>
                    <line
                      x1={padding.left}
                      y1={threshY}
                      x2={800 - padding.right}
                      y2={threshY}
                      stroke="#10B981"
                      strokeWidth="1.5"
                      strokeDasharray="6 4"
                    />
                    <rect
                      x={800 - padding.right - 95}
                      y={threshY - 11}
                      width="95"
                      height="18"
                      rx="4"
                      fill="#10B981"
                      fillOpacity="0.2"
                      stroke="#10B981"
                      strokeWidth="0.8"
                    />
                    <text
                      x={800 - padding.right - 47.5}
                      y={threshY + 2}
                      fill="#34D399"
                      fontSize="9.5"
                      fontWeight="bold"
                      textAnchor="middle"
                    >
                      Threshold: {threshold}x
                    </text>
                  </g>
                );
              })()}

              {/* Data Points & X-Axis Labels */}
              {displayPoints.map((pt, idx) => {
                const totalCount = displayPoints.length;
                const plotWidth = 800 - padding.left - padding.right;
                const step = totalCount > 1 ? plotWidth / (totalCount - 1) : plotWidth / 2;
                const cx = totalCount > 1 ? padding.left + idx * step : padding.left + plotWidth / 2;

                const peClamped = Math.min(pt.pe, effectiveMaxY);
                const cy =
                  chartHeight -
                  padding.bottom -
                  (peClamped / effectiveMaxY) * (chartHeight - padding.top - padding.bottom);

                const isCheap = pt.pe <= threshold;
                const isHovered = hovered?.ticker === pt.ticker;
                const color = isCheap ? '#10B981' : '#F43F5E';

                return (
                  <g key={pt.ticker} className="cursor-pointer group">
                    {/* Vertical guideline on hover */}
                    {isHovered && (
                      <line
                        x1={cx}
                        y1={padding.top}
                        x2={cx}
                        y2={chartHeight - padding.bottom}
                        stroke={color}
                        strokeWidth="1"
                        strokeDasharray="2 2"
                        opacity="0.5"
                      />
                    )}

                    {/* Stem connection line to X-axis */}
                    <line
                      x1={cx}
                      y1={cy}
                      x2={cx}
                      y2={chartHeight - padding.bottom}
                      stroke={color}
                      strokeWidth="1"
                      opacity={isHovered ? 0.6 : 0.2}
                    />

                    {/* Point Circle */}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={isHovered ? 7 : 5}
                      fill={color}
                      stroke="#13161e"
                      strokeWidth="2"
                      className="transition-all duration-150"
                      onMouseEnter={() => setHovered(pt)}
                      onMouseLeave={() => setHovered(null)}
                    />

                    {/* Glowing outer ring when hovered */}
                    {isHovered && (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={11}
                        fill="none"
                        stroke={color}
                        strokeWidth="1.5"
                        opacity="0.7"
                      />
                    )}

                    {/* Ticker Label under X-axis */}
                    <text
                      x={cx}
                      y={chartHeight - padding.bottom + 16}
                      fill={isHovered ? '#FFFFFF' : isCheap ? '#34D399' : '#FB7185'}
                      fontSize={totalCount > 30 ? '8.5' : '10'}
                      fontWeight={isHovered ? 'bold' : '500'}
                      textAnchor="middle"
                      transform={
                        totalCount > 20
                          ? `rotate(-35, ${cx}, ${chartHeight - padding.bottom + 16})`
                          : undefined
                      }
                      className="transition-colors"
                      onMouseEnter={() => setHovered(pt)}
                      onMouseLeave={() => setHovered(null)}
                    >
                      {pt.ticker}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Hover Tooltip Card */}
            {hovered && (
              <div
                className="absolute z-20 pointer-events-none bg-[#1c212d] border border-white/20 rounded-xl p-3 shadow-xl backdrop-blur-md"
                style={{
                  top: '16px',
                  right: '16px',
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-black text-white">{hovered.ticker}</span>
                  <span
                    className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                      hovered.pe <= threshold
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    }`}
                  >
                    {hovered.pe <= threshold ? 'ถูก (Under Threshold)' : 'แพง (Over Threshold)'}
                  </span>
                </div>
                <div className="mt-1.5 text-[12px] text-white/70 flex items-center gap-2 font-mono">
                  <span>P/E Ratio:</span>
                  <span className="text-[14px] font-bold text-white">{hovered.pe.toFixed(2)}x</span>
                </div>
                <div className="mt-1 text-[10.5px] text-white/40">
                  ส่วนต่างกับ Threshold: {(hovered.pe - threshold).toFixed(2)}x
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Section for Loss-making / N/A Stocks (ข้อควรระวัง: หุ้นขาดทุน/ไม่มีค่า PE) */}
      {invalidPoints.length > 0 && (
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-bold text-white/60 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400/70" />
              หุ้นที่แยกออกโซน N/A / ขาดทุน (ไม่มีค่า P/E หรือ P/E ≤ 0): {invalidPoints.length} ตัว
            </span>
            <span className="text-[11px] text-white/35">ไม่นำมาแสดงบนกราฟเพื่อไม่ให้สเกลเพี้ยน</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {invalidPoints.map((item) => (
              <div
                key={item.ticker}
                className="bg-white/[0.04] border border-white/[0.08] px-2.5 py-1 rounded-lg text-[11px] flex items-center gap-1.5"
              >
                <span className="font-bold text-white/80">{item.ticker}</span>
                <span className="text-white/40 text-[10px]">({item.reason})</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
