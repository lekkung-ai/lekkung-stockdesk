'use client';

interface Bar { date: string; open: number; high: number; low: number; close: number; }

export default function MiniCandlestick({
  bars,
  ema200,
  width = 120,
  height = 32,
}: {
  bars: Bar[] | undefined;
  ema200: (number | null)[] | undefined;
  width?: number;
  height?: number;
}) {
  if (!bars || bars.length === 0) {
    return <div style={{ width, height }} className="rounded bg-white/[0.02]" />;
  }

  const prices = bars.flatMap(b => [b.high, b.low]);
  (ema200 ?? []).forEach(v => { if (v != null) prices.push(v); });
  const maxP = Math.max(...prices);
  const minP = Math.min(...prices);
  const span = maxP - minP || 1;
  const PAD = 1.5;
  const toY = (v: number) => PAD + ((maxP - v) / span) * (height - PAD * 2);

  const n = bars.length;
  const slotW = width / n;
  const bw = Math.max(1, slotW - 1);

  const emaPoints = (ema200 ?? [])
    .map((v, i) => (v == null ? null : { x: i * slotW + slotW / 2, y: toY(v) }))
    .filter((p): p is { x: number; y: number } => p !== null);
  const emaPath = emaPoints.length > 1
    ? `M ${emaPoints.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ')}`
    : null;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block">
      {bars.map((bar, i) => {
        const cx = i * slotW + slotW / 2;
        const bull = bar.close >= bar.open;
        const color = bull ? '#26a69a' : '#ef5350';
        const top = toY(Math.max(bar.open, bar.close));
        const bot = toY(Math.min(bar.open, bar.close));
        return (
          <g key={bar.date + i}>
            <line x1={cx} x2={cx} y1={toY(bar.high)} y2={toY(bar.low)} stroke={color} strokeWidth={1} />
            <rect x={cx - bw / 2} y={top} width={bw} height={Math.max(1, bot - top)} fill={color} />
          </g>
        );
      })}
      {emaPath && <path d={emaPath} stroke="#AA00FF" strokeWidth={1.5} fill="none" />}
    </svg>
  );
}
