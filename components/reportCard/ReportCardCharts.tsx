'use client';

// SVG charts for /report-card/[scan]. Drawn at the container's real pixel width
// (ResizeObserver) so labels stay 12px on a phone instead of shrinking with a viewBox.
// Colours: green/red only for returns, the scan colour for points/lines, white alphas elsewhere.

import { useEffect, useRef, useState } from 'react';
import { MonthRow, NEG, POS, FLAT_COLOR, fmtMonth, fmtPct, isNum } from '@/lib/reportCard';

const GRID = 'rgba(255,255,255,0.06)';
const AXIS = 'rgba(255,255,255,0.18)';
const MUTED = 'rgba(255,255,255,0.45)';
const LABEL = 'rgba(255,255,255,0.7)';
const FS = 12;

function useWidth<T extends HTMLElement>(fallback = 520) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setW(Math.max(260, Math.round(el.clientWidth)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/* ---------- กำไรที่หลุดมือ: MAE → ผลตอนขาย → MFE ---------- */
export function GivebackRange({ mae, avg, mfe }: { mae: number; avg: number; mfe: number }) {
  const lo = Math.min(mae, avg, -1);
  const hi = Math.max(mfe, avg, 1);
  const pad = (hi - lo) * 0.12;
  const L = lo - pad;
  const H = hi + pad;
  const p = (v: number) => ((v - L) / (H - L)) * 100;
  const marker = (v: number, label: string, color: string, bold = false) => (
    <div className="absolute -translate-x-1/2 text-center whitespace-nowrap" style={{ left: `${p(v)}%`, top: 0 }}>
      <span className={`text-[12px] tabular-nums ${bold ? 'font-semibold text-white' : ''}`} style={bold ? undefined : { color }}>
        {label}
      </span>
      <div className="w-3 h-3 rounded-full mx-auto mt-2.5 border-2 border-[#13161e]" style={{ backgroundColor: color }} />
    </div>
  );
  return (
    <div
      className="relative h-[54px] my-2 mx-6"
      role="img"
      aria-label={`ลงต่ำสุดเฉลี่ย ${fmtPct(mae)} ผลตอนขาย ${fmtPct(avg)} ขึ้นสูงสุดเฉลี่ย ${fmtPct(mfe)}`}
    >
      <div className="absolute left-0 right-0 h-[2px]" style={{ top: 24, background: AXIS }} />
      <div className="absolute h-[14px] rounded-full" style={{ top: 18, left: `${p(mae)}%`, width: `${p(0) - p(mae)}%`, background: `${NEG}59` }} />
      <div className="absolute h-[14px] rounded-full" style={{ top: 18, left: `${p(0)}%`, width: `${p(mfe) - p(0)}%`, background: `${POS}4d` }} />
      <div className="absolute w-px" style={{ top: 12, height: 26, left: `${p(0)}%`, background: MUTED }} />
      {marker(mae, fmtPct(mae), NEG)}
      {marker(avg, `ขาย ${fmtPct(avg)}`, '#ffffff', true)}
      {marker(mfe, fmtPct(mfe), POS)}
    </div>
  );
}

/* ---------- กราฟจุด MFE เทียบผลตอนขาย ---------- */
export function MfeScatter({ points, color, mfeLine }: { points: [number, number][]; color: string; mfeLine: number }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const Hh = 300;
  const m = { l: 44, r: 12, t: 14, b: 40 };
  const xs = points.map(p => p[0]);
  const ys = points.map(p => p[1]);
  const xmax = Math.min(30, Math.max(5, ...xs));
  const ymin = Math.max(-25, Math.min(-5, ...ys));
  const ymax = Math.min(30, Math.max(5, ...ys));
  const X = (v: number) => m.l + (Math.min(Math.max(v, 0), xmax) / xmax) * (W - m.l - m.r);
  const Y = (v: number) => m.t + ((ymax - Math.max(ymin, Math.min(ymax, v))) / (ymax - ymin)) * (Hh - m.t - m.b);
  const xStep = xmax > 15 ? 10 : 5;
  const yStep = ymax - ymin > 30 ? 10 : 5;
  const xTicks: number[] = [];
  for (let v = 0; v <= xmax; v += xStep) xTicks.push(v);
  const yTicks: number[] = [];
  for (let v = Math.ceil(ymin / yStep) * yStep; v <= ymax; v += yStep) yTicks.push(v);
  const d = Math.min(xmax, ymax);
  return (
    <div ref={ref} className="w-full">
      <svg width={W} height={Hh} role="img" aria-label="กราฟจุด ขึ้นสูงสุดระหว่างถือ เทียบผลตอนขาย" className="block">
        <rect x={X(mfeLine)} y={Y(0)} width={Math.max(0, W - m.r - X(mfeLine))} height={Math.max(0, Hh - m.b - Y(0))} fill={NEG} fillOpacity={0.09} />
        <text x={W - m.r - 6} y={Hh - m.b - 8} fontSize={FS} fill={NEG} textAnchor="end">
          เคยกำไร +{mfeLine}% ขึ้นไป แต่ขายไม่กำไร
        </text>
        {xTicks.map(v => (
          <g key={`x${v}`}>
            <line x1={X(v)} x2={X(v)} y1={m.t} y2={Hh - m.b} stroke={GRID} />
            <text x={X(v)} y={Hh - m.b + 16} fontSize={FS} fill={MUTED} textAnchor="middle">{v}%</text>
          </g>
        ))}
        {yTicks.map(v => (
          <g key={`y${v}`}>
            <line x1={m.l} x2={W - m.r} y1={Y(v)} y2={Y(v)} stroke={v === 0 ? AXIS : GRID} />
            <text x={m.l - 6} y={Y(v) + 4} fontSize={FS} fill={MUTED} textAnchor="end">{v}%</text>
          </g>
        ))}
        <line x1={X(0)} y1={Y(0)} x2={X(d)} y2={Y(d)} stroke={MUTED} strokeDasharray="3 4" />
        {points.map((p, i) => (
          <circle key={i} cx={X(p[0])} cy={Y(p[1])} r={3} fill={color} fillOpacity={0.45} />
        ))}
        <text x={W - m.r} y={m.t + 12} fontSize={FS} fill={MUTED} textAnchor="end">เส้นประ = ขายได้ที่จุดสูงสุดพอดี</text>
        <text x={m.l} y={Hh - 4} fontSize={FS} fill={MUTED}>แนวนอน: ขึ้นสูงสุดระหว่างถือ · แนวตั้ง: ผลตอนขาย</text>
      </svg>
    </div>
  );
}

/* ---------- การกระจายผลตอบแทน ---------- */
export function ReturnHistogram({ counts, labels }: { counts: number[]; labels: string[] }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const Hh = 300;
  const n = counts.length;
  const narrow = (W - 16) / n < 58;
  const m = { l: narrow ? 30 : 8, r: 8, t: 20, b: 52 };
  const mx = Math.max(1, ...counts);
  const bw = (W - m.l - m.r) / n;
  const zeroIdx = labels.indexOf('0');
  return (
    <div ref={ref} className="w-full">
      <svg width={W} height={Hh} role="img" aria-label="จำนวนไม้ในแต่ละช่วงผลตอบแทน" className="block">
        {counts.map((c, i) => {
          const h = (c / mx) * (Hh - m.t - m.b);
          const x = m.l + i * bw;
          const y = Hh - m.b - h;
          const col = i < zeroIdx ? NEG : i === zeroIdx ? FLAT_COLOR : POS;
          return (
            <g key={i}>
              <rect x={x + 2} y={y} width={Math.max(1, bw - 4)} height={h} rx={2} fill={col} fillOpacity={i === zeroIdx ? 1 : 0.8} />
              <text x={x + bw / 2} y={y - 5} fontSize={FS} fill={LABEL} textAnchor="middle">{c}</text>
              <text
                x={x + bw / 2}
                y={Hh - m.b + 16}
                fontSize={FS}
                fill={MUTED}
                textAnchor={narrow ? 'end' : 'middle'}
                transform={narrow ? `rotate(-35 ${x + bw / 2} ${Hh - m.b + 16})` : undefined}
              >
                {labels[i]}
              </text>
            </g>
          );
        })}
        <line x1={m.l} x2={W - m.r} y1={Hh - m.b} y2={Hh - m.b} stroke={AXIS} />
      </svg>
    </div>
  );
}

/* ---------- ผลรายเดือน (แท่ง) + ผลรวมสะสม (เส้น แกนแยกใต้แท่ง) ---------- */
export function MonthlyChart({ months, color }: { months: MonthRow[]; color: string }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const ms = months.filter(x => isNum(x.avg_return_pct) && isNum(x.sum_return_pct));
  if (ms.length === 0) return null;
  const m = { l: 40, r: 56, t: 22 };
  const bh = 150;
  const gap = 46;
  const lh = 80;
  const Hh = m.t + bh + gap + lh + 24;
  const n = ms.length;
  const amx = Math.max(1, ...ms.map(x => Math.abs(x.avg_return_pct as number)));
  let cum = 0;
  const cs = ms.map(x => (cum += x.sum_return_pct as number));
  const cmn = Math.min(0, ...cs);
  const cmx = Math.max(0, ...cs);
  const bw = (W - m.l - m.r) / n;
  const mid = m.t + bh / 2;
  const half = bh / 2;
  const ly0 = m.t + bh + gap;
  const CY = (v: number) => ly0 + ((cmx - v) / (cmx - cmn || 1)) * lh;
  const cx = (i: number) => m.l + i * bw + bw / 2;
  const line = cs.map((c, i) => `${i ? 'L' : 'M'}${cx(i)},${CY(c)}`).join('');
  const last = cs[n - 1];
  const twoLine = bw < 70;
  return (
    <div ref={ref} className="w-full">
      <svg width={W} height={Hh} role="img" aria-label="ผลเฉลี่ยต่อไม้รายเดือน และผลรวมสะสม" className="block">
        <line x1={m.l} x2={W - m.r} y1={mid} y2={mid} stroke={AXIS} />
        {ms.map((x, i) => {
          const v = x.avg_return_pct as number;
          const h = (Math.abs(v) / amx) * half * 0.68;
          const xx = m.l + i * bw;
          return (
            <g key={x.month}>
              <rect x={xx + bw * 0.22} y={v >= 0 ? mid - h : mid} width={bw * 0.56} height={Math.max(h, 1)} rx={2} fill={v > 0 ? POS : v < 0 ? NEG : FLAT_COLOR} fillOpacity={0.8} />
              <text x={cx(i)} y={v >= 0 ? mid - h - 6 : mid + h + 14} fontSize={FS} fill={LABEL} textAnchor="middle">{fmtPct(v)}</text>
              <text x={cx(i)} y={m.t + bh + 16} fontSize={FS} fill={LABEL} textAnchor="middle">
                {twoLine ? fmtMonth(x.month) : `${fmtMonth(x.month)} · ${x.n} ไม้`}
              </text>
              {twoLine && (
                <text x={cx(i)} y={m.t + bh + 30} fontSize={FS} fill={MUTED} textAnchor="middle">{x.n} ไม้</text>
              )}
            </g>
          );
        })}
        <text x={m.l} y={ly0 - 8} fontSize={FS} fill={MUTED}>ผลรวมสะสม</text>
        <line x1={m.l} x2={W - m.r} y1={CY(0)} y2={CY(0)} stroke={AXIS} strokeDasharray="2 3" />
        <text x={m.l - 6} y={CY(0) + 4} fontSize={FS} fill={MUTED} textAnchor="end">0</text>
        <path d={line} fill="none" stroke={color} strokeWidth={2.5} />
        {cs.map((c, i) => (
          <circle key={i} cx={cx(i)} cy={CY(c)} r={3.5} fill={color} />
        ))}
        <text x={cx(n - 1) + 10} y={CY(last) + 4} fontSize={FS} fill={color}>
          {`${last > 0 ? '+' : ''}${last.toFixed(1)}%`}
        </text>
      </svg>
    </div>
  );
}
