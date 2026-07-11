'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

export interface ScatterPoint {
  ticker: string;
  rs: number;
  distFromHigh: number; // 0 = ที่ 52W high พอดี, ยิ่งมากยิ่งห่างจาก high
  growthYoy: number | null;
  growthQoq: number | null;
}

// เขียว = โต QoQ+YoY, ม่วง = โตอย่างเดียว, แดง = ไม่โต, เทา = ไม่มีข้อมูล growth
// (NaN ของ Yahoo ต้องไม่ถูกนับเป็น "ไม่โต" — เทาแยกจากแดงเสมอ)
function growthColor(yoy: number | null, qoq: number | null): string {
  if (yoy == null || qoq == null) return '#6b7280';
  const yoyGrow = yoy > 0;
  const qoqGrow = qoq > 0;
  if (yoyGrow && qoqGrow) return '#1D9E75';
  if (yoyGrow || qoqGrow) return '#AA00FF';
  return '#E24B4A';
}

const GOOD_RS_MIN = 80;
const GOOD_DIST_MAX = 10;
const PAD = { top: 16, right: 16, bottom: 32, left: 40 };
const W = 640;
const H = 340;

export default function GrowthScatter({ points }: { points: ScatterPoint[] }) {
  const router = useRouter();
  const [hover, setHover] = useState<ScatterPoint | null>(null);

  const { xMin, xMax, yMax, plotted } = useMemo(() => {
    if (points.length === 0) return { xMin: 0, xMax: 100, yMax: 10, plotted: [] as (ScatterPoint & { x: number; y: number })[] };

    const rsValues = points.map(p => p.rs);
    const distValues = points.map(p => p.distFromHigh);
    const rawXMin = Math.min(...rsValues);
    const rawXMax = Math.max(...rsValues);
    const xPad = Math.max((rawXMax - rawXMin) * 0.08, 2);
    const xMin = Math.max(0, Math.floor(rawXMin - xPad));
    const xMax = Math.ceil(rawXMax + xPad);
    const yMax = Math.max(Math.ceil(Math.max(...distValues) * 1.08), GOOD_DIST_MAX + 5);

    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;
    const plotted = points.map(p => ({
      ...p,
      x: PAD.left + ((p.rs - xMin) / (xMax - xMin || 1)) * plotW,
      y: PAD.top + plotH - (p.distFromHigh / (yMax || 1)) * plotH,
    }));

    return { xMin, xMax, yMax, plotted };
  }, [points]);

  if (points.length === 0) {
    return <div className="py-16 text-center text-[13px] text-white/25">ไม่พบหุ้นที่ตรงกับ filter</div>;
  }

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const zoneX = PAD.left + ((GOOD_RS_MIN - xMin) / (xMax - xMin || 1)) * plotW;
  const zoneY = PAD.top + plotH - (GOOD_DIST_MAX / (yMax || 1)) * plotH;
  const zoneVisible = GOOD_RS_MIN <= xMax && GOOD_DIST_MAX <= yMax;

  const xTicks = 5;
  const yTicks = 4;

  return (
    <div className="relative w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 480 }}>
        {/* grid */}
        {Array.from({ length: yTicks + 1 }).map((_, i) => {
          const v = (yMax / yTicks) * i;
          const y = PAD.top + plotH - (v / (yMax || 1)) * plotH;
          return (
            <g key={`y${i}`}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke="rgba(255,255,255,0.05)" />
              <text x={PAD.left - 8} y={y + 3} textAnchor="end" fontSize="9" fill="rgba(255,255,255,0.3)">
                {v.toFixed(0)}%
              </text>
            </g>
          );
        })}
        {Array.from({ length: xTicks + 1 }).map((_, i) => {
          const v = xMin + ((xMax - xMin) / xTicks) * i;
          const x = PAD.left + (i / xTicks) * plotW;
          return (
            <g key={`x${i}`}>
              <line x1={x} x2={x} y1={PAD.top} y2={H - PAD.bottom} stroke="rgba(255,255,255,0.05)" />
              <text x={x} y={H - PAD.bottom + 14} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.3)">
                {v.toFixed(0)}
              </text>
            </g>
          );
        })}

        {/* good zone: RS สูง + ใกล้ high (มุมขวาล่าง) */}
        {zoneVisible && (
          <g>
            <rect
              x={Math.min(zoneX, W - PAD.right)}
              y={PAD.top}
              width={Math.max(W - PAD.right - zoneX, 0)}
              height={Math.max(zoneY - PAD.top, 0)}
              fill="rgba(29,158,117,0.08)"
              stroke="rgba(29,158,117,0.25)"
              strokeDasharray="3 3"
            />
            <text
              x={W - PAD.right - 4}
              y={PAD.top + 12}
              textAnchor="end"
              fontSize="9"
              fill="rgba(29,158,117,0.7)"
            >
              โซนน่าสนใจ: RS สูง + ใกล้ high
            </text>
          </g>
        )}

        {/* axis labels */}
        <text x={PAD.left + plotW / 2} y={H - 4} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.35)">
          RS →
        </text>
        <text
          x={12}
          y={PAD.top + plotH / 2}
          textAnchor="middle"
          fontSize="10"
          fill="rgba(255,255,255,0.35)"
          transform={`rotate(-90, 12, ${PAD.top + plotH / 2})`}
        >
          ระยะห่าง 52WH %
        </text>

        {/* points */}
        {plotted.map(p => (
          <circle
            key={p.ticker}
            cx={p.x}
            cy={p.y}
            r={hover?.ticker === p.ticker ? 6 : 4}
            fill={growthColor(p.growthYoy, p.growthQoq)}
            fillOpacity={0.85}
            stroke="#0b0d12"
            strokeWidth={1}
            className="cursor-pointer transition-all"
            onMouseEnter={() => setHover(p)}
            onMouseLeave={() => setHover(prev => (prev?.ticker === p.ticker ? null : prev))}
            onClick={() => router.push(`/stock/${p.ticker}`)}
          />
        ))}
      </svg>

      {hover && (
        <div className="pointer-events-none absolute top-2 left-2 rounded-lg border border-white/[0.1] bg-[#0b0d12]/95 px-2.5 py-2 text-[11px] shadow-lg">
          <div className="font-bold text-white mb-1">{hover.ticker}</div>
          <div className="space-y-0.5 text-white/70 tabular-nums">
            <div>RS: {hover.rs}</div>
            <div>ห่างจาก 52WH: {hover.distFromHigh.toFixed(1)}%</div>
            <div>
              Growth YoY/QoQ:{' '}
              {hover.growthYoy != null ? `${hover.growthYoy.toFixed(1)}%` : '-'} /{' '}
              {hover.growthQoq != null ? `${hover.growthQoq.toFixed(1)}%` : '-'}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-4 mt-2 px-1 flex-wrap">
        {[
          { color: '#1D9E75', label: 'โต QoQ+YoY' },
          { color: '#AA00FF', label: 'โตอย่างใดอย่างหนึ่ง' },
          { color: '#E24B4A', label: 'ไม่โต' },
          { color: '#6b7280', label: 'ไม่มีข้อมูล growth' },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: l.color }} />
            <span className="text-[10px] text-white/40">{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
