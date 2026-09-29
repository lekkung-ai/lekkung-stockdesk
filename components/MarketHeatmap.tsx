'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { squarify } from '@/lib/treemap';
import { weightedChange, formatPct } from '@/lib/sectorChange';
import { formatThaiDate } from '@/lib/utils';

export interface HeatStock {
  ticker: string;
  mcap: number;
  chg: number | null;
  price: number | null;
  rs: number | null;
  stage: string | null;
  // Set on the aggregated "อื่นๆ" box of the home-page heatmap
  other?: { count: number; pct: number | null; href: string; movers: { ticker: string; chg: number }[] };
}

export interface HeatGroup {
  key: string;
  label: string;
  href?: string;
  stocks: HeatStock[];
}

const HEADER_H = 18;
const GAP = 2;

// −3% → deep red, 0 → grey, +3% → deep green (linear between)
const RED: [number, number, number] = [176, 32, 44];
const GREY: [number, number, number] = [58, 63, 75];
const GREEN: [number, number, number] = [24, 138, 78];

export function heatColor(chg: number | null): string {
  if (chg == null || !Number.isFinite(chg)) return '#2a2e39';
  const t = Math.max(-1, Math.min(1, chg / 3));
  const target = t < 0 ? RED : GREEN;
  const k = Math.abs(t);
  const c = GREY.map((v, i) => Math.round(v + (target[i] - v) * k));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

const fmtMcap = (v: number) =>
  v >= 1e12 ? `${(v / 1e12).toFixed(2)} ล้านล้าน` : v >= 1e9 ? `${(v / 1e9).toFixed(1)} พันล้าน` : `${(v / 1e6).toFixed(0)} ล้าน`;

export function HeatmapLegend({ fetchedAt }: { fetchedAt?: string | null }) {
  const stops = [-3, -2, -1, 0, 1, 2, 3];
  return (
    <div className="flex items-center gap-2 text-[10.5px] text-white/45 flex-wrap">
      <span>% วันนี้</span>
      <div className="flex">
        {stops.map(s => (
          <div key={s} className="w-11 h-4 text-[9.5px] text-white/90 text-center leading-4 font-mono" style={{ background: heatColor(s) }}>
            {s > 0 ? `+${s}%` : s < 0 ? `−${Math.abs(s)}%` : '0%'}
          </div>
        ))}
      </div>
      <span>· ขนาดกล่อง = market cap · ≤ −3% แดงเข้มสุด / ≥ +3% เขียวเข้มสุด</span>
      {fetchedAt && <span className="text-white/40">· ข้อมูลล่าช้า 15 นาที · อัปเดต {formatThaiDate(fetchedAt)}</span>}
    </div>
  );
}

interface Tip { stock: HeatStock; x: number; y: number }

export default function MarketHeatmap({ groups, height = 600 }: { groups: HeatGroup[]; height?: number }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [tip, setTip] = useState<Tip | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(() => {
    if (width <= 0) return [];
    const sized = groups
      .map(g => {
        const stocks = g.stocks.filter(s => Number.isFinite(s.mcap) && s.mcap > 0);
        return { g, stocks, total: stocks.reduce((a, s) => a + s.mcap, 0) };
      })
      .filter(x => x.total > 0);
    const top = squarify(sized.map(x => ({ item: x, value: x.total })), 0, 0, width, height);
    return top.map(r => {
      const { g, stocks } = r.item;
      const chg = weightedChange(stocks.map(s => ({ mcap: s.mcap, chg: s.chg })));
      const showHeader = r.w >= 56 && r.h >= HEADER_H + 14;
      const hh = showHeader ? HEADER_H : 0;
      const inner = squarify(
        stocks.map(s => ({ item: s, value: s.mcap })),
        GAP, hh + (showHeader ? 0 : GAP), Math.max(0, r.w - GAP * 2), Math.max(0, r.h - hh - GAP * (showHeader ? 1 : 2)),
      );
      return { rect: r, group: g, chg, showHeader, inner };
    });
  }, [groups, width, height]);

  return (
    <div
      ref={wrapRef}
      data-testid="market-heatmap"
      className="relative w-full overflow-hidden rounded-xl bg-[#0b0d12] border border-white/[0.07]"
      style={{ height }}
      onMouseLeave={() => setTip(null)}
    >
      {layout.map(({ rect, group, chg, showHeader, inner }) => (
        <div
          key={group.key}
          className="absolute overflow-hidden bg-[#13161e]"
          style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, outline: '1px solid #0b0d12', outlineOffset: -1 }}
        >
          {showHeader && (
            <div className="flex items-center justify-between gap-2 px-1.5 text-[11px] font-bold text-white/90 whitespace-nowrap overflow-hidden" style={{ height: HEADER_H }}>
              {group.href ? (
                <Link href={group.href} className="truncate hover:underline">{group.label}</Link>
              ) : (
                <span className="truncate">{group.label}</span>
              )}
              <span className={`font-mono flex-shrink-0 ${chg.pct == null ? 'text-white/30' : chg.pct > 0 ? 'text-emerald-400' : chg.pct < 0 ? 'text-rose-400' : 'text-white/50'}`}>
                {formatPct(chg.pct)}
              </span>
            </div>
          )}
          {inner.map(({ item: s, x, y, w, h }) => {
            const showTicker = w >= 34 && h >= 18;
            const showPct = w >= 34 && h >= 32;
            const fs = Math.max(9, Math.min(18, Math.min(w / 5.2, h / 2.6)));
            return (
              <Link
                key={s.ticker}
                href={s.other ? s.other.href : `/stock/${s.ticker}`}
                aria-label={`${s.ticker} ${formatPct(s.chg)}`}
                className="absolute flex flex-col items-center justify-center overflow-hidden text-white leading-tight hover:brightness-125 hover:z-10"
                style={{ left: x, top: y, width: w, height: h, background: heatColor(s.chg), outline: '1px solid #0b0d12', outlineOffset: -0.5 }}
                onMouseMove={e => {
                  const box = wrapRef.current?.getBoundingClientRect();
                  if (box) setTip({ stock: s, x: e.clientX - box.left, y: e.clientY - box.top });
                }}
              >
                {showTicker && <span className="font-bold" style={{ fontSize: fs }}>{s.ticker}</span>}
                {showPct && <span className="font-mono opacity-90" style={{ fontSize: Math.max(9, fs * 0.72) }}>{formatPct(s.chg)}</span>}
              </Link>
            );
          })}
        </div>
      ))}

      {tip && (
        <div
          className="pointer-events-none absolute z-20 rounded-lg border border-white/15 bg-[#0f1218]/95 px-3 py-2 text-[11.5px] text-white shadow-xl space-y-0.5"
          style={{ left: Math.min(tip.x + 14, Math.max(0, width - 200)), top: Math.min(tip.y + 14, height - (tip.stock.other ? 250 : 130)) }}
        >
          <p className="text-[13px] font-extrabold">{tip.stock.ticker}</p>
          {tip.stock.other ? (
            <>
              <p>{tip.stock.other.count} หุ้น · ถ่วง market cap <span className={`font-mono ${(tip.stock.other.pct ?? 0) > 0 ? 'text-emerald-400' : (tip.stock.other.pct ?? 0) < 0 ? 'text-rose-400' : ''}`}>{formatPct(tip.stock.other.pct)}</span></p>
              <p>Market cap รวม <span className="font-mono">{fmtMcap(tip.stock.mcap)}</span></p>
              <p className="text-white/40 pt-0.5">5 ตัวที่ขึ้น/ลงแรงสุด</p>
              {tip.stock.other.movers.map(m => (
                <p key={m.ticker} className="flex justify-between gap-6"><span>{m.ticker}</span><span className={`font-mono ${m.chg > 0 ? 'text-emerald-400' : m.chg < 0 ? 'text-rose-400' : ''}`}>{formatPct(m.chg)}</span></p>
              ))}
              <p className="text-white/40 pt-0.5">คลิกเพื่อดูทุกตัว</p>
            </>
          ) : (<>
          <p>ราคา <span className="font-mono">{tip.stock.price != null ? tip.stock.price.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}</span></p>
          <p>วันนี้ <span className={`font-mono ${tip.stock.chg == null ? '' : tip.stock.chg > 0 ? 'text-emerald-400' : tip.stock.chg < 0 ? 'text-rose-400' : ''}`}>{formatPct(tip.stock.chg)}</span></p>
          <p>Market cap <span className="font-mono">{fmtMcap(tip.stock.mcap)}</span></p>
          <p>RS <span className="font-mono">{tip.stock.rs ?? '—'}</span> · Stage <span className="font-mono">{tip.stock.stage ?? '—'}</span></p>
          </>)}
        </div>
      )}
    </div>
  );
}
