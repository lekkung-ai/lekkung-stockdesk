'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import type { ScanEntry } from '@/lib/scanData';
import rsRaw from '@/data/scans/rs_ranking.json';
import stageRaw from '@/data/scans/stage_all.json';
import {
  TableWrap,
  Th,
  SortableTh,
  SortConfig,
  Td,
  stageCls,
  rsColor,
  formatPE,
} from '@/components/StrategyTable';

type LivePrice = { price: number; changePercent: number };
type TickerWithScan = {
  ticker: string;
  scan: ScanEntry | null;
  pe: number | null;
  pb: number | null;
  roe: number | null;
};
type SubsectorData = { subsector: string; tickers: TickerWithScan[] };

const rsMap = new Map<string, number>(
  (rsRaw as { Ticker: string; RS_Rating: number }[]).map(r => [r.Ticker, r.RS_Rating])
);
const stageAllMap = new Map<string, string>(
  (stageRaw as { Ticker: string; Stage: string }[]).map(r => [r.Ticker, r.Stage])
);

const STAGE_ORDER: Record<string, number> = {
  'S.Bull': 0, 'Bull': 1, 'Accumulation': 2, 'Recovery': 3,
  'Warning': 4, 'Distribution': 5, 'Bear': 6,
};

export default function SectorTickerTable({ subsectors }: { subsectors: SubsectorData[] }) {
  const [priceMap, setPriceMap] = useState<Record<string, LivePrice>>({});
  const [sortBySub, setSortBySub] = useState<Record<string, SortConfig>>({});

  useEffect(() => {
    const allTickers = subsectors.flatMap(s => s.tickers.map(t => t.ticker));
    if (allTickers.length === 0) return;
    fetch(`/api/prices?symbols=${allTickers.map(t => encodeURIComponent(t)).join(',')}`)
      .then(r => r.json())
      .then(json => {
        if (json.prices) setPriceMap(json.prices);
      })
      .catch(() => {});
  }, [subsectors]);

  const handleSort = (subsector: string, key: string) => {
    setSortBySub(prev => {
      const cur = prev[subsector];
      const next: SortConfig =
        cur?.key === key
          ? cur.dir === 'asc'
            ? { key, dir: 'desc' }
            : null
          : { key, dir: 'desc' };
      return { ...prev, [subsector]: next };
    });
  };

  return (
    <div className="space-y-5">
      {subsectors.map(sub => {
        const currentSort = sortBySub[sub.subsector] ?? null;

        const sortedTickers = [...sub.tickers].sort((a, b) => {
          if (!currentSort) return 0;
          const { key, dir } = currentSort;

          const getVal = (item: TickerWithScan) => {
            const live = priceMap[item.ticker];
            if (key === 'ticker') return item.ticker;
            if (key === 'price') return live?.price ?? item.scan?.price ?? null;
            if (key === 'chg') return live?.changePercent ?? null;
            if (key === 'stage') {
              const st = item.scan?.stage ?? stageAllMap.get(item.ticker) ?? null;
              return st != null ? (STAGE_ORDER[st] ?? 99) : null;
            }
            if (key === 'rs') return item.scan?.rs_score ?? rsMap.get(item.ticker) ?? null;
            if (key === 'pe') return item.pe;
            if (key === 'pb') return item.pb;
            if (key === 'roe') return item.roe;
            return null;
          };

          const va = getVal(a);
          const vb = getVal(b);

          if (va === null || va === undefined) return 1;
          if (vb === null || vb === undefined) return -1;

          if (typeof va === 'string' && typeof vb === 'string') {
            return dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
          }

          const na = Number(va);
          const nb = Number(vb);
          return dir === 'asc' ? na - nb : nb - na;
        });

        return (
          <div
            key={sub.subsector}
            className="bg-[#13161e] border border-white/[0.07] rounded-xl overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
              <p className="text-[13px] font-semibold text-white">{sub.subsector}</p>
              <span className="text-[11px] text-white/30">{sub.tickers.length} ตัว</span>
            </div>

            <TableWrap>
              <thead className="border-b border-white/[0.06] bg-white/[0.015]">
                <tr>
                  <SortableTh sortKey="ticker" currentSort={currentSort} onSort={k => handleSort(sub.subsector, k)}>
                    Symbol
                  </SortableTh>
                  <SortableTh right sortKey="price" currentSort={currentSort} onSort={k => handleSort(sub.subsector, k)}>
                    ราคา
                  </SortableTh>
                  <SortableTh right sortKey="chg" currentSort={currentSort} onSort={k => handleSort(sub.subsector, k)}>
                    %chg
                  </SortableTh>
                  <SortableTh sortKey="stage" currentSort={currentSort} onSort={k => handleSort(sub.subsector, k)}>
                    Stage
                  </SortableTh>
                  <SortableTh right sortKey="rs" currentSort={currentSort} onSort={k => handleSort(sub.subsector, k)}>
                    RS
                  </SortableTh>
                  <SortableTh right sortKey="pe" currentSort={currentSort} onSort={k => handleSort(sub.subsector, k)}>
                    P/E
                  </SortableTh>
                  <SortableTh right sortKey="pb" currentSort={currentSort} onSort={k => handleSort(sub.subsector, k)}>
                    P/BV
                  </SortableTh>
                  <SortableTh right sortKey="roe" currentSort={currentSort} onSort={k => handleSort(sub.subsector, k)}>
                    ROE%
                  </SortableTh>
                </tr>
              </thead>
              <tbody>
                {sortedTickers.map(t => {
                  const live = priceMap[t.ticker];
                  const price = live?.price ?? t.scan?.price ?? null;
                  const chg = live?.changePercent ?? null;
                  const stage = t.scan?.stage ?? stageAllMap.get(t.ticker) ?? null;
                  const rs = t.scan?.rs_score ?? rsMap.get(t.ticker) ?? null;

                  return (
                    <tr
                      key={t.ticker}
                      className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors"
                    >
                      <Td>
                        <Link
                          href={`/stock/${t.ticker}`}
                          className="font-bold text-white hover:text-emerald-400 transition-colors"
                        >
                          {t.ticker}
                        </Link>
                      </Td>
                      <Td right mono>
                        {price != null ? (
                          <span className="text-white font-medium">{price.toFixed(2)}</span>
                        ) : (
                          <span className="text-white/30">—</span>
                        )}
                      </Td>
                      <Td right mono>
                        {chg != null ? (
                          <span className={`font-medium ${chg >= 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>
                            {chg >= 0 ? '+' : ''}
                            {chg.toFixed(2)}%
                          </span>
                        ) : (
                          <span className="text-white/30">—</span>
                        )}
                      </Td>
                      <Td>
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${stageCls(
                            stage
                          )}`}
                        >
                          {stage || 'UNKNOWN'}
                        </span>
                      </Td>
                      <Td right mono>
                        {rs != null ? (
                          <span className="font-semibold" style={{ color: rsColor(rs) }}>
                            {rs}
                          </span>
                        ) : (
                          <span className="text-white/30">—</span>
                        )}
                      </Td>
                      <Td right mono>
                        {formatPE(t.pe)}
                      </Td>
                      <Td right mono>
                        {t.pb != null ? (
                          <span>{t.pb.toFixed(2)}</span>
                        ) : (
                          <span className="text-white/30">—</span>
                        )}
                      </Td>
                      <Td right mono>
                        {t.roe != null ? (
                          <span className={t.roe > 15 ? 'text-[#1D9E75]' : 'text-white/70'}>
                            {t.roe.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-white/30">—</span>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>
          </div>
        );
      })}
    </div>
  );
}
