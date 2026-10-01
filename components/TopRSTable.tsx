'use client';

import TopRSRow, { type RSSignals } from './TopRSRow';
import { useMarketQuotes } from '@/lib/useMarketQuotes';

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
  // 1D% from /api/market-quotes (one TradingView call for all of sector_map, server-cached 60s) —
  // /api/prices is unreliable for this table. No quote / fetch failed → ChangeBadge shows "—".
  const { quotes } = useMarketQuotes();

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
              change1d={quotes[row.ticker]?.chg ?? null}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
