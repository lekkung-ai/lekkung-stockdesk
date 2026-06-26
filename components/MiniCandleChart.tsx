'use client';

import { useEffect, useRef, useState } from 'react';

interface Bar { time: string; open: number; high: number; low: number; close: number; }

function calcEma(closes: number[], period: number): (number | null)[] {
  const k = 2 / (period + 1);
  const out: (number | null)[] = new Array(closes.length).fill(null);
  let e = closes[0];
  for (let i = 0; i < closes.length; i++) {
    e = i === 0 ? closes[0] : closes[i] * k + e * (1 - k);
    if (i >= period - 1) out[i] = e;
  }
  return out;
}

function paint(canvas: HTMLCanvasElement, bars: Bar[], ema200: (number | null)[]) {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  if (!W || !H) return;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);

  const prices: number[] = bars.flatMap(b => [b.high, b.low]);
  ema200.forEach(v => { if (v != null) prices.push(v); });
  const maxP = Math.max(...prices);
  const minP = Math.min(...prices);
  const span = maxP - minP || 1;
  const PAD = 2;
  const toY = (v: number) => PAD + ((maxP - v) / span) * (H - PAD * 2);

  const n = bars.length;
  const slotW = W / n;
  const bw = Math.max(2, slotW - 1);

  bars.forEach((bar, i) => {
    const cx = i * slotW + slotW / 2;
    const bull = bar.close >= bar.open;
    ctx.strokeStyle = ctx.fillStyle = bull ? '#26a69a' : '#ef5350';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, toY(bar.high));
    ctx.lineTo(cx, toY(bar.low));
    ctx.stroke();
    const top = toY(Math.max(bar.open, bar.close));
    const bot = toY(Math.min(bar.open, bar.close));
    ctx.fillRect(cx - bw / 2, top, bw, Math.max(1, bot - top));
  });

  ctx.strokeStyle = '#AA00FF';
  ctx.lineWidth = 2;
  ctx.beginPath();
  let started = false;
  ema200.forEach((v, i) => {
    if (v == null) return;
    const cx = i * slotW + slotW / 2;
    if (!started) { ctx.moveTo(cx, toY(v)); started = true; }
    else ctx.lineTo(cx, toY(v));
  });
  if (started) ctx.stroke();
}

export default function MiniCandleChart({
  ticker,
  width = 120,
  height = 45,
}: {
  ticker: string;
  width?: number | string;
  height?: number;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [bars, setBars] = useState<Bar[]>([]);
  const [emaVals, setEmaVals] = useState<(number | null)[]>([]);
  const [triggered, setTriggered] = useState(false);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setTriggered(true); obs.disconnect(); } },
      { rootMargin: '400px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!triggered || !ticker) return;
    let dead = false;
    fetch(`/api/chart/${encodeURIComponent(ticker)}?interval=1d&range=1y`)
      .then(r => r.json())
      .then(({ data = [] }: { data: Bar[] }) => {
        if (dead || data.length < 2) return;
        const closes = data.map(b => b.close);
        const emaAll = calcEma(closes, 200);
        setBars(data.slice(-30));
        setEmaVals(emaAll.slice(-30));
      })
      .catch(() => {})
      .finally(() => { if (!dead) setFetched(true); });
    return () => { dead = true; };
  }, [triggered, ticker]);

  useEffect(() => {
    const c = canvasRef.current;
    if (c && bars.length) paint(c, bars, emaVals);
  }, [bars, emaVals]);

  return (
    <div ref={rootRef} style={{ width, height }} className="relative">
      {triggered && !fetched && (
        <div className="absolute inset-0 rounded bg-white/[0.03] animate-pulse" />
      )}
      {!triggered && (
        <div className="absolute inset-0 rounded bg-white/[0.02]" />
      )}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
    </div>
  );
}
