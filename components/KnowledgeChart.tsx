'use client';

import { useEffect, useRef } from 'react';
import { createChart, CandlestickSeries, LineSeries, HistogramSeries, ColorType, createSeriesMarkers } from 'lightweight-charts';
import type { IChartApi } from 'lightweight-charts';
import { generateSeries, calcEMA } from '@/lib/knowledge/syntheticData';
import type { ShapeConfig, MarkerConfig } from '@/lib/knowledge/syntheticData';

// Static, synthetic-data chart for the Knowledge Base page — same charting
// library and visual style as components/StockChart.tsx (used on
// /stock/[ticker]), but takes a fixed shape config instead of fetching.
// Never calls any API.
export default function KnowledgeChart({
  shape,
  markers,
  height = 340,
}: {
  shape: ShapeConfig;
  markers: MarkerConfig[];
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const { bars } = generateSeries(shape);

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
        scaleMargins: { top: 0.06, bottom: 0.28 },
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
    candles.setData(bars);

    const ema50 = calcEMA(bars, 50);
    if (ema50.length) {
      chart.addSeries(LineSeries, { color: '#EF9F27', lineWidth: 1, lastValueVisible: false, priceLineVisible: false }).setData(ema50);
    }
    const ema200 = calcEMA(bars, 200);
    if (ema200.length) {
      chart.addSeries(LineSeries, { color: '#AA00FF', lineWidth: 1, lastValueVisible: false, priceLineVisible: false }).setData(ema200);
    }

    if (markers.length) {
      const seriesMarkers = markers
        .filter(m => bars[m.atBar])
        .map(m => ({
          time: bars[m.atBar].time,
          position: m.position,
          shape: (m.position === 'aboveBar' ? 'arrowDown' : 'arrowUp') as 'arrowDown' | 'arrowUp',
          color: m.color,
          text: m.label,
        }));
      createSeriesMarkers(candles, seriesMarkers);
    }

    const volData = bars.map(d => ({
      time: d.time,
      value: d.volume,
      color: d.close >= d.open ? 'rgba(29, 158, 117, 0.55)' : 'rgba(226, 75, 74, 0.55)',
    }));
    const volSeries = chart.addSeries(HistogramSeries, {
      priceScaleId: 'vol',
      lastValueVisible: false,
      priceLineVisible: false,
    });
    volSeries.setData(volData);
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.76, bottom: 0.02 } });

    chart.timeScale().fitContent();
    chartRef.current = chart;

    const ro = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    });
    ro.observe(containerRef.current);

    return () => { ro.disconnect(); chart.remove(); chartRef.current = null; };
  }, [shape, markers, height]);

  return (
    <div className="bg-[#13161e] border border-white/[0.07] rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06] flex-wrap">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 rounded-full" style={{ background: '#EF9F27' }} />
          <span className="text-[10px] text-white/30">EMA50</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 rounded-full" style={{ background: '#AA00FF' }} />
          <span className="text-[10px] text-white/30">EMA200</span>
        </div>
        <span className="text-[10px] text-white/20 ml-auto">ข้อมูลจำลอง (synthetic) — ไม่ใช่ราคาจริง</span>
      </div>
      <div style={{ minHeight: height }}>
        <div ref={containerRef} className="w-full" />
      </div>
    </div>
  );
}
