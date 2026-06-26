'use client';

import { useState, useEffect } from 'react';
import { useStock } from '@/context/stock';
import { allStocks, watchlistSymbols } from '@/lib/mockData';

type LivePrice = { price: number; changePercent: number };

export default function WatchlistCard() {
  const { selectedSymbol, setSelectedSymbol } = useStock();
  const [priceMap, setPriceMap] = useState<Record<string, LivePrice>>({});

  useEffect(() => {
    const symbols = watchlistSymbols.map(t => encodeURIComponent(t)).join(',');
    fetch(`/api/prices?symbols=${symbols}`)
      .then(r => r.json())
      .then(json => { if (json.prices) setPriceMap(json.prices); })
      .catch(() => {});
  }, []);

  const stocks = watchlistSymbols.map(sym => allStocks.find(s => s.symbol === sym)!);

  return (
    <div className="bg-[#13161e] border border-white/[0.07] rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-white/[0.07]">
        <h2 className="text-[13px] font-semibold text-white">Watchlist</h2>
        <p className="text-[11px] text-white/35 mt-0.5">SET Market · {stocks.length} หุ้น</p>
      </div>

      <div className="divide-y divide-white/[0.04]">
        {stocks.map(stock => {
          const live = priceMap[stock.symbol];
          const price = live?.price ?? stock.price;
          const change = live?.changePercent ?? stock.change;
          const isSelected = stock.symbol === selectedSymbol;
          const isPos = change >= 0;
          return (
            <button
              key={stock.symbol}
              onClick={() => setSelectedSymbol(stock.symbol)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors min-h-[52px] ${
                isSelected ? 'bg-white/[0.07]' : 'hover:bg-white/[0.04]'
              }`}
            >
              <div
                className={`w-0.5 h-8 rounded-full flex-shrink-0 transition-colors ${
                  isSelected ? 'bg-[#1D9E75]' : 'bg-transparent'
                }`}
              />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-white">{stock.symbol}</p>
                <p className="text-[11px] text-white/40 truncate">{stock.name}</p>
              </div>
              <div className="text-right flex-shrink-0">
                {live ? (
                  <>
                    <p className="text-[13px] font-medium text-white">{price.toFixed(2)}</p>
                    <p className={`text-[11px] font-medium ${isPos ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>
                      {isPos ? '+' : ''}{change.toFixed(2)}%
                    </p>
                  </>
                ) : (
                  <div className="space-y-1">
                    <div className="h-3.5 w-14 bg-white/[0.06] rounded animate-pulse ml-auto" />
                    <div className="h-3 w-10 bg-white/[0.04] rounded animate-pulse ml-auto" />
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
