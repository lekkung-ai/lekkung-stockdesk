// Small D+5 / D+10 / D+20 avg-return line for the /report-card overview cards (fixed-size SVG, server-safe).
import { HorizonMetric, isNum } from '@/lib/reportCard';

const H = ['5', '10', '20'];

export default function HorizonSpark({ horizons, color }: { horizons: Record<string, HorizonMetric>; color: string }) {
  const pts = H.map(h => {
    const v = horizons[h]?.avg_return_pct;
    return horizons[h]?.n > 0 && isNum(v) ? v : null;
  });
  const vals = pts.filter((v): v is number => v != null);
  if (vals.length === 0) return null;
  const mx = Math.max(1, ...vals.map(Math.abs));
  const x = (i: number) => 14 + i * 56;
  const y = (v: number) => 20 - (v / mx) * 14;
  let d = '';
  pts.forEach((v, i) => {
    if (v == null) return;
    d += `${d ? 'L' : 'M'}${x(i)},${y(v)}`;
  });
  return (
    <svg width={132} height={48} viewBox="0 0 140 48" role="img" aria-label="ผลเฉลี่ยถ้าถือตายตัว D+5 D+10 D+20" className="flex-shrink-0">
      <line x1={4} x2={136} y1={20} y2={20} stroke="rgba(255,255,255,0.18)" strokeDasharray="2 3" />
      <path d={d} fill="none" stroke={color} strokeWidth={2} />
      {pts.map((v, i) =>
        v == null ? null : (
          <g key={i}>
            <circle cx={x(i)} cy={y(v)} r={3} fill={color} />
            <text x={x(i)} y={46} fontSize={12} fill="rgba(255,255,255,0.45)" textAnchor="middle">
              D+{H[i]}
            </text>
          </g>
        ),
      )}
    </svg>
  );
}
