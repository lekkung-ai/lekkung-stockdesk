'use client';

import { useEffect, useRef, useState } from 'react';
import { createChart, LineSeries, ColorType, type ISeriesApi, type Time } from 'lightweight-charts';
import type { BreadthRow } from '@/lib/breadthData';

export interface BreadthSeriesSpec {
  key: keyof BreadthRow;
  label: string;
  color: string;
}

interface TooltipState {
  x: number;
  date: string;
  values: { label: string; color: string; value: number | null }[];
}

export default function BreadthLineChart({
  rows,
  series,
  referenceValue,
  height = 200,
  valueSuffix = '%',
}: {
  rows: BreadthRow[];
  series: BreadthSeriesSpec[];
  referenceValue?: number;
  height?: number;
  valueSuffix?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  useEffect(() => {
    if (!containerRef.current || !rows.length) return;

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

    if (referenceValue !== undefined) {
      const refLine = chart.addSeries(LineSeries, {
        color: 'rgba(255,255,255,0.25)',
        lineWidth: 1,
        lineStyle: 2, // dashed
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
      });
      refLine.setData(rows.map(r => ({ time: r.date as Time, value: referenceValue })));
    }

    const seriesApis: { spec: BreadthSeriesSpec; api: ISeriesApi<'Line'> }[] = [];
    for (const spec of series) {
      const api = chart.addSeries(LineSeries, {
        color: spec.color,
        lineWidth: 2,
        lastValueVisible: false,
        priceLineVisible: false,
      });
      const data = rows
        .filter(r => r[spec.key] !== null && r[spec.key] !== undefined)
        .map(r => ({ time: r.date as Time, value: r[spec.key] as number }));
      api.setData(data);
      seriesApis.push({ spec, api });
    }

    chart.timeScale().fitContent();

    const byDate = new Map(rows.map(r => [r.date, r]));
    chart.subscribeCrosshairMove(param => {
      if (!param.point || !param.time) {
        setTooltip(null);
        return;
      }
      const row = byDate.get(param.time as string);
      if (!row) {
        setTooltip(null);
        return;
      }
      setTooltip({
        x: param.point.x,
        date: row.date,
        values: series.map(s => ({
          label: s.label,
          color: s.color,
          value: row[s.key] as number | null,
        })),
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
  }, [rows, series, referenceValue, height]);

  return (
    <div className="relative w-full" style={{ minHeight: height }}>
      <div ref={containerRef} className="w-full" />
      {tooltip && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-white/[0.1] bg-[#0b0d12]/95 px-2.5 py-2 text-[11px] shadow-lg"
          style={{
            left: Math.min(tooltip.x + 12, (containerRef.current?.clientWidth ?? 0) - 160),
            top: 8,
          }}
        >
          <div className="text-white/50 mb-1">{tooltip.date}</div>
          <div className="space-y-0.5">
            {tooltip.values.map(v => (
              <div key={v.label} className="flex items-center gap-2 tabular-nums">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: v.color }} />
                <span className="text-white/50 flex-1">{v.label}</span>
                <span className="text-white/85 font-medium">
                  {v.value == null ? '-' : `${v.value.toFixed(1)}${valueSuffix}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
