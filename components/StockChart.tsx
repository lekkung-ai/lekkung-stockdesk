'use client';

import { useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries, LineSeries, HistogramSeries, ColorType } from 'lightweight-charts';
import type { IChartApi, Time } from 'lightweight-charts';

type Timeframe = '1M' | '3M' | '6M' | '1Y';

interface OhlcvPoint {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const TF_LABELS: Timeframe[] = ['1M', '3M', '6M', '1Y'];

function getStartDate(tf: Timeframe): string {
  const d = new Date();
  if (tf === '1M') d.setMonth(d.getMonth() - 1);
  else if (tf === '3M') d.setMonth(d.getMonth() - 3);
  else if (tf === '6M') d.setMonth(d.getMonth() - 6);
  else d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
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

function calcVolSMA(data: OhlcvPoint[], period: number): { time: string; value: number }[] {
  if (data.length < period) return [];
  const result: { time: string; value: number }[] = [];
  for (let i = period - 1; i < data.length; i++) {
    const avg = data.slice(i - period + 1, i + 1).reduce((s, d) => s + d.volume, 0) / period;
    result.push({ time: data[i].time, value: Math.round(avg) });
  }
  return result;
}

export default function StockChart({ ticker, height = 350, isPpbp = false }: { ticker: string; height?: number; isPpbp?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [chartData, setChartData] = useState<OhlcvPoint[]>([]);
  const [timeframe, setTimeframe] = useState<Timeframe>('6M');
  const timeframeRef = useRef<Timeframe>('6M');

  // Sync ref so chart creation reads current timeframe without being a dep
  useEffect(() => { timeframeRef.current = timeframe; }, [timeframe]);

  // Fetch
  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setChartData([]);

    fetch(`/api/chart/${encodeURIComponent(ticker)}?market=SET`)
      .then(r => { if (!r.ok) throw new Error('upstream'); return r.json(); })
      .then(json => {
        if (cancelled) return;
        if (!Array.isArray(json.data) || json.data.length === 0) throw new Error('empty');
        setChartData(json.data);
        setStatus('ready');
      })
      .catch(() => { if (!cancelled) setStatus('error'); });

    return () => { cancelled = true; };
  }, [ticker]);

  // Create / recreate chart when data arrives
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
        fixLeftEdge: false,
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
    if (ema50.length) {
      chart.addSeries(LineSeries, { color: '#F9C942', lineWidth: 1, lastValueVisible: false, priceLineVisible: false }).setData(ema50);
    }
    const ema200 = calcEMA(chartData, 200);
    if (ema200.length) {
      chart.addSeries(LineSeries, { color: '#AA00FF', lineWidth: 1, lastValueVisible: false, priceLineVisible: false }).setData(ema200);
    }

    // ── Volume pane ──────────────────────────────────────────────────────────
    const lastIdx = chartData.length - 1;
    const volData = chartData.map((d, i) => {
      const isUp = d.close >= d.open;
      const isPpbpBar = isPpbp && i === lastIdx;
      return {
        time: d.time,
        value: d.volume,
        color: isPpbpBar
          ? 'rgba(127, 119, 221, 0.95)'
          : isUp
          ? 'rgba(29, 158, 117, 0.55)'
          : 'rgba(226, 75, 74, 0.55)',
      };
    });

    const volSeries = chart.addSeries(HistogramSeries, {
      priceScaleId: 'vol',
      lastValueVisible: false,
      priceLineVisible: false,
    });
    volSeries.setData(volData);
    chart.priceScale('vol').applyOptions({
      scaleMargins: { top: 0.76, bottom: 0.02 },
    });

    const volSma50 = calcVolSMA(chartData, 50);
    if (volSma50.length) {
      chart.addSeries(LineSeries, {
        priceScaleId: 'vol',
        color: 'rgba(248, 201, 66, 0.7)',
        lineWidth: 1,
        lastValueVisible: false,
        priceLineVisible: false,
      }).setData(volSma50);
    }

    // Set initial visible range
    const startDate = getStartDate(timeframeRef.current);
    const lastDate = chartData[chartData.length - 1].time;
    chart.timeScale().setVisibleRange({ from: startDate as Time, to: lastDate as Time });

    chartRef.current = chart;

    const ro = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    });
    ro.observe(containerRef.current);

    return () => { ro.disconnect(); chart.remove(); chartRef.current = null; };
  }, [status, chartData, height, isPpbp]);

  // Update visible range when timeframe changes (chart already created)
  useEffect(() => {
    if (!chartRef.current || !chartData.length) return;
    const startDate = getStartDate(timeframe);
    const lastDate = chartData[chartData.length - 1].time;
    chartRef.current.timeScale().setVisibleRange({ from: startDate as Time, to: lastDate as Time });
  }, [timeframe, chartData]);

  return (
    <div className="bg-[#13161e] border border-white/[0.07] rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 rounded-full" style={{ background: '#F9C942' }} />
            <span className="text-[10px] text-white/30">EMA50</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 rounded-full" style={{ background: '#AA00FF' }} />
            <span className="text-[10px] text-white/30">EMA200</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 rounded-full" style={{ background: 'rgba(248,201,66,0.7)' }} />
            <span className="text-[10px] text-white/30">Vol SMA50</span>
          </div>
          {isPpbp && (
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ background: 'rgba(127,119,221,0.95)' }} />
              <span className="text-[10px] font-semibold" style={{ color: '#7F77DD' }}>PPBP</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          {TF_LABELS.map(tf => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                timeframe === tf
                  ? 'bg-white/10 text-white'
                  : 'text-white/35 hover:text-white/60 hover:bg-white/[0.05]'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      <div className="relative" style={{ minHeight: height }}>
        {status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[12px] text-white/30 animate-pulse">กำลังโหลดกราฟ...</span>
          </div>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[12px] text-white/30">ไม่พบข้อมูลราคา</span>
          </div>
        )}
        <div
          ref={containerRef}
          className="w-full"
          style={{ visibility: status === 'ready' ? 'visible' : 'hidden' }}
        />
      </div>
    </div>
  );
}
