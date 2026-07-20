'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

interface RawPoint { ticker: string; pb: number | null; roe: number | null; }
interface Point { ticker: string; pb: number; roe: number; }

const PAD = { top: 16, right: 16, bottom: 32, left: 40 };
const W = 640;
const H = 360;

// Outlier bounds - a P/BV computed against near-zero book value can spike to
// absurd multiples, and a tiny equity base does the same to ROE%. Both would
// blow out the axis scale and make the rest of the sector unreadable.
const PB_MAX = 10;
const PB_MIN = 0;
const ROE_ABS_MAX = 100;

function linearRegression(points: Point[]): { a: number; b: number } | null {
  const n = points.length;
  if (n < 4) return null;
  const sumX = points.reduce((s, p) => s + p.roe, 0);
  const sumY = points.reduce((s, p) => s + p.pb, 0);
  const meanX = sumX / n;
  const meanY = sumY / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.roe - meanX) * (p.pb - meanY);
    den += (p.roe - meanX) ** 2;
  }
  if (den === 0) return null;
  const b = num / den;
  const a = meanY - b * meanX;
  return { a, b };
}

export default function SectorValuationScatter({ tickers }: { tickers: string[] }) {
  const router = useRouter();
  const [raw, setRaw] = useState<RawPoint[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [hover, setHover] = useState<Point | null>(null);

  useEffect(() => {
    if (tickers.length === 0) return;
    setLoading(true);
    setError(false);
    fetch(`/api/sector-fundamentals?tickers=${tickers.map(encodeURIComponent).join(',')}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(json => setRaw(json.data ?? []))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [tickers]);

  const { points, excludedCount, regression } = useMemo(() => {
    if (!raw) return { points: [] as Point[], excludedCount: 0, regression: null as { a: number; b: number } | null };
    const valid: Point[] = [];
    let excluded = 0;
    for (const r of raw) {
      if (r.pb == null || r.roe == null) { excluded++; continue; }
      if (r.pb <= PB_MIN || r.pb > PB_MAX || Math.abs(r.roe) > ROE_ABS_MAX) { excluded++; continue; }
      valid.push({ ticker: r.ticker, pb: r.pb, roe: r.roe });
    }
    return { points: valid, excludedCount: excluded, regression: linearRegression(valid) };
  }, [raw]);

  const { xMin, xMax, yMax, plotted, residualStd } = useMemo(() => {
    if (points.length === 0) {
      return { xMin: -10, xMax: 30, yMax: 5, plotted: [] as (Point & { x: number; y: number; residual: number; labelDy: number })[], residualStd: 0 };
    }
    const roeValues = points.map(p => p.roe);
    const pbValues = points.map(p => p.pb);
    const rawXMin = Math.min(...roeValues, 0);
    const rawXMax = Math.max(...roeValues);
    const xPad = Math.max((rawXMax - rawXMin) * 0.1, 2);
    const xMin = Math.floor(rawXMin - xPad);
    const xMax = Math.ceil(rawXMax + xPad);
    const yMax = Math.max(Math.ceil(Math.max(...pbValues) * 1.1 * 10) / 10, 1);

    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;

    const residuals = regression ? points.map(p => p.pb - (regression.a + regression.b * p.roe)) : points.map(() => 0);
    const meanResidual = residuals.reduce((s, v) => s + v, 0) / (residuals.length || 1);
    const residualStd = Math.sqrt(residuals.reduce((s, v) => s + (v - meanResidual) ** 2, 0) / (residuals.length || 1));

    const withXY = points
      .map((p, i) => ({
        ...p,
        x: PAD.left + ((p.roe - xMin) / (xMax - xMin || 1)) * plotW,
        y: PAD.top + plotH - (p.pb / (yMax || 1)) * plotH,
        residual: residuals[i],
      }))
      .sort((a, b) => a.x - b.x);

    // Basic label-collision avoidance: walk points in x order, alternate the
    // label above/below the marker, and add an extra vertical step whenever
    // this point's x sits close enough to the previous one that the two
    // ticker labels would otherwise overlap.
    let lastX = -Infinity;
    let step = 0;
    const plotted = withXY.map(p => {
      const close = p.x - lastX < 26;
      step = close ? step + 1 : 0;
      lastX = p.x;
      const dir = step % 2 === 0 ? -1 : 1;
      const labelDy = dir * (10 + Math.floor(step / 2) * 11);
      return { ...p, labelDy };
    });

    return { xMin, xMax, yMax, plotted, residualStd };
  }, [points, regression]);

  if (loading) {
    return <div className="py-16 text-center text-[13px] text-white/25">กำลังโหลดข้อมูล P/BV · ROE...</div>;
  }
  if (error) {
    return <div className="py-16 text-center text-[13px] text-white/25">ไม่สามารถโหลดข้อมูลได้</div>;
  }
  if (points.length === 0) {
    return <div className="py-16 text-center text-[13px] text-white/25">ไม่มีข้อมูล P/BV · ROE ที่ใช้ได้ในกลุ่มนี้</div>;
  }

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const xTicks = 5;
  const yTicks = 4;

  const regLine = regression
    ? {
        x1: PAD.left,
        y1: PAD.top + plotH - ((regression.a + regression.b * xMin) / (yMax || 1)) * plotH,
        x2: W - PAD.right,
        y2: PAD.top + plotH - ((regression.a + regression.b * xMax) / (yMax || 1)) * plotH,
      }
    : null;

  const undervaluedThreshold = -0.75 * residualStd;

  return (
    <div className="relative w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 480 }}>
        {Array.from({ length: yTicks + 1 }).map((_, i) => {
          const v = (yMax / yTicks) * i;
          const y = PAD.top + plotH - (v / (yMax || 1)) * plotH;
          return (
            <g key={`y${i}`}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke="rgba(255,255,255,0.05)" />
              <text x={PAD.left - 8} y={y + 3} textAnchor="end" fontSize="9" fill="rgba(255,255,255,0.3)">
                {v.toFixed(1)}x
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
                {v.toFixed(0)}%
              </text>
            </g>
          );
        })}

        <text x={PAD.left + plotW / 2} y={H - 4} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.35)">
          ROE (TTM %) →
        </text>
        <text
          x={12}
          y={PAD.top + plotH / 2}
          textAnchor="middle"
          fontSize="10"
          fill="rgba(255,255,255,0.35)"
          transform={`rotate(-90, 12, ${PAD.top + plotH / 2})`}
        >
          P/BV (เท่า) →
        </text>

        {regLine && (
          <line
            x1={regLine.x1} y1={Math.max(PAD.top, Math.min(H - PAD.bottom, regLine.y1))}
            x2={regLine.x2} y2={Math.max(PAD.top, Math.min(H - PAD.bottom, regLine.y2))}
            stroke="rgba(249,201,66,0.55)"
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />
        )}

        {plotted.map(p => {
          const isUndervalued = regression != null && p.residual <= undervaluedThreshold && p.residual < 0;
          const isHover = hover?.ticker === p.ticker;
          return (
            <g key={p.ticker}>
              <circle
                cx={p.x}
                cy={p.y}
                r={isHover ? 6 : isUndervalued ? 5 : 4}
                fill={isUndervalued ? '#1D9E75' : '#7F77DD'}
                fillOpacity={0.85}
                stroke="#0b0d12"
                strokeWidth={1}
                className="cursor-pointer transition-all"
                onMouseEnter={() => setHover(p)}
                onMouseLeave={() => setHover(prev => (prev?.ticker === p.ticker ? null : prev))}
                onClick={() => router.push(`/stock/${p.ticker}`)}
              />
              <text
                x={p.x}
                y={p.y + p.labelDy}
                textAnchor="middle"
                fontSize="8.5"
                fill={isUndervalued ? '#1D9E75' : 'rgba(255,255,255,0.45)'}
                className="pointer-events-none select-none"
              >
                {p.ticker}
              </text>
            </g>
          );
        })}
      </svg>

      {hover && (
        <div className="pointer-events-none absolute top-2 left-2 rounded-lg border border-white/[0.1] bg-[#0b0d12]/95 px-2.5 py-2 text-[11px] shadow-lg">
          <div className="font-bold text-white mb-1">{hover.ticker}</div>
          <div className="space-y-0.5 text-white/70 tabular-nums">
            <div>ROE: {hover.roe.toFixed(1)}%</div>
            <div>P/BV: {hover.pb.toFixed(2)}x</div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-4 mt-2 px-1 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: '#1D9E75' }} />
          <span className="text-[10px] text-white/40">ROE สูง แต่ P/BV ต่ำกว่าที่ควร (ใต้เส้นแนวโน้มมาก)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: '#7F77DD' }} />
          <span className="text-[10px] text-white/40">หุ้นทั่วไปในกลุ่ม</span>
        </div>
        {regression && (
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5" style={{ background: 'rgba(249,201,66,0.55)' }} />
            <span className="text-[10px] text-white/40">เส้นแนวโน้มของกลุ่ม</span>
          </div>
        )}
      </div>
      {excludedCount > 0 && (
        <p className="text-[10px] text-white/20 mt-1 px-1">
          ตัดออก {excludedCount} หุ้นที่ไม่มีข้อมูล หรือค่า P/BV·ROE ผิดปกติสุดขั้ว (P/BV ≤ 0 หรือ &gt; {PB_MAX}x, |ROE| &gt; {ROE_ABS_MAX}%)
        </p>
      )}
    </div>
  );
}
