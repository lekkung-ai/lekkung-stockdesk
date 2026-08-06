'use client';

import { useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries, LineSeries, HistogramSeries, ColorType, createSeriesMarkers } from 'lightweight-charts';
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

function calcSMA(data: OhlcvPoint[], period: number): { time: string; value: number }[] {
  if (data.length < period) return [];
  const result: { time: string; value: number }[] = [];
  let sum = 0;
  for (let i = 0; i < period; i++) sum += data[i].close;
  result.push({ time: data[period - 1].time, value: parseFloat((sum / period).toFixed(2)) });
  
  for (let i = period; i < data.length; i++) {
    sum = sum - data[i - period].close + data[i].close;
    result.push({ time: data[i].time, value: parseFloat((sum / period).toFixed(2)) });
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

function getPpbpTimes(data: OhlcvPoint[]): Set<string> {
  const times = new Set<string>();
  if (data.length <= 50) return times;
  
  for (let i = 50; i < data.length; i++) {
    const current = data[i];
    if (current.close <= current.open) continue;

    let maxDownVol = 0;
    for (let j = i - 10; j < i; j++) {
      if (data[j].close <= data[j].open && data[j].volume > maxDownVol) {
        maxDownVol = data[j].volume;
      }
    }
    if (maxDownVol > 0 && current.volume <= maxDownVol) continue;

    let sum = 0;
    for (let j = i - 50; j < i; j++) {
      sum += data[j].volume;
    }
    const sma50 = sum / 50;
    if (current.volume <= sma50) continue;

    times.add(current.time);
  }
  return times;
}

export default function StockChart({ ticker, height = 350, isPpbp = false, showEma10 = false, showSma50 = false, showSma150 = false, highlightDates, highlightColor = '#f59e0b', reentryDates, reentryColor = '#22c55e' }: { ticker: string; height?: number; isPpbp?: boolean; showEma10?: boolean; showSma50?: boolean; showSma150?: boolean; highlightDates?: string[]; highlightColor?: string; reentryDates?: string[]; reentryColor?: string }) {
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

    const hasHighlight = highlightDates && highlightDates.length;
    const hasReentry = reentryDates && reentryDates.length;
    if (hasHighlight || hasReentry) {
      const validTimes = new Set(chartData.map(d => d.time));
      const firstSet = new Set(highlightDates || []);
      const allMarkers: { time: Time; position: 'belowBar'; shape: 'arrowUp'; color: string; text?: string }[] = [];

      if (highlightDates) {
        highlightDates
          .filter(d => validTimes.has(d))
          .forEach(d => {
            allMarkers.push({
              time: d as Time,
              position: 'belowBar',
              shape: 'arrowUp',
              color: highlightColor,
              text: 'เจอครั้งแรก',
            });
          });
      }

      if (reentryDates) {
        reentryDates
          .filter(d => validTimes.has(d) && !firstSet.has(d))
          .forEach(d => {
            allMarkers.push({
              time: d as Time,
              position: 'belowBar',
              shape: 'arrowUp',
              color: reentryColor,
              text: 'เจอใหม่',
            });
          });
      }

      allMarkers.sort((a, b) => (a.time > b.time ? 1 : -1));
      if (allMarkers.length) createSeriesMarkers(candles, allMarkers);
    }

    const ema10 = calcEMA(chartData, 10);
    if (showEma10 && ema10.length) {
      chart.addSeries(LineSeries, { color: '#00BFFF', lineWidth: 1, lastValueVisible: false, priceLineVisible: false }).setData(ema10);
    }
    const ema50 = calcEMA(chartData, 50);
    if (ema50.length) {
      chart.addSeries(LineSeries, { color: '#F9C942', lineWidth: 1, lastValueVisible: false, priceLineVisible: false }).setData(ema50);
    }
    const ema200 = calcEMA(chartData, 200);
    if (ema200.length && !showSma150) {
      chart.addSeries(LineSeries, { color: '#AA00FF', lineWidth: 1, lastValueVisible: false, priceLineVisible: false }).setData(ema200);
    }
    
    // SMA overrides for Stage Analysis
    const sma50 = calcSMA(chartData, 50);
    if (showSma50 && sma50.length) {
      chart.addSeries(LineSeries, { color: '#FF5722', lineWidth: 2, lastValueVisible: false, priceLineVisible: false }).setData(sma50);
    }
    const sma150 = calcSMA(chartData, 150);
    if (showSma150 && sma150.length) {
      chart.addSeries(LineSeries, { color: '#3F51B5', lineWidth: 2, lastValueVisible: false, priceLineVisible: false }).setData(sma150);
    }

    // ── Volume pane ──────────────────────────────────────────────────────────
    const lastIdx = chartData.length - 1;
    const ppbpTimes = getPpbpTimes(chartData);
    
    const volData = chartData.map((d, i) => {
      const isUp = d.close >= d.open;
      const isPpbpBar = ppbpTimes.has(d.time) || (isPpbp && i === lastIdx);
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
  }, [status, chartData, height, isPpbp, highlightDates, highlightColor, reentryDates, reentryColor]);

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
          {showEma10 && (
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 rounded-full" style={{ background: '#00BFFF' }} />
              <span className="text-[10px] text-white/30">EMA10</span>
            </div>
          )}
          {!showSma50 && (
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 rounded-full" style={{ background: '#F9C942' }} />
              <span className="text-[10px] text-white/30">EMA50</span>
            </div>
          )}
          {!showSma150 && (
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 rounded-full" style={{ background: '#AA00FF' }} />
              <span className="text-[10px] text-white/30">EMA200</span>
            </div>
          )}
          {showSma50 && (
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 rounded-full" style={{ background: '#FF5722' }} />
              <span className="text-[10px] text-white/30 font-bold">SMA50 (10-Week)</span>
            </div>
          )}
          {showSma150 && (
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 rounded-full" style={{ background: '#3F51B5' }} />
              <span className="text-[10px] text-white/30 font-bold">SMA150 (30-Week)</span>
            </div>
          )}
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
