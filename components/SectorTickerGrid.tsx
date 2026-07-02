'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import type { ScanEntry } from '@/lib/scanData';
import rsRaw from '@/data/scans/rs_ranking.json';
import stageRaw from '@/data/scans/stage_all.json';

type LivePrice = { price: number; changePercent: number };
type TickerWithScan = { ticker: string; scan: ScanEntry | null };
type SubsectorData = { subsector: string; tickers: TickerWithScan[] };

const rsMap = new Map<string, number>(
  (rsRaw as { Ticker: string; RS_Rating: number }[]).map(r => [r.Ticker, r.RS_Rating])
);
const stageAllMap = new Map<string, string>(
  (stageRaw as { Ticker: string; Stage: string }[]).map(r => [r.Ticker, r.Stage])
);

interface Bar { time: string; open: number; high: number; low: number; close: number; }

function stageCls(stage: string | null): string {
  if (!stage) return 'bg-white/[0.08] text-white/35';
  if (stage === 'Bull' || stage === 'S.Bull') return 'bg-[#EAF3DE] text-[#27500A]';
  if (stage === 'Accumulation' || stage === 'Recovery') return 'bg-[#E6F1FB] text-[#0C447C]';
  if (stage === 'Warning') return 'bg-[#FAEEDA] text-[#633806]';
  if (stage === 'UNKNOWN' || stage === 'Unknown') return 'bg-[#333333] text-[#A0A0A0]';
  return 'bg-[#FCEBEB] text-[#791F1F]';
}

function rsBarColor(score: number): string {
  if (score >= 80) return '#1D9E75';
  if (score >= 50) return '#BA7517';
  return '#E24B4A';
}

// ── Canvas drawing ──────────────────────────────────────────────────────────

function drawCandlestick(canvas: HTMLCanvasElement, bars: Bar[]): void {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  if (!W || !H || !bars.length) return;

  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);

  const maxH = Math.max(...bars.map(b => b.high));
  const minL = Math.min(...bars.map(b => b.low));
  const span = maxH - minL || 1;
  const PAD = 2;
  const n = bars.length;
  const slotW = W / n;
  const bw = Math.max(1, slotW * 0.6);
  const toY = (v: number) => PAD + ((maxH - v) / span) * (H - PAD * 2);

  bars.forEach((bar, i) => {
    const cx = i * slotW + slotW / 2;
    const bull = bar.close >= bar.open;
    const color = bull ? '#26a69a' : '#ef5350';
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(cx, toY(bar.high));
    ctx.lineTo(cx, toY(bar.low));
    ctx.stroke();

    const top = toY(Math.max(bar.open, bar.close));
    const bot = toY(Math.min(bar.open, bar.close));
    ctx.fillRect(cx - bw / 2, top, bw, Math.max(1, bot - top));
  });
}

// ── Throttled fetch queue — max 5 concurrent, 300 ms between batches ────────

type QueueEntry = {
  ticker: string;
  resolve: (bars: Bar[]) => void;
  reject: (err: unknown) => void;
};
const _queue: QueueEntry[] = [];
let _running = false;

async function _processQueue() {
  if (_running) return;
  _running = true;
  while (_queue.length > 0) {
    const batch = _queue.splice(0, 5);
    await Promise.all(
      batch.map(({ ticker, resolve, reject }) =>
        fetch(`/api/chart/${encodeURIComponent(ticker)}?interval=1d&range=2mo`)
          .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
          .then(({ data = [] }: { data: Bar[] }) => resolve(data))
          .catch(reject)
      )
    );
    if (_queue.length > 0) await new Promise(r => setTimeout(r, 300));
  }
  _running = false;
}

function queueChartFetch(ticker: string): Promise<Bar[]> {
  return new Promise((resolve, reject) => {
    _queue.push({ ticker, resolve, reject });
    _processQueue();
  });
}

// ── Lazy-load candlestick per ticker ────────────────────────────────────────

type ChartStatus = 'idle' | 'loading' | 'ok' | 'insufficient' | 'error';

function TickerCandleChart({ ticker }: { ticker: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [bars, setBars] = useState<Bar[]>([]);
  const [status, setStatus] = useState<ChartStatus>('idle');
  const fetchedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const el = wrapRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || fetchedRef.current) return;
        fetchedRef.current = true;
        obs.disconnect();
        setStatus('loading');
        queueChartFetch(ticker)
          .then((data: Bar[]) => {
            if (cancelled) return;
            if (data.length < 5) {
              setStatus('insufficient');
            } else {
              setBars(data);
              setStatus('ok');
            }
          })
          .catch(() => { if (!cancelled) setStatus('error'); });
      },
      { rootMargin: '120px' }
    );
    obs.observe(el);
    return () => { cancelled = true; obs.disconnect(); };
  }, [ticker]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !bars.length) return;
    const raf = requestAnimationFrame(() => drawCandlestick(c, bars));
    return () => cancelAnimationFrame(raf);
  }, [bars, ticker]);

  return (
    <div ref={wrapRef} className="relative w-full my-1.5" style={{ height: 55 }}>
      {status === 'loading' && (
        <div className="absolute inset-0 rounded bg-white/[0.03] animate-pulse" />
      )}
      {status === 'insufficient' && (
        <div className="absolute inset-0 rounded bg-white/[0.03] flex items-center justify-center">
          <span className="text-[9px] text-white/20">ไม่มีข้อมูลเพียงพอ</span>
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 rounded bg-white/[0.04] flex items-center justify-center">
          <span className="text-[9px] text-white/25">N/A</span>
        </div>
      )}
      {status === 'idle' && (
        <div className="absolute inset-0 rounded bg-white/[0.02]" />
      )}
      {/* canvas transparent until drawn; sits on top of overlay divs */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ opacity: status === 'ok' ? 1 : 0 }}
      />
    </div>
  );
}

// ── Main grid ────────────────────────────────────────────────────────────────

export default function SectorTickerGrid({ subsectors }: { subsectors: SubsectorData[] }) {
  const [priceMap, setPriceMap] = useState<Record<string, LivePrice>>({});

  useEffect(() => {
    const allTickers = subsectors.flatMap(s => s.tickers.map(t => t.ticker));
    if (allTickers.length === 0) return;
    fetch(`/api/prices?symbols=${allTickers.map(t => encodeURIComponent(t)).join(',')}`)
      .then(r => r.json())
      .then(json => { if (json.prices) setPriceMap(json.prices); })
      .catch(() => {});
  }, [subsectors]);

  return (
    <div className="space-y-5">
      {subsectors.map(sub => (
        <div key={sub.subsector} className="bg-[#13161e] border border-white/[0.07] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
            <p className="text-[13px] font-semibold text-white">{sub.subsector}</p>
            <span className="text-[11px] text-white/30">{sub.tickers.length} หุ้น</span>
          </div>
          <div className="p-3 grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {sub.tickers.map(({ ticker, scan }) => {
              const live = priceMap[ticker];
              return scan ? (
                <Link
                  key={ticker}
                  href={`/stock/${ticker}`}
                  className="bg-white/[0.04] hover:bg-white/[0.07] rounded-lg p-3 transition-colors block"
                >
                  {/* Header: ticker + price */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-[13px] font-bold text-white leading-tight">{ticker}</span>
                    <div className="text-right flex-shrink-0">
                      {live ? (
                        <>
                          <div className="text-[17px] font-medium text-white tabular-nums leading-tight">
                            {live.price.toFixed(2)}
                          </div>
                          <div className={`text-[12px] font-medium tabular-nums leading-tight ${live.changePercent >= 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>
                            {live.changePercent >= 0 ? '+' : ''}{live.changePercent.toFixed(2)}%
                          </div>
                        </>
                      ) : (
                        <span className="text-[17px] font-medium text-white/40 tabular-nums">
                          {scan.price.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Stage + signal badges */}
                  <div className="flex flex-wrap gap-1 mb-1">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${stageCls(scan.stage || 'UNKNOWN')}`}>
                      {scan.stage || 'UNKNOWN'}
                    </span>
                    {scan.sepa && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#EAF3DE] text-[#27500A]">SEPA</span>
                    )}
                    {scan.kell && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#E6F1FB] text-[#0C447C]">Kell</span>
                    )}
                    {scan.breakout && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#E6F1FB] text-[#0C447C]">BO</span>
                    )}
                  </div>

                  {/* Candlestick chart */}
                  <TickerCandleChart ticker={ticker} />

                  {/* RS bar + combo */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1 bg-white/[0.08] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${scan.rs_score}%`, backgroundColor: rsBarColor(scan.rs_score) }}
                      />
                    </div>
                    <span
                      className="text-[11px] font-semibold tabular-nums w-6 text-right flex-shrink-0"
                      style={{ color: rsBarColor(scan.rs_score) }}
                    >
                      {scan.rs_score}
                    </span>
                    <span className="text-[10px] text-white/30 flex-shrink-0">{scan.combo_score}/4</span>
                  </div>
                </Link>
              ) : (() => {
                const rs = rsMap.get(ticker) ?? null;
                const stage = stageAllMap.get(ticker) ?? null;
                return (
                  <Link
                    key={ticker}
                    href={`/stock/${ticker}`}
                    className="bg-white/[0.04] hover:bg-white/[0.07] rounded-lg p-3 transition-colors block"
                  >
                    {/* Header: ticker + price */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="text-[13px] font-bold text-white leading-tight">{ticker}</span>
                      <div className="text-right flex-shrink-0">
                        {live ? (
                          <>
                            <div className="text-[17px] font-medium text-white tabular-nums leading-tight">
                              {live.price.toFixed(2)}
                            </div>
                            <div className={`text-[12px] font-medium tabular-nums leading-tight ${live.changePercent >= 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>
                              {live.changePercent >= 0 ? '+' : ''}{live.changePercent.toFixed(2)}%
                            </div>
                          </>
                        ) : (
                          <span className="text-[17px] font-medium text-white/40 tabular-nums">—</span>
                        )}
                      </div>
                    </div>

                    {/* Stage badge */}
                    <div className="flex flex-wrap gap-1 mb-1">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${stageCls(stage || 'UNKNOWN')}`}>
                        {stage || 'UNKNOWN'}
                      </span>
                    </div>

                    {/* Candlestick chart */}
                    <TickerCandleChart ticker={ticker} />

                    {/* RS bar */}
                    {rs !== null && (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1 bg-white/[0.08] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${rs}%`, backgroundColor: rsBarColor(rs) }}
                          />
                        </div>
                        <span
                          className="text-[11px] font-semibold tabular-nums w-6 text-right flex-shrink-0"
                          style={{ color: rsBarColor(rs) }}
                        >
                          {rs}
                        </span>
                      </div>
                    )}
                  </Link>
                );
              })();
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
