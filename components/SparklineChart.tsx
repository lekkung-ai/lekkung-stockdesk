'use client';

import { useEffect, useRef } from 'react';
import { createChart, AreaSeries, ColorType } from 'lightweight-charts';

export default function SparklineChart({
  data,
  width = 120,
  height = 40,
}: {
  data: { time: string; value: number }[];
  width?: number;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!data.length || !ref.current) return;

    const first = data[0].value;
    const last = data[data.length - 1].value;
    const isPos = last >= first;
    const lineColor = isPos ? '#1D9E75' : '#E24B4A';
    const topColor = isPos ? 'rgba(29,158,117,0.22)' : 'rgba(226,75,74,0.22)';

    const chart = createChart(ref.current, {
      width,
      height,
      layout: {
        background: { type: ColorType.Solid, color: '#13161e' },
        textColor: 'transparent',
      },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      leftPriceScale: { visible: false },
      rightPriceScale: { visible: false },
      timeScale: { visible: false },
      crosshair: {
        vertLine: { visible: false, labelVisible: false },
        horzLine: { visible: false, labelVisible: false },
      },
      handleScroll: false,
      handleScale: false,
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor,
      topColor,
      bottomColor: 'rgba(0,0,0,0)',
      lineWidth: 2,
      lastValueVisible: false,
      priceLineVisible: false,
    });

    series.setData(data);
    chart.timeScale().fitContent();

    return () => chart.remove();
  }, [data, width, height]);

  return <div ref={ref} style={{ width, height }} />;
}
