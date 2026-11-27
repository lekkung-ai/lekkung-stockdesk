'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AreaSeries, createChart, ColorType, CrosshairMode, HistogramSeries, LineSeries,
  type IChartApi, type Time,
} from 'lightweight-charts';
import { formatShortThaiDate } from '@/lib/utils';
import {
  CHART_RANGES, DEFAULT_CHART_RANGE, PHASE_BAND, PHASE_INFO, SERIES_COLORS, chartBars, seriesPhaseKey,
  type ChartRange, type Rs7SeriesRow,
} from '@/lib/rs7';

// 2 ชั้น แกนเวลาเดียวกัน (ไม่ใช่กราฟ 2 แกน y): บน = เส้น SET + พื้นหลังช่วง A/B · ล่าง = แท่งซ้อน n1/n2/n3
// lightweight-charts ไม่มีแท่งซ้อน/พื้นหลังสำเร็จรูป → ใช้ histogram ซ้อนกัน (ยอดรวม → n1+n2 → n1 วาดทับกัน)
const TOP_H = 230;
const BOTTOM_H = 150;
const PRICE_SCALE_W = 56;

interface Hover { date: string; x: number; w: number }

const baseOptions = (height: number) => ({
  height,
  layout: { background: { type: ColorType.Solid, color: '#13161e' }, textColor: '#9ca3af', fontSize: 12 },
  grid: { vertLines: { color: 'rgba(255,255,255,0.04)' }, horzLines: { color: 'rgba(255,255,255,0.04)' } },
  rightPriceScale: { borderColor: 'rgba(255,255,255,0.08)', minimumWidth: PRICE_SCALE_W },
  crosshair: {
    mode: CrosshairMode.Normal,
    vertLine: { color: 'rgba(255,255,255,0.25)', labelVisible: false },
    horzLine: { color: 'rgba(255,255,255,0.15)', labelVisible: false },
  },
  handleScroll: false,
  handleScale: false,
});

export default function Rs7Chart({ series }: { series: Rs7SeriesRow[] }) {
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const topChart = useRef<IChartApi | null>(null);
  const bottomChart = useRef<IChartApi | null>(null);
  const [range, setRange] = useState<ChartRange>(DEFAULT_CHART_RANGE);
  const [hover, setHover] = useState<Hover | null>(null);
  const byDate = useMemo(() => new Map(series.map(r => [r.date, r])), [series]);

  useEffect(() => {
    if (!topRef.current || !bottomRef.current || !series.length) return;
    const top = createChart(topRef.current, {
      ...baseOptions(TOP_H), width: topRef.current.clientWidth,
      timeScale: { visible: false, borderVisible: false, fixLeftEdge: true, fixRightEdge: true },
    });
    const bottom = createChart(bottomRef.current, {
      ...baseOptions(BOTTOM_H), width: bottomRef.current.clientWidth,
      timeScale: { borderColor: 'rgba(255,255,255,0.08)', fixLeftEdge: true, fixRightEdge: true },
    });
    topChart.current = top;
    bottomChart.current = bottom;

    // บน: พื้นหลังช่วง (histogram เต็มความสูงบน scale ซ่อน) + เส้น SET
    const bands = top.addSeries(AreaSeries, {
      priceScaleId: 'bands', priceLineVisible: false, lastValueVisible: false, lineVisible: false, crosshairMarkerVisible: false,
      autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 1 } }),
    });
    top.priceScale('bands').applyOptions({ scaleMargins: { top: 0, bottom: 0 }, visible: false });
    bands.setData(series.map(r => {
      const k = seriesPhaseKey(r.phase);
      const c = k === 'A' || k === 'B' ? PHASE_BAND[k] : 'rgba(0,0,0,0)';
      return { time: r.date as Time, value: 1, topColor: c, bottomColor: c, lineColor: c };
    }));
    const line = top.addSeries(LineSeries, {
      color: '#d1d5db', lineWidth: 2, priceLineVisible: false, lastValueVisible: true,
      priceFormat: { type: 'price', precision: 0, minMove: 1 },
    });
    line.setData(series.map(r => ({ time: r.date as Time, value: r.set_close })));
    top.priceScale('right').applyOptions({ scaleMargins: { top: 0.08, bottom: 0.08 } });

    // ล่าง: n1 (ล่าง) → n2 → n3 (บน) ซ้อนกันด้วยยอดสะสม วาดจากสูงสุดไปต่ำสุด
    const maxTotal = Math.max(4, ...series.map(r => r.n1 + r.n2 + r.n3));
    const intFormat = { type: 'custom' as const, minMove: 1, formatter: (v: number) => (Number.isInteger(v) ? String(v) : '') };
    const s3 = bottom.addSeries(HistogramSeries, {
      color: SERIES_COLORS.n3, priceLineVisible: false, lastValueVisible: false, priceFormat: intFormat,
      autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: maxTotal } }),
    });
    const s2 = bottom.addSeries(HistogramSeries, {
      color: SERIES_COLORS.n2, priceLineVisible: false, lastValueVisible: false, priceFormat: intFormat,
    });
    const s1 = bottom.addSeries(HistogramSeries, {
      color: SERIES_COLORS.n1, priceLineVisible: false, lastValueVisible: false, priceFormat: intFormat,
    });
    s3.setData(series.map(r => ({ time: r.date as Time, value: r.n1 + r.n2 + r.n3 })));
    s2.setData(series.map(r => ({ time: r.date as Time, value: r.n1 + r.n2 })));
    s1.setData(series.map(r => ({ time: r.date as Time, value: r.n1 })));
    bottom.priceScale('right').applyOptions({ scaleMargins: { top: 0.1, bottom: 0 } });

    // ซิงก์ช่วงเวลา + crosshair 2 ชั้น
    let lock = false;
    const syncRange = (to: IChartApi) => (r: { from: number; to: number } | null) => {
      if (!r || lock) return;
      lock = true;
      to.timeScale().setVisibleLogicalRange(r);
      lock = false;
    };
    top.timeScale().subscribeVisibleLogicalRangeChange(syncRange(bottom));
    bottom.timeScale().subscribeVisibleLogicalRangeChange(syncRange(top));

    const totals = new Map(series.map(r => [r.date, r]));
    const onMove = (source: 'top' | 'bottom') => (param: { time?: Time; point?: { x: number; y: number } }) => {
      if (lock) return;
      if (!param.time || !param.point) {
        lock = true;
        (source === 'top' ? bottom : top).clearCrosshairPosition();
        lock = false;
        setHover(null);
        return;
      }
      const date = String(param.time);
      const row = totals.get(date);
      if (!row) return;
      lock = true;
      if (source === 'top') bottom.setCrosshairPosition(row.n1 + row.n2 + row.n3, param.time, s3);
      else top.setCrosshairPosition(row.set_close, param.time, line);
      lock = false;
      setHover({ date, x: param.point.x, w: wrapRef.current?.clientWidth ?? 0 });
    };
    top.subscribeCrosshairMove(onMove('top'));
    bottom.subscribeCrosshairMove(onMove('bottom'));

    const ro = new ResizeObserver(() => {
      if (topRef.current) top.applyOptions({ width: topRef.current.clientWidth });
      if (bottomRef.current) bottom.applyOptions({ width: bottomRef.current.clientWidth });
    });
    ro.observe(topRef.current);

    return () => {
      ro.disconnect();
      top.remove();
      bottom.remove();
      topChart.current = null;
      bottomChart.current = null;
    };
  }, [series]);

  // ปุ่มช่วงเวลา: เลื่อนช่วงที่มองเห็น (ข้อมูลทั้ง 252 วันโหลดไว้แล้ว)
  useEffect(() => {
    const t = topChart.current;
    if (!t || !series.length) return;
    const n = series.length;
    const bars = Math.min(chartBars(range), n);
    t.timeScale().setVisibleLogicalRange({ from: n - bars - 0.5, to: n - 0.5 });
  }, [range, series]);

  const row = hover ? byDate.get(hover.date) : null;
  const tipLeft = hover ? (hover.x > hover.w / 2 ? Math.max(8, hover.x - 214) : hover.x + 18) : 0;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-white/60">
          <span><i className="inline-block w-3 h-3 rounded-[3px] mr-1.5 align-[-1px]" style={{ background: SERIES_COLORS.n1 }} />1 Predictive</span>
          <span><i className="inline-block w-3 h-3 rounded-[3px] mr-1.5 align-[-1px]" style={{ background: SERIES_COLORS.n2 }} />2 Coincident</span>
          <span><i className="inline-block w-3 h-3 rounded-[3px] mr-1.5 align-[-1px]" style={{ background: SERIES_COLORS.n3 }} />3 Confirming</span>
          <span><i className="inline-block w-3 h-3 rounded-[3px] mr-1.5 align-[-1px] border border-white/10" style={{ background: PHASE_BAND.A }} />พื้นหลัง ช่วง A</span>
          <span><i className="inline-block w-3 h-3 rounded-[3px] mr-1.5 align-[-1px] border border-white/10" style={{ background: PHASE_BAND.B }} />พื้นหลัง ช่วง B</span>
        </div>
        <div className="flex gap-1.5" role="group" aria-label="ช่วงเวลากราฟ">
          {CHART_RANGES.map(r => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              aria-pressed={range === r.key}
              className={`px-3 py-1 rounded-md text-[13px] cursor-pointer transition-colors ${
                range === r.key ? 'bg-white/15 text-white font-semibold' : 'bg-white/[0.06] text-white/60 hover:bg-white/10'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2 text-[13px] text-white/50">SET Index · พื้นหลังแสดงช่วงดัชนี (ช่วง C / ไม่อยู่ช่วงไหน ไม่ระบาย)</div>
      <div ref={wrapRef} className="relative mt-1" data-testid="rs7-chart">
        <div ref={topRef} style={{ height: TOP_H }} data-testid="rs7-chart-top" />
        <div className="mt-2 text-[13px] text-white/50">จำนวนหุ้นที่เข้าแบบ 1–3 ต่อวัน (ตัว)</div>
        <div ref={bottomRef} style={{ height: BOTTOM_H }} data-testid="rs7-chart-bottom" />
        {hover && row && (
          <div
            className="absolute top-2 z-10 pointer-events-none rounded-lg border border-white/15 bg-[#0b0d12] px-3 py-2 text-[13px] shadow-xl min-w-[196px]"
            style={{ left: tipLeft }}
            data-testid="rs7-tooltip"
          >
            <div className="font-semibold text-white">{formatShortThaiDate(row.date)} {Number(row.date.slice(0, 4)) + 543}</div>
            <TipRow k="SET" v={row.set_close.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} />
            <TipRow k="ช่วง" v={row.phase === '-' ? 'ไม่อยู่ช่วงไหน' : `${PHASE_INFO[seriesPhaseKey(row.phase)].letter} · ${PHASE_INFO[seriesPhaseKey(row.phase)].name}`} />
            <TipRow k="1 Predictive" v={String(row.n1)} color={SERIES_COLORS.n1} />
            <TipRow k="2 Coincident" v={String(row.n2)} color={SERIES_COLORS.n2} />
            <TipRow k="3 Confirming" v={String(row.n3)} color={SERIES_COLORS.n3} />
            <TipRow k="จำนวนกลุ่ม (แบบ 1–3)" v={String(row.n_sectors_123)} />
            <TipRow k="ทุกแบบรวม" v={String(row.n_all)} />
          </div>
        )}
      </div>
      <p className="mt-3 text-[13px] text-white/50 leading-relaxed">
        ข้อมูลประกอบ ไม่ใช่สัญญาณ — Minervini: setup ผุดขึ้นหลายตัวหลายกลุ่มพร้อมกัน = ตลาดใกล้ฟื้น · ดูจำนวนกลุ่มประกอบเสมอ
      </p>
    </div>
  );
}

function TipRow({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <div className="flex justify-between gap-4 text-white/70">
      <span style={color ? { color } : undefined}>{k}</span>
      <span className="tabular-nums text-white">{v}</span>
    </div>
  );
}
