'use client';

import { useMemo } from 'react';
import { useMarketQuotes } from '@/lib/useMarketQuotes';
import { weightedChange, formatPct } from '@/lib/sectorChange';

// Today's market-cap-weighted % for a whole sector (all subsectors, unfiltered)
export default function SectorTodayChange({ tickers }: { tickers: string[] }) {
  const { status, quotes } = useMarketQuotes();
  const change = useMemo(
    () => weightedChange(tickers.map(t => ({ mcap: quotes[t]?.mcap, chg: quotes[t]?.chg }))),
    [tickers, quotes],
  );

  if (status === 'loading') return <p className="text-[12px] text-white/25 mt-1">วันนี้ …</p>;
  if (status === 'error' || change.pct == null) {
    return <p className="text-[12px] text-amber-300/70 mt-1">ไม่มีข้อมูลราคาสด</p>;
  }
  const cls = change.pct > 0 ? 'text-emerald-400' : change.pct < 0 ? 'text-rose-400' : 'text-white/50';
  return (
    <p className="text-[13px] mt-1 font-bold tabular-nums">
      <span className="text-white/35 font-medium">วันนี้ </span>
      <span className={cls}>{formatPct(change.pct)}</span>
      <span className="text-white/25 font-medium text-[11px]"> · n={change.n}/{change.total}</span>
    </p>
  );
}
