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

    Promise.allSettled(
      rows.map(async row => {
        const res = await fetch(`/api/quote/${row.ticker}`);
        if (!res.ok) return { ticker: row.ticker, change1d: null };
        const data = await res.json() as { change1d?: number };
        return { ticker: row.ticker, change1d: data.change1d ?? null };
      })
    ).then(results => {
      if (cancelled) return;
      const map: Record<string, number | null> = {};
      for (const r of results) {
        if (r.status === 'fulfilled') {
          map[r.value.ticker] = r.value.change1d;
        }
      }
      setQuotes(map);
    });

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
