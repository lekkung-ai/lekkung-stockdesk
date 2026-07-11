'use client';

import { useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries, ColorType, createSeriesMarkers } from 'lightweight-charts';
import type { SetIndexBar } from '@/lib/breadthData';

interface TooltipState {
  x: number;
  y: number;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  marker: 'FTD' | 'DD' | null;
}

export default function SetIndexChart({ bars, height = 260 }: { bars: SetIndexBar[]; height?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  useEffect(() => {
    if (!containerRef.current || !bars.length) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#13161e' },
        textColor: '#6b7280',
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      width: containerRef.current.clientWidth,
      height,
      timeScale: {
        borderColor: 'rgba(255,255,255,0.08)',
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      rightPriceScale: {
        borderColor: 'rgba(255,255,255,0.08)',
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      crosshair: {
        vertLine: { color: 'rgba(255,255,255,0.15)' },
        horzLine: { color: 'rgba(255,255,255,0.15)' },
      },
      handleScroll: false,
      handleScale: false,
    });

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: '#1D9E75',
      downColor: '#E24B4A',
      borderVisible: false,
      wickUpColor: '#1D9E75',
      wickDownColor: '#E24B4A',
    });

    const data = bars.map(b => ({ time: b.date, open: b.open, high: b.high, low: b.low, close: b.close }));
    candles.setData(data);

    const markers = bars
      .filter(b => b.marker)
      .map(b => ({
        time: b.date,
        position: (b.marker === 'FTD' ? 'belowBar' : 'aboveBar') as 'belowBar' | 'aboveBar',
        shape: (b.marker === 'FTD' ? 'arrowUp' : 'arrowDown') as 'arrowUp' | 'arrowDown',
        color: b.marker === 'FTD' ? '#1D9E75' : '#E24B4A',
        text: b.marker as string,
      }));
    if (markers.length) createSeriesMarkers(candles, markers);

    chart.timeScale().fitContent();

    const byDate = new Map(bars.map(b => [b.date, b]));
    chart.subscribeCrosshairMove(param => {
      if (!param.point || !param.time) {
        setTooltip(null);
        return;
      }
      const bar = byDate.get(param.time as string);
      if (!bar) {
        setTooltip(null);
        return;
      }
      setTooltip({
        x: param.point.x,
        y: param.point.y,
        date: bar.date,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        marker: bar.marker,
      });
    });

    const ro = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [bars, height]);

  return (
    <div className="relative w-full" style={{ minHeight: height }}>
      <div ref={containerRef} className="w-full" />
      {tooltip && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-white/[0.1] bg-[#0b0d12]/95 px-2.5 py-2 text-[11px] shadow-lg"
          style={{
            left: Math.min(tooltip.x + 12, (containerRef.current?.clientWidth ?? 0) - 150),
            top: 8,
          }}
        >
          <div className="text-white/50 mb-1">{tooltip.date}</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 tabular-nums">
            <span className="text-white/40">O</span><span className="text-white/80">{tooltip.open.toFixed(2)}</span>
            <span className="text-white/40">H</span><span className="text-white/80">{tooltip.high.toFixed(2)}</span>
            <span className="text-white/40">L</span><span className="text-white/80">{tooltip.low.toFixed(2)}</span>
            <span className="text-white/40">C</span><span className="text-white/80">{tooltip.close.toFixed(2)}</span>
          </div>
          {tooltip.marker && (
            <div
              className={`mt-1 font-semibold ${tooltip.marker === 'FTD' ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}
            >
              {tooltip.marker === 'FTD' ? '▲ Follow-Through Day' : '▼ Distribution Day'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
