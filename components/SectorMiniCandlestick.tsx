'use client';

import { useEffect, useRef, useState } from 'react';

interface Bar { time: string; open: number; high: number; low: number; close: number; }

function paintCandles(canvas: HTMLCanvasElement, bars: Bar[]) {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  if (!W || !H) return;

  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);

  const maxH = Math.max(...bars.map(b => b.high));
  const minL = Math.min(...bars.map(b => b.low));
  const span = maxH - minL || 1;
  const n = bars.length;
  const slotW = W / n;
  const bw = Math.max(1, slotW - 2);
  const PAD = 2;
  const toY = (v: number) => PAD + ((maxH - v) / span) * (H - PAD * 2);

  bars.forEach((bar, i) => {
    const cx = i * slotW + slotW / 2;
    const bull = bar.close >= bar.open;
    const color = bull ? '#26a69a' : '#ef5350';
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(cx, toY(bar.high));
    ctx.lineTo(cx, toY(bar.low));
    ctx.stroke();

    const top = toY(Math.max(bar.open, bar.close));
    const bot = toY(Math.min(bar.open, bar.close));
    ctx.fillRect(cx - bw / 2, top, bw, Math.max(1, bot - top));
  });
}

export default function SectorMiniCandlestick({ ticker }: { ticker: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [bars, setBars] = useState<Bar[]>([]);
  const [price, setPrice] = useState<number | null>(null);
  const [pct, setPct] = useState<number | null>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setLive(true); obs.disconnect(); } },
      { rootMargin: '120px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!live || !ticker) return;
    let dead = false;
    fetch(`/api/chart/${encodeURIComponent(ticker)}?interval=1wk&range=4mo`)
      .then(r => r.json())
      .then(({ data = [] }: { data: Bar[] }) => {
        if (dead || data.length < 2) return;
        setBars(data);
        const last = data[data.length - 1];
        const prev = data[data.length - 2];
        setPrice(last.close);
        setPct(((last.close - prev.close) / prev.close) * 100);
      })
      .catch(() => {});
    return () => { dead = true; };
  }, [live, ticker]);

  useEffect(() => {
    const c = canvasRef.current;
    if (c && bars.length) paintCandles(c, bars);
  }, [bars]);

  const pos = (pct ?? 0) >= 0;

  return (
    <div ref={rootRef} className="mt-3 pt-3 border-t border-white/[0.05] flex items-stretch gap-2">
      <div className="flex-shrink-0 flex flex-col justify-center" style={{ width: 68 }}>
        <p className="text-[17px] font-medium text-white tabular-nums leading-tight">
          {price != null
            ? price.toFixed(2)
            : <span className="text-white/10 select-none">——</span>}
        </p>
        <p
          className="text-[11px] font-medium tabular-nums mt-0.5"
          style={{ color: pos ? '#26a69a' : '#ef5350', opacity: pct != null ? 1 : 0 }}
        >
          {pct != null ? `${pos ? '+' : ''}${pct.toFixed(2)}%` : '0.00%'}
        </p>
        <p className="text-[10px] text-white/20 mt-1">{ticker}</p>
      </div>

      <div className="flex-1 min-w-0 relative" style={{ height: 62 }}>
        {bars.length === 0 && live && (
          <div className="absolute inset-0 rounded bg-white/[0.03] animate-pulse" />
        )}
        {bars.length === 0 && !live && (
          <div className="absolute inset-0 rounded bg-white/[0.02]" />
        )}
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      </div>
    </div>
  );
}
