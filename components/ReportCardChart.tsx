'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  LineSeries,
  ColorType,
  createSeriesMarkers,
  LineStyle,
} from 'lightweight-charts';
import type { IChartApi, Time, SeriesMarker } from 'lightweight-charts';

interface OhlcvPoint {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ReportCardChartProps {
  ticker: string;
  entryDate: string;
  entryPrice: number;
  exitDate: string;
  exitPrice: number;
  returnPct: number;
  isOpen: boolean;
}

export default function ReportCardChart({
  ticker,
  entryDate,
  entryPrice,
  exitDate,
  exitPrice,
  returnPct,
  isOpen,
}: ReportCardChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'not_enough_data'>('loading');
  const [chartData, setChartData] = useState<OhlcvPoint[]>([]);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setChartData([]);

    fetch(`/api/chart/${encodeURIComponent(ticker)}?interval=1d&range=2y`)
      .then(r => {
        if (!r.ok) throw new Error('upstream error');
        return r.json();
      })
      .then(json => {
        if (cancelled) return;
        const raw: OhlcvPoint[] = json.data;
        if (!Array.isArray(raw) || raw.length === 0) {
          setStatus('error');
          return;
        }

        // CROP: [entryDate - 3 bars, (exitDate or latest) + 3 bars]
        let entryIdx = raw.findIndex(d => d.time === entryDate);
        if (entryIdx === -1) {
          entryIdx = raw.findIndex(d => d.time >= entryDate);
          if (entryIdx === -1) entryIdx = raw.length - 1;
        }

        let exitIdx = raw.findIndex(d => d.time === exitDate);
        if (exitIdx === -1) {
          for (let i = raw.length - 1; i >= 0; i--) {
            if (raw[i].time <= exitDate) {
              exitIdx = i;
              break;
            }
          }
          if (exitIdx === -1) exitIdx = raw.length - 1;
        }

        if (entryIdx > exitIdx) {
          const tmp = entryIdx;
          entryIdx = Math.min(tmp, exitIdx);
          exitIdx = Math.max(tmp, exitIdx);
        }

        const startIdx = Math.max(0, entryIdx - 3);
        const endIdx = Math.min(raw.length - 1, exitIdx + 3);
        const cropped = raw.slice(startIdx, endIdx + 1);

        if (cropped.length < 2) {
          setStatus('not_enough_data');
          return;
        }

        setChartData(cropped);
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [ticker, entryDate, exitDate]);

  useEffect(() => {
    if (status !== 'ready' || !containerRef.current || chartData.length < 2) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const container = containerRef.current;
    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: '#13161e' },
        textColor: '#9ca3af',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.04)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.04)' },
      },
      width: container.clientWidth,
      height: 320,
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.08)',
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.08)',
        scaleMargins: { top: 0.12, bottom: 0.12 },
      },
      crosshair: {
        vertLine: { color: 'rgba(255, 255, 255, 0.2)' },
        horzLine: { color: 'rgba(255, 255, 255, 0.2)' },
      },
    });
    chartRef.current = chart;

    const lineSeries = chart.addSeries(LineSeries, {
      color: '#60a5fa',
      lineWidth: 2,
      priceLineVisible: true,
      lastValueVisible: true,
    });
    lineSeries.setData(chartData.map(d => ({ time: d.time as Time, value: d.close })));

    lineSeries.createPriceLine({
      price: entryPrice,
      color: 'rgba(255, 255, 255, 0.35)',
      lineStyle: LineStyle.Dashed,
      title: 'ราคาเข้า',
      axisLabelVisible: true,
    });

    const validTimes = new Set(chartData.map(d => d.time));
    const markers: SeriesMarker<Time>[] = [];

    const entryBar = validTimes.has(entryDate)
      ? entryDate
      : chartData.find(d => d.time >= entryDate)?.time || chartData[0]?.time;

    if (entryBar) {
      markers.push({
        time: entryBar as Time,
        position: 'belowBar',
        shape: 'arrowUp',
        color: '#378ADD',
        text: `เข้า ${entryPrice.toFixed(2)}`,
      });
    }

    let exitBar = validTimes.has(exitDate) ? exitDate : null;
    if (!exitBar) {
      for (let i = chartData.length - 1; i >= 0; i--) {
        if (chartData[i].time <= exitDate) {
          exitBar = chartData[i].time;
          break;
        }
      }
      if (!exitBar) exitBar = chartData[chartData.length - 1]?.time;
    }

    if (exitBar) {
      const exitColor = returnPct >= 0 ? '#22c55e' : '#ef4444';
      const exitLabel = (isOpen ? 'ล่าสุด' : 'ออก') + ` ${exitPrice.toFixed(2)}`;
      markers.push({
        time: exitBar as Time,
        position: 'aboveBar',
        shape: 'arrowDown',
        color: exitColor,
        text: exitLabel,
      });
    }

    markers.sort((a, b) => (a.time > b.time ? 1 : -1));
    if (markers.length > 0) {
      createSeriesMarkers(lineSeries, markers);
    }

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [status, chartData, entryDate, entryPrice, exitDate, exitPrice, returnPct, isOpen]);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-white text-[14px]">{ticker}</span>
          <span className="text-[11.5px] text-white/50 font-mono">
            เข้า {entryDate} @{entryPrice.toFixed(2)} → {isOpen ? 'ล่าสุด' : 'ออก'} {exitDate} @{exitPrice.toFixed(2)}
          </span>
        </div>
        <span
          className={`text-[12px] font-bold tabular-nums ${
            returnPct >= 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'
          }`}
        >
          {returnPct >= 0 ? '+' : ''}{returnPct.toFixed(2)}%
        </span>
      </div>

      {status === 'loading' && (
        <div className="h-[320px] flex items-center justify-center text-white/40 text-[12px] bg-black/20 rounded-lg">
          กำลังโหลดกราฟราคา…
        </div>
      )}

      {status === 'error' && (
        <div className="h-[320px] flex items-center justify-center text-rose-400/60 text-[12px] bg-black/20 rounded-lg">
          ไม่สามารถโหลดข้อมูลราคา {ticker} ได้
        </div>
      )}

      {status === 'not_enough_data' && (
        <div className="h-[320px] flex items-center justify-center text-white/40 text-[12px] bg-black/20 rounded-lg">
          ข้อมูลราคาไม่พอแสดง
        </div>
      )}

      <div
        ref={containerRef}
        className={`w-full ${status === 'ready' ? 'block' : 'hidden'}`}
      />
    </div>
  );
}
