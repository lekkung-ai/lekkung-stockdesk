'use client';

import { useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries, LineSeries, ColorType } from 'lightweight-charts';

interface OhlcvPoint {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

function calcEMA(data: OhlcvPoint[], period: number): { time: string; value: number }[] {
  if (data.length < period) return [];
  const k = 2 / (period + 1);
  const result: { time: string; value: number }[] = [];
  let ema = data.slice(0, period).reduce((s, d) => s + d.close, 0) / period;
  result.push({ time: data[period - 1].time, value: parseFloat(ema.toFixed(2)) });
  for (let i = period; i < data.length; i++) {
    ema = data[i].close * k + ema * (1 - k);
    result.push({ time: data[i].time, value: parseFloat(ema.toFixed(2)) });
  }
  return result;
}

export default function PriceChart({
  ticker,
  market,
  height = 200,
}: {
  ticker: string;
  market: string;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [chartData, setChartData] = useState<OhlcvPoint[]>([]);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setChartData([]);

    fetch(`/api/chart/${encodeURIComponent(ticker)}?market=${encodeURIComponent(market)}`)
      .then(res => {
        if (!res.ok) throw new Error('upstream');
        return res.json();
      })
      .then(json => {
        if (cancelled) return;
        if (!Array.isArray(json.data) || json.data.length === 0) throw new Error('empty');
        setChartData(json.data);
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    return () => { cancelled = true; };
  }, [ticker, market]);

  useEffect(() => {
    if (status !== 'ready' || !containerRef.current || !chartData.length) return;

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
        scaleMargins: { top: 0.08, bottom: 0.08 },
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
    candles.setData(chartData);

    const ema50 = calcEMA(chartData, 50);
    if (ema50.length > 0) {
      const ema50Line = chart.addSeries(LineSeries, {
        color: '#F9C942',
        lineWidth: 1,
        lastValueVisible: false,
        priceLineVisible: false,
      });
      ema50Line.setData(ema50);
    }

    const ema200 = calcEMA(chartData, 200);
    if (ema200.length > 0) {
      const ema200Line = chart.addSeries(LineSeries, {
        color: '#AA00FF',
        lineWidth: 1,
        lastValueVisible: false,
        priceLineVisible: false,
      });
      ema200Line.setData(ema200);
    }

    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [status, chartData, height]);

  return (
    <div className="relative w-full" style={{ minHeight: height }}>
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[12px] text-white/30 animate-pulse">กำลังโหลดข้อมูล...</span>
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center flex-col gap-1">
          <span className="text-[12px] text-white/30">ไม่พบข้อมูลราคา</span>
          <span className="text-[11px] text-white/20">{ticker}</span>
        </div>
      )}
      <div
        ref={containerRef}
        className="w-full"
        style={{ visibility: status === 'ready' ? 'visible' : 'hidden' }}
      />
    </div>
  );
}
