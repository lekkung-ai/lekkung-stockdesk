'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { squarify } from '@/lib/treemap';
import { weightedChange, formatPct } from '@/lib/sectorChange';
import { formatThaiDate } from '@/lib/utils';
import { heatColor, NO_DATA_COLOR } from '@/lib/heatColor';

export { heatColor };

const PAGE_BG = '#0b0d12';
const TEXT_SHADOW = '0 1px 2px rgba(0,0,0,0.55)';

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
const GROUP_GAP = 3; // between sector/subsector groups
const BOX_GAP = 1; // between stock boxes

const fmtMcap = (v: number) =>
  v >= 1e12 ? `${(v / 1e12).toFixed(2)} ล้านล้าน` : v >= 1e9 ? `${(v / 1e9).toFixed(1)} พันล้าน` : `${(v / 1e6).toFixed(0)} ล้าน`;

export function HeatmapLegend({ fetchedAt }: { fetchedAt?: string | null }) {
  const stops = [-3, -2, -1, 0, 1, 2, 3];
  return (
    <div className="flex items-center gap-2 text-[10.5px] text-white/45 flex-wrap">
      <span>% วันนี้</span>
      <div className="flex">
        {stops.map(s => (
          <div key={s} className="w-11 h-4 text-[9.5px] text-white text-center leading-4 font-mono font-bold" style={{ background: heatColor(s), textShadow: TEXT_SHADOW }}>
            {s > 0 ? `+${s}%` : s < 0 ? `−${Math.abs(s)}%` : '0%'}
          </div>
        ))}
      </div>
      <div className="h-4 px-2 text-[9.5px] leading-4 text-white/50 text-center" style={{ background: NO_DATA_COLOR }}>ไม่มีการซื้อขาย</div>
      <span>· ขนาดกล่อง = market cap</span>
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
        0, hh, r.w, Math.max(0, r.h - hh),
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
          className="absolute overflow-hidden"
          style={{ left: rect.x + GROUP_GAP / 2, top: rect.y + GROUP_GAP / 2, width: Math.max(0, rect.w - GROUP_GAP), height: Math.max(0, rect.h - GROUP_GAP), background: PAGE_BG }}
        >
          {showHeader && (
            <div className="flex items-center justify-between gap-2 px-1.5 text-[11px] font-bold text-white/90 whitespace-nowrap overflow-hidden" style={{ height: HEADER_H }}>
              {group.href ? (
                <Link href={group.href} className="truncate hover:underline">{group.label}</Link>
              ) : (
                <span className="truncate">{group.label}</span>
              )}
              <span className="font-mono font-extrabold flex-shrink-0" style={{ color: chg.pct == null ? 'rgba(255,255,255,0.3)' : heatColor(chg.pct) }}>
                {formatPct(chg.pct)}
              </span>
            </div>
          )}
          {inner.map(({ item: s, x, y, w, h }) => {
            const showTicker = w >= 34 && h >= 18;
            const showPct = w >= 34 && h >= 32;
            const fs = Math.max(9, Math.min(24, Math.min(w / 5.2, h / 2.6)));
            return (
              <Link
                key={s.ticker}
                href={s.other ? s.other.href : `/stock/${s.ticker}`}
                aria-label={`${s.ticker} ${formatPct(s.chg)}`}
                className="absolute flex flex-col items-center justify-center overflow-hidden text-white leading-tight hover:brightness-125 hover:z-10 font-bold"
                style={{ left: x + BOX_GAP / 2, top: y + BOX_GAP / 2, width: Math.max(0, w - BOX_GAP), height: Math.max(0, h - BOX_GAP), background: heatColor(s.chg), textShadow: TEXT_SHADOW }}
                onMouseMove={e => {
                  const box = wrapRef.current?.getBoundingClientRect();
                  if (box) setTip({ stock: s, x: e.clientX - box.left, y: e.clientY - box.top });
                }}
              >
                {showTicker && <span className="font-bold" style={{ fontSize: fs, opacity: s.chg == null ? 0.5 : 1 }}>{s.ticker}</span>}
                {showPct && <span className="font-mono font-bold" style={{ fontSize: Math.max(9, fs * 0.72), opacity: s.chg == null ? 0.5 : 0.92 }}>{formatPct(s.chg)}</span>}
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
