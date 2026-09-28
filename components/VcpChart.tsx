'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createChart, CandlestickSeries, LineSeries, HistogramSeries, ColorType, LineStyle,
  createSeriesMarkers, type Time,
} from 'lightweight-charts';

// กราฟสำหรับหน้า /vcp-review: แท่งเทียนรายวัน ~6 เดือน + volume + SMA50
// + เส้น Pivot (VCP_Pivot) + marker "เริ่มฐาน" (ย้อน VCP_Weeks × 5 แท่งจากแท่งล่าสุด)

interface Bar { time: string; open: number; high: number; low: number; close: number; volume: number; }

const BARS_PER_WEEK = 5;
const HISTORY_MONTHS = 6;
const BASE_PAD_BARS = 10; // ฐานยาวกว่า 6 เดือน → ขยายช่วงแสดงให้เห็นจุดเริ่มฐาน + เผื่อซ้าย

function calcSMA(data: Bar[], period: number): { time: string; value: number }[] {
  const out: { time: string; value: number }[] = [];
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i].close;
    if (i >= period) sum -= data[i - period].close;
    if (i >= period - 1) out.push({ time: data[i].time, value: sum / period });
  }
  return out;
}

function monthsBefore(isoDate: string, months: number): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

export const tradingViewUrl = (ticker: string) =>
  `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(`SET:${ticker}`)}`;

export default function VcpChart({
  ticker,
  pivot,
  weeks,
  height = 420,
}: {
  ticker: string;
  pivot: number | null; // null = ไม่วาด pivot/marker (no base)
  weeks: number | null;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [data, setData] = useState<Bar[]>([]);
  const showBase = pivot != null && weeks != null;

  // ช่วงแสดง: 6 เดือนล่าสุด (มีน้อยกว่าก็แสดงเท่าที่มี) · ขยายซ้ายถ้าจุดเริ่มฐานเก่ากว่านั้น
  const layout = useMemo(() => {
    if (!data.length) return null;
    const lastIdx = data.length - 1;
    const baseIdx = showBase ? lastIdx - Math.round(weeks! * BARS_PER_WEEK) : null;
    const cutoff = monthsBefore(data[lastIdx].time, HISTORY_MONTHS);
    let fromIdx = data.findIndex(b => b.time >= cutoff);
    if (fromIdx < 0) fromIdx = 0;
    if (baseIdx != null && baseIdx >= 0) fromIdx = Math.min(fromIdx, Math.max(0, baseIdx - BASE_PAD_BARS));
    return {
      fromIdx,
      baseStart: baseIdx != null && baseIdx >= 0 ? data[baseIdx].time : null,
      baseBeyondData: baseIdx != null && baseIdx < 0,
    };
  }, [data, showBase, weeks]);
  const baseStart = layout?.baseStart ?? null;
  const baseBeyondData = layout?.baseBeyondData ?? false;

  useEffect(() => {
    // ไม่ reset state ที่นี่ — ผู้ใช้ต้องใส่ key={ticker} ให้ remount ต่อหุ้น
    let cancelled = false;
    // endpoint เดียวกับ StockChart
    fetch(`/api/chart/${encodeURIComponent(ticker)}?market=SET`)
      .then(r => { if (!r.ok) throw new Error('upstream'); return r.json(); })
      .then(json => {
        if (cancelled) return;
        if (!Array.isArray(json.data) || json.data.length === 0) throw new Error('empty');
        setData(json.data);
        setStatus('ready');
      })
      .catch(() => { if (!cancelled) setStatus('error'); });
    return () => { cancelled = true; };
  }, [ticker]);

  useEffect(() => {
    if (status !== 'ready' || !containerRef.current || !layout) return;
    const el = containerRef.current;

    const chart = createChart(el, {
      layout: { background: { type: ColorType.Solid, color: '#13161e' }, textColor: '#6b7280' },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      width: el.clientWidth,
      height,
      timeScale: { borderColor: 'rgba(255,255,255,0.08)', fixRightEdge: true },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.08)', scaleMargins: { top: 0.06, bottom: 0.28 } },
      crosshair: {
        vertLine: { color: 'rgba(255,255,255,0.15)' },
        horzLine: { color: 'rgba(255,255,255,0.15)' },
      },
    });

    const visible = data.slice(layout.fromIdx);

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: '#1D9E75', downColor: '#E24B4A', borderVisible: false,
      wickUpColor: '#1D9E75', wickDownColor: '#E24B4A',
      priceLineVisible: false, // เส้นประราคาล่าสุดดูคล้ายเส้น pivot — ปิด เหลือแค่ label บนแกน
    });
    candles.setData(visible.map(({ time, open, high, low, close }) => ({ time: time as Time, open, high, low, close })));

    // SMA50 คำนวณจากข้อมูลเต็ม (ต้นช่วงแสดงจะได้มีเส้นเลย) แล้วตัดเฉพาะช่วงที่แสดง
    const firstTime = visible[0].time;
    const sma50 = calcSMA(data, 50).filter(p => p.time >= firstTime);
    if (sma50.length) {
      chart.addSeries(LineSeries, { color: '#FF5722', lineWidth: 2, lastValueVisible: false, priceLineVisible: false })
        .setData(sma50.map(p => ({ time: p.time as Time, value: p.value })));
    }

    const vol = chart.addSeries(HistogramSeries, { priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false });
    vol.setData(visible.map(b => ({
      time: b.time as Time,
      value: b.volume,
      color: b.close >= b.open ? 'rgba(29,158,117,0.55)' : 'rgba(226,75,74,0.55)',
    })));
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.76, bottom: 0.02 } });

    if (showBase) {
      candles.createPriceLine({
        price: pivot!,
        color: '#F9C942',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `Pivot ${pivot!.toFixed(2)}`,
      });
      if (layout.baseStart) {
        createSeriesMarkers(candles, [{
          time: layout.baseStart as Time, position: 'belowBar', shape: 'arrowUp', color: '#38BDF8', text: 'เริ่มฐาน',
        }]);
      }
    }
    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => chart.applyOptions({ width: el.clientWidth }));
    ro.observe(el);
    return () => { ro.disconnect(); chart.remove(); };
  }, [status, data, layout, height, pivot, showBase]);

  const drawn = status === 'ready' && showBase;

  return (
    <div
      className="bg-[#13161e] border border-white/[0.07] rounded-xl overflow-hidden"
      data-testid="vcp-chart"
      data-pivot={drawn ? pivot!.toFixed(2) : undefined}
      data-base-start={drawn && baseStart ? baseStart : undefined}
    >
      <div className="flex items-center gap-3 flex-wrap px-4 py-2.5 border-b border-white/[0.06] text-[10px] text-white/40">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 rounded-full" style={{ background: '#FF5722' }} />SMA50
        </span>
        {drawn && (
          <span className="flex items-center gap-1.5">
            <span className="w-3 border-t border-dashed" style={{ borderColor: '#F9C942' }} />
            Pivot {pivot!.toFixed(2)}
          </span>
        )}
        {drawn && baseStart && (
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm" style={{ background: '#38BDF8' }} />
            เริ่มฐาน <span className="tabular-nums">{baseStart}</span>
          </span>
        )}
        {drawn && baseBeyondData && <span className="text-amber-400/70">ฐานยาวเกินข้อมูลที่มี — ไม่มี marker เริ่มฐาน</span>}
        {status === 'ready' && !showBase && <span>no base — ไม่มีเส้น pivot / จุดเริ่มฐาน</span>}
      </div>

      <div className="relative" style={{ minHeight: height }}>
        {status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[12px] text-white/30 animate-pulse">กำลังโหลดกราฟ...</span>
          </div>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <span className="text-[12px] text-white/40">โหลดข้อมูลราคา {ticker} ไม่ได้</span>
            <a
              href={tradingViewUrl(ticker)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12px] text-sky-400 hover:underline"
            >
              เปิดกราฟใน TradingView ↗
            </a>
          </div>
        )}
        <div ref={containerRef} className="w-full" style={{ visibility: status === 'ready' ? 'visible' : 'hidden' }} />
      </div>

      {showBase && (
        <p className="px-4 py-1.5 border-t border-white/[0.06] text-[10px] text-white/30">
          ตำแหน่งเริ่มฐานเป็นค่าประมาณจากจำนวนสัปดาห์
        </p>
      )}
    </div>
  );
}
