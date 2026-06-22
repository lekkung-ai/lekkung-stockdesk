'use client';

import { useState, useEffect } from 'react';
import { useStock } from '@/context/stock';
import type { ScanEntry } from '@/lib/scanData';
import { getSectorForTicker } from '@/lib/sectorData';
import PriceChart from './PriceChart';

type LivePrice = { price: number; changePercent: number };

function stageCls(stage: string): string {
  if (stage === 'Bull' || stage === 'S.Bull') return 'bg-[#EAF3DE] text-[#27500A]';
  if (stage === 'Recovery' || stage === 'Accumulation') return 'bg-[#E6F1FB] text-[#0C447C]';
  if (stage === 'Warning') return 'bg-[#FAEEDA] text-[#633806]';
  return 'bg-[#FCEBEB] text-[#791F1F]';
}

function rsColor(score: number): string {
  if (score >= 80) return '#1D9E75';
  if (score >= 50) return '#BA7517';
  return '#E24B4A';
}

function PassIcon({ pass }: { pass: boolean }) {
  return pass ? (
    <span className="text-[#1D9E75] font-bold text-[13px]">✓</span>
  ) : (
    <span className="text-white/20 text-[13px]">—</span>
  );
}

export default function ScannerTable({ data }: { data: ScanEntry[] }) {
  const { selectedSymbol, setSelectedSymbol, selectedMarket } = useStock();
  const [chartTicker, setChartTicker] = useState<string | null>(null);
  const [priceMap, setPriceMap] = useState<Record<string, LivePrice>>({});

  useEffect(() => {
    if (data.length === 0) return;
    const symbols = data.map(r => r.ticker).join(',');
    fetch(`/api/prices?symbols=${symbols}`)
      .then(r => r.json())
      .then(json => { if (json.prices) setPriceMap(json.prices); })
      .catch(() => {});
  }, [data]);

  function handleRowClick(ticker: string) {
    setSelectedSymbol(ticker);
    setChartTicker(ticker);
  }

  const chartEntry = chartTicker ? data.find(d => d.ticker === chartTicker) : null;
  const chartLive = chartTicker ? priceMap[chartTicker] : undefined;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-[18px] font-bold text-white">Scanner</h1>
        <p className="text-[12px] text-white/35 mt-0.5">{data.length} หุ้น</p>
      </div>

      <div className="bg-[#13161e] border border-white/[0.07] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-white/[0.07]">
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-white/35 uppercase tracking-wider whitespace-nowrap">Symbol</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-white/35 uppercase tracking-wider whitespace-nowrap">Sector</th>
                <th className="text-right px-4 py-3 text-[11px] font-semibold text-white/35 uppercase tracking-wider whitespace-nowrap">ราคา</th>
                <th className="text-right px-4 py-3 text-[11px] font-semibold text-white/35 uppercase tracking-wider whitespace-nowrap">1D%</th>
                <th className="text-center px-3 py-3 text-[11px] font-semibold text-white/35 uppercase tracking-wider">SEPA</th>
                <th className="text-center px-3 py-3 text-[11px] font-semibold text-white/35 uppercase tracking-wider">Kell</th>
                <th className="text-center px-4 py-3 text-[11px] font-semibold text-white/35 uppercase tracking-wider whitespace-nowrap">Market Stage</th>
                <th className="text-center px-3 py-3 text-[11px] font-semibold text-white/35 uppercase tracking-wider">Breakout</th>
                <th className="text-right px-4 py-3 text-[11px] font-semibold text-white/35 uppercase tracking-wider whitespace-nowrap">RS Score</th>
                <th className="text-center px-4 py-3 text-[11px] font-semibold text-white/35 uppercase tracking-wider">Combo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {data.map(row => {
                const color = rsColor(row.rs_score);
                const isSelected = row.ticker === selectedSymbol && row.ticker === chartTicker;
                const sectorInfo = getSectorForTicker(row.ticker);
                const live = priceMap[row.ticker];
                return (
                  <tr
                    key={row.ticker}
                    onClick={() => handleRowClick(row.ticker)}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-white/[0.07]' : 'hover:bg-white/[0.03]'
                    }`}
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className={`w-0.5 h-5 rounded-full transition-colors ${isSelected ? 'bg-[#1D9E75]' : 'bg-transparent'}`} />
                        <span className="font-semibold text-white">{row.ticker}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {sectorInfo ? (
                        <span className="text-[12px] text-white/45">{sectorInfo.sector}</span>
                      ) : (
                        <span className="text-[12px] text-white/20">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {live ? (
                        <span className="text-white/80">{live.price.toFixed(2)}</span>
                      ) : (
                        <span className="text-white/40">{row.price.toFixed(2)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {live ? (
                        <span className={`text-[12px] font-semibold ${live.changePercent >= 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>
                          {live.changePercent >= 0 ? '+' : ''}{live.changePercent.toFixed(2)}%
                        </span>
                      ) : (
                        <span className="text-white/20 text-[12px]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center"><PassIcon pass={row.sepa} /></td>
                    <td className="px-3 py-3 text-center"><PassIcon pass={row.kell} /></td>
                    <td className="px-4 py-3 text-center">
                      {row.stage ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap ${stageCls(row.stage)}`}>
                          {row.stage}
                        </span>
                      ) : (
                        <span className="text-white/20 text-[13px]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center"><PassIcon pass={row.breakout} /></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-14 h-1.5 bg-white/[0.08] rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${row.rs_score}%`, backgroundColor: color }} />
                        </div>
                        <span className="font-semibold tabular-nums w-6 text-right text-[12px]" style={{ color }}>
                          {row.rs_score}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center text-white/55 font-medium tabular-nums">
                      {row.combo_score}/4
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {chartEntry && (
        <div className="bg-[#13161e] border border-white/[0.07] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/[0.07] flex items-center justify-between">
            <div>
              <p className="text-[16px] font-bold text-white">{chartEntry.ticker}</p>
              <p className="text-[12px] text-white/40">
                {selectedMarket} · ราคา{' '}
                {chartLive
                  ? <span className="text-white/70">{chartLive.price.toFixed(2)}</span>
                  : chartEntry.price.toFixed(2)}
                {chartLive && (
                  <span className={`ml-1 ${chartLive.changePercent >= 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>
                    ({chartLive.changePercent >= 0 ? '+' : ''}{chartLive.changePercent.toFixed(2)}%)
                  </span>
                )}
              </p>
            </div>
            <button
              onClick={() => setChartTicker(null)}
              className="text-white/30 hover:text-white/60 transition-colors text-[18px] leading-none px-1"
            >
              ✕
            </button>
          </div>
          <PriceChart ticker={chartEntry.ticker} market={selectedMarket} height={260} />
          <div className="flex items-center gap-4 px-4 py-2 border-t border-white/[0.06]">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 bg-[#1D9E75] rounded-sm" />
              <span className="text-[11px] text-white/35">ขึ้น</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 bg-[#E24B4A] rounded-sm" />
              <span className="text-[11px] text-white/35">ลง</span>
            </div>
            <div className="flex items-center gap-1.5">
              <svg width="14" height="3" viewBox="0 0 14 3" className="flex-shrink-0">
                <line x1="0" y1="1.5" x2="14" y2="1.5" stroke="#EF9F27" strokeWidth="1.5" />
              </svg>
              <span className="text-[11px] text-white/35">EMA 50</span>
            </div>
            <div className="flex items-center gap-1.5">
              <svg width="14" height="3" viewBox="0 0 14 3" className="flex-shrink-0">
                <line x1="0" y1="1.5" x2="14" y2="1.5" stroke="#7F77DD" strokeWidth="1.5" />
              </svg>
              <span className="text-[11px] text-white/35">EMA 200</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
