'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { ScanEntry } from '@/lib/scanData';

type LivePrice = { price: number; changePercent: number };

type TickerWithScan = { ticker: string; scan: ScanEntry | null };
type SubsectorData = { subsector: string; tickers: TickerWithScan[] };

function stageCls(stage: string | null): string {
  if (!stage) return 'bg-white/[0.08] text-white/35';
  if (stage === 'Bull' || stage === 'S.Bull') return 'bg-[#EAF3DE] text-[#27500A]';
  if (stage === 'Accumulation' || stage === 'Recovery') return 'bg-[#E6F1FB] text-[#0C447C]';
  if (stage === 'Warning') return 'bg-[#FAEEDA] text-[#633806]';
  return 'bg-[#FCEBEB] text-[#791F1F]';
}

function rsBarColor(score: number): string {
  if (score >= 80) return '#1D9E75';
  if (score >= 50) return '#BA7517';
  return '#E24B4A';
}

export default function SectorTickerGrid({ subsectors }: { subsectors: SubsectorData[] }) {
  const [priceMap, setPriceMap] = useState<Record<string, LivePrice>>({});

  useEffect(() => {
    const allTickers = subsectors.flatMap(s => s.tickers.map(t => t.ticker));
    if (allTickers.length === 0) return;
    fetch(`/api/prices?symbols=${allTickers.join(',')}`)
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
          <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {sub.tickers.map(({ ticker, scan }) => {
              const live = priceMap[ticker];
              return scan ? (
                <Link
                  key={ticker}
                  href={`/stock/${ticker}`}
                  className="bg-white/[0.04] hover:bg-white/[0.07] rounded-lg p-3 transition-colors block"
                >
                  {/* Header: ticker + price */}
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="text-[13px] font-bold text-white">{ticker}</span>
                    <div className="text-right flex-shrink-0">
                      {live ? (
                        <>
                          <div className="text-[13px] font-semibold text-white/80 tabular-nums leading-tight">
                            {live.price.toFixed(2)}
                          </div>
                          <div className={`text-[10px] font-medium tabular-nums leading-tight ${live.changePercent >= 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>
                            {live.changePercent >= 0 ? '+' : ''}{live.changePercent.toFixed(2)}%
                          </div>
                        </>
                      ) : (
                        <span className="text-[13px] font-semibold text-white/40 tabular-nums">
                          {scan.price.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Stage + signal badges */}
                  <div className="flex flex-wrap gap-1 mb-2">
                    {scan.stage && (
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${stageCls(scan.stage)}`}>
                        {scan.stage}
                      </span>
                    )}
                    {scan.sepa && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#EAF3DE] text-[#27500A]">
                        SEPA
                      </span>
                    )}
                    {scan.kell && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#E6F1FB] text-[#0C447C]">
                        Kell
                      </span>
                    )}
                    {scan.breakout && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#E6F1FB] text-[#0C447C]">
                        BO
                      </span>
                    )}
                  </div>

                  {/* RS bar + combo */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1 bg-white/[0.08] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${scan.rs_score}%`,
                          backgroundColor: rsBarColor(scan.rs_score),
                        }}
                      />
                    </div>
                    <span
                      className="text-[11px] font-semibold tabular-nums w-6 text-right flex-shrink-0"
                      style={{ color: rsBarColor(scan.rs_score) }}
                    >
                      {scan.rs_score}
                    </span>
                    <span className="text-[10px] text-white/30 flex-shrink-0">
                      {scan.combo_score}/4
                    </span>
                  </div>
                </Link>
              ) : (
                <Link
                  key={ticker}
                  href={`/stock/${ticker}`}
                  className="bg-white/[0.03] hover:bg-white/[0.05] rounded-lg px-3 py-2.5 flex items-center justify-between transition-colors"
                >
                  <span className="text-[12px] font-semibold text-white/40">{ticker}</span>
                  {live && (
                    <span className="text-[11px] tabular-nums text-white/30">{live.price.toFixed(2)}</span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
