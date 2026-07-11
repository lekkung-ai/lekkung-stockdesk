'use client';

import { useState, useEffect } from 'react';
import TopRSRow, { type RSSignals } from './TopRSRow';

export interface TopRSRowData {
  ticker: string;
  sector: string | null;
  rsScore: number;
  stage: string | null;
  signals: RSSignals;
}

interface TopRSTableProps {
  rows: TopRSRowData[];
}

export default function TopRSTable({ rows }: TopRSTableProps) {
  const [quotes, setQuotes] = useState<Record<string, number | null>>({});

  const tickerKey = rows.map(r => r.ticker).join(',');

  useEffect(() => {
    if (rows.length === 0) return;
    let cancelled = false;

    // Batch fetch (same pattern as ScannerTable/MyStocks) instead of one
    // /api/quote round trip per row — /api/prices keys its response by the
    // plain ticker (no .BK suffix), so no extra normalization needed here.
    fetch(`/api/prices?symbols=${encodeURIComponent(tickerKey)}`)
      .then(res => res.ok ? res.json() : { prices: {} })
      .then((data: { prices?: Record<string, { changePercent?: number }> }) => {
        if (cancelled) return;
        const prices = data.prices ?? {};
        const map: Record<string, number | null> = {};
        for (const row of rows) {
          map[row.ticker] = prices[row.ticker]?.changePercent ?? null;
        }
        setQuotes(map);
      })
      .catch(() => { if (!cancelled) setQuotes({}); });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickerKey]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-white/[0.05] bg-white/[0.01]">
            <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-white/25 uppercase tracking-wider w-8">#</th>
            <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-white/25 uppercase tracking-wider">Ticker</th>
            <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-white/25 uppercase tracking-wider">Stage</th>
            <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-white/25 uppercase tracking-wider">Signals</th>
            <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-white/25 uppercase tracking-wider whitespace-nowrap">1D%</th>
            <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-white/25 uppercase tracking-wider">RS</th>
            <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-white/25 uppercase tracking-wider hidden sm:table-cell">Trend</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <TopRSRow
              key={row.ticker}
              rank={i + 1}
              ticker={row.ticker}
              sector={row.sector}
              rsScore={row.rsScore}
              stage={row.stage}
              signals={row.signals}
              change1d={quotes[row.ticker] ?? null}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
