'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createChart, CandlestickSeries, LineSeries, HistogramSeries, ColorType, LineStyle, createSeriesMarkers } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts';

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

// ── Market Stage (opt-in via stageMarker) ────────────────────────────────────
// getStage is a 1:1 port of get_stage() in the pipeline's
// tools/scanner/scan_pine_stages.py, and calcEMA above already matches that
// script's tv_ema (SMA seed, then ewm with adjust=False), so the stage computed
// here is the same label market_stage.json carries — recomputed per bar, which
// the JSON itself cannot give us (it only stores today's stage + Bar_Count).
type Stage =
  | 'S.Bull' | 'Bull' | 'Accumulation' | 'Recovery'
  | 'Warning' | 'Distribution' | 'Bear' | 'UNKNOWN';

function getStage(p: number, e15?: number, e50?: number, e200?: number): Stage {
  if (e200 == null || e50 == null || p == null) return 'UNKNOWN';
  if (p > e50 && p < e200 && e50 < e200) return 'Recovery';
  if (p > e50 && p > e200 && e50 < e200) return 'Accumulation';
  if (p > e50 && p > e200 && e50 > e200) {
    if (e15 != null && p > e15 && e15 > e50) return 'S.Bull';
    return 'Bull';
  }
  if (p < e50 && p > e200 && e50 > e200) return 'Warning';
  if (p < e50 && p < e200 && e50 > e200) return 'Distribution';
  if (p < e50 && p < e200 && e50 < e200) return 'Bear';
  return 'UNKNOWN';
}

// First bar of the current stage run — i.e. the day the status actually flipped
// INTO today's stage. Deliberately stricter than the table's "Days In Stage"
// (Bar_Count), which folds an earlier S.Bull stretch into a current Bull run:
// here a Bull run starts the day it stopped being S.Bull.
// Returns null when the run reaches the oldest bar we can classify — the real
// entry is then older than the ~2y the chart loads, and pinning the first
// classifiable bar would claim a stage change that never happened there.
function findStageRunStart(data: OhlcvPoint[]): { stage: Stage; time: string } | null {
  if (data.length < 200) return null;
  const asMap = (pts: { time: string; value: number }[]) =>
    new Map(pts.map(p => [p.time, p.value]));
  const e15 = asMap(calcEMA(data, 15));
  const e50 = asMap(calcEMA(data, 50));
  const e200 = asMap(calcEMA(data, 200));

  const stageAt = (i: number): Stage => {
    const t = data[i].time;
    return getStage(data[i].close, e15.get(t), e50.get(t), e200.get(t));
  };

  const last = data.length - 1;
  const current = stageAt(last);
  if (current === 'UNKNOWN') return null;

  let firstIdx = last;
  for (let i = last; i >= 0; i--) {
    if (stageAt(i) !== current) break;
    firstIdx = i;
  }
  if (firstIdx === 0 || stageAt(firstIdx - 1) === 'UNKNOWN') return null;
  return { stage: current, time: data[firstIdx].time };
}

// ── RS vs SET (opt-in via showRsLine) ────────────────────────────────────────
// เส้น relative strength = (ราคาหุ้น / ราคาหุ้นวันแรกของช่วงที่แสดง) หาร
// (SET / SET วันแรกของช่วงเดียวกัน) → เริ่มที่ 1.0 เสมอ, เส้นขึ้น = หุ้นแข็งกว่าดัชนี
//
// ⚠️ นิยามคนละตัวกับเลข "RS Rating" 1-99 บนการ์ด/ตาราง — อันนั้นคือ percentile ของ
// ผลตอบแทนถ่วงน้ำหนักเทียบหุ้นตัวอื่นทั้งตลาด (tools/core/3_calculate_rs.py) ไม่ได้
// หารด้วยดัชนี ทิศทางมักไปทางเดียวกันแต่ไม่ใช่ค่าเดียวกัน
//
// บาร์ที่ไม่มีราคา SET จะถูกข้าม (ไม่ปัก 0 ไม่ลากเส้นดิ่ง) — จำเป็นจริง เพราะ
// ฟีด ^SET.BK ของ Yahoo หยุดส่งตั้งแต่ 2026-07-17 เส้นจึงจบเท่าที่ข้อมูลดัชนีมี
const SET_BENCHMARK_SYMBOL = '^SET.BK';

function computeRsSeries(
  data: OhlcvPoint[],
  setCloseByDate: Map<string, number>,
  fromDate: string
): { time: string; value: number }[] {
  const out: { time: string; value: number }[] = [];
  let basePrice: number | null = null;
  let baseSet: number | null = null;
  for (const bar of data) {
    if (bar.time < fromDate) continue;
    const setClose = setCloseByDate.get(bar.time);
    if (setClose == null || !Number.isFinite(setClose) || setClose <= 0) continue;
    if (!Number.isFinite(bar.close) || bar.close <= 0) continue;
    if (basePrice === null) {
      basePrice = bar.close;
      baseSet = setClose;
    }
    const value = (bar.close / basePrice) / (setClose / (baseSet as number));
    if (Number.isFinite(value)) out.push({ time: bar.time, value: parseFloat(value.toFixed(4)) });
  }
  return out;
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

export default function StockChart({ ticker, height = 350, isPpbp = false, showEma10 = false, showSma50 = false, showSma150 = false, highlightDates, highlightColor = '#f59e0b', reentryDates, reentryColor = '#22c55e', stageMarker = false, stageMarkerColor = '#F472B6', defaultTimeframe = '6M', showRsLine = false, rsLineColor = '#FB923C' }: { ticker: string; height?: number; isPpbp?: boolean; showEma10?: boolean; showSma50?: boolean; showSma150?: boolean; highlightDates?: string[]; highlightColor?: string; reentryDates?: string[]; reentryColor?: string; stageMarker?: boolean; stageMarkerColor?: string; defaultTimeframe?: Timeframe; showRsLine?: boolean; rsLineColor?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const rsSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [chartData, setChartData] = useState<OhlcvPoint[]>([]);
  const [setBars, setSetBars] = useState<OhlcvPoint[]>([]);
  const [timeframe, setTimeframe] = useState<Timeframe>(defaultTimeframe);
  const timeframeRef = useRef<Timeframe>(defaultTimeframe);

  // Sync ref so chart creation reads current timeframe without being a dep
  useEffect(() => { timeframeRef.current = timeframe; }, [timeframe]);

  // Memoised so the object identity is stable across renders — it feeds the
  // chart-creation effect's dep array, and a fresh value there would tear the
  // chart down and reset the user's zoom on every render.
  const stageRun = useMemo(
    () => (stageMarker && chartData.length ? findStageRunStart(chartData) : null),
    [stageMarker, chartData]
  );

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

  // Benchmark fetch — เฉพาะตอนเปิด RS line เท่านั้น หน้าอื่นไม่ยิง request เพิ่ม
  useEffect(() => {
    if (!showRsLine) { setSetBars([]); return; }
    let cancelled = false;
    fetch(`/api/chart/${encodeURIComponent(SET_BENCHMARK_SYMBOL)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(json => {
        if (cancelled || !json || !Array.isArray(json.data)) return;
        setSetBars(json.data);
      })
      .catch(() => {
        // ดึงดัชนีไม่ได้ = ไม่วาดเส้น RS เฉยๆ กราฟราคายังทำงานปกติ
      });
    return () => { cancelled = true; };
  }, [showRsLine]);

  const setCloseByDate = useMemo(
    () => new Map(setBars.map(b => [b.time, b.close])),
    [setBars]
  );

  // วันสุดท้ายที่ดัชนีมีข้อมูล - ใช้บอกผู้ใช้ตรงๆ เมื่อเส้น RS จบก่อนแท่งเทียน
  const rsThroughDate = useMemo(
    () => (setBars.length ? setBars[setBars.length - 1].time : null),
    [setBars]
  );

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
    if (hasHighlight || hasReentry || stageRun) {
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

      if (stageRun && validTimes.has(stageRun.time)) {
        allMarkers.push({
          time: stageRun.time as Time,
          position: 'belowBar',
          shape: 'arrowUp',
          color: stageMarkerColor,
          text: `เข้า ${stageRun.stage}`,
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

    // ── RS vs SET ──────────────────────────────────────────────────────────
    // อยู่บน price scale ของตัวเอง ('rs') ที่ซ่อนแกนไว้ — ราคา/EMA จึงไม่ถูกบีบ
    // สเกลจากตัวเลข ratio ที่วิ่งอยู่แถวๆ 1.0 (คนละหน่วยกับราคาหุ้นคนละหลัก)
    rsSeriesRef.current = null;
    if (showRsLine && setCloseByDate.size > 0) {
      const rsData = computeRsSeries(chartData, setCloseByDate, startDate);
      if (rsData.length >= 2) {
        const rsSeries = chart.addSeries(LineSeries, {
          // แกนซ้ายจริง ไม่ใช่ overlay scale ('rs') แบบเดิม — overlay ไม่มีแกนให้เห็น
          // เลยไม่มีอะไรยืนยันว่าเส้นถูกวาด และถ้ามันไม่ถูกวาดก็ดูไม่ออก การย้ายมา
          // แกนซ้ายทำให้มีตัวเลข ratio โผล่ข้างซ้าย = เห็นได้ทันทีว่าเส้นนี้มีอยู่จริง
          // และยังแยกสเกลจากราคา/EMA (แกนขวา) เหมือนเดิมทุกประการ
          priceScaleId: 'left',
          color: rsLineColor,
          lineWidth: 2,
          // เส้นประ + สีส้ม เพื่อไม่ให้อ่านสลับกับ EMA200 (#AA00FF ม่วง) ซึ่งเป็นเส้น
          // ทึบสีใกล้กันกับสีเดิม (#a78bfa) จนดูเหมือนเส้นเดียวกัน - RS ไม่ได้อยู่
          // หน่วยเดียวกับราคา จึงควรอ่านออกทันทีว่าเป็นคนละชนิด
          lineStyle: LineStyle.Dashed,
          lastValueVisible: false,
          priceLineVisible: false,
        });
        rsSeries.setData(rsData);
        // เปิดแกนซ้ายเฉพาะตอนมีเส้น RS เท่านั้น (หน้าอื่นที่ไม่ส่ง showRsLine
        // จะไม่มีแกนซ้ายโผล่มา layout เดิมไม่ขยับ)
        chart.applyOptions({
          leftPriceScale: {
            visible: true,
            borderColor: 'rgba(255,255,255,0.08)',
            scaleMargins: { top: 0.1, bottom: 0.3 },
          },
        });
        // เส้นอ้างอิงที่ 1.0 = เสมอกับ SET — เหนือเส้นนี้คือชนะตลาด
        rsSeries.createPriceLine({
          price: 1,
          color: 'rgba(251,146,60,0.35)',
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: false,
          title: '',
        });
        rsSeriesRef.current = rsSeries;
      }
    }

    chartRef.current = chart;

    const ro = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    });
    ro.observe(containerRef.current);

    return () => { ro.disconnect(); rsSeriesRef.current = null; chart.remove(); chartRef.current = null; };
  }, [status, chartData, height, isPpbp, highlightDates, highlightColor, reentryDates, reentryColor, stageRun, stageMarkerColor, showRsLine, rsLineColor, setCloseByDate]);

  // Update visible range when timeframe changes (chart already created)
  useEffect(() => {
    if (!chartRef.current || !chartData.length) return;
    const startDate = getStartDate(timeframe);
    const lastDate = chartData[chartData.length - 1].time;
    chartRef.current.timeScale().setVisibleRange({ from: startDate as Time, to: lastDate as Time });

    // RS ถูก rebase ที่บาร์แรกของ "ช่วงที่แสดง" เปลี่ยน timeframe จึงต้องคำนวณใหม่
    // ทั้งเส้น ไม่งั้นจุดเริ่ม 1.0 จะค้างอยู่ที่ช่วงเดิม
    if (rsSeriesRef.current && setCloseByDate.size > 0) {
      rsSeriesRef.current.setData(computeRsSeries(chartData, setCloseByDate, startDate));
    }
  }, [timeframe, chartData, setCloseByDate]);

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
          {showRsLine && setBars.length > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 rounded-full" style={{ background: rsLineColor }} />
              <span className="text-[10px] text-white/30">
                RS vs SET
                {rsThroughDate && chartData.length > 0 && rsThroughDate < chartData[chartData.length - 1].time && (
                  <span className="text-white/25"> (ดัชนีถึง {rsThroughDate})</span>
                )}
              </span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 rounded-full" style={{ background: 'rgba(248,201,66,0.7)' }} />
            <span className="text-[10px] text-white/30">Vol SMA50</span>
          </div>
          {stageRun && (
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ background: stageMarkerColor }} />
              <span className="text-[10px] text-white/30">
                เข้า {stageRun.stage} <span className="tabular-nums">{stageRun.time}</span>
              </span>
            </div>
          )}
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
