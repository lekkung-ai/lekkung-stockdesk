'use client';

import { useStock } from '@/context/stock';
import { allStocks, newsBySymbol } from '@/lib/mockData';
import PriceChart from './PriceChart';

const stageBadge = (stage: number) => {
  const map: Record<number, { label: string; cls: string }> = {
    1: { label: 'Stage 1', cls: 'bg-[#E6F1FB] text-[#0C447C]' },
    2: { label: 'Stage 2', cls: 'bg-[#EAF3DE] text-[#27500A]' },
    3: { label: 'Stage 3', cls: 'bg-[#FAEEDA] text-[#633806]' },
    4: { label: 'Stage 4', cls: 'bg-[#FCEBEB] text-[#791F1F]' },
  };
  return map[stage] ?? map[1];
};

const sentBadge = (sent: string) => {
  if (sent === 'pos') return { label: 'Positive', cls: 'bg-[#EAF3DE] text-[#27500A]' };
  if (sent === 'neg') return { label: 'Negative', cls: 'bg-[#FCEBEB] text-[#791F1F]' };
  return { label: 'Neutral', cls: 'bg-white/[0.08] text-white/45' };
};

export default function StockDetailCard() {
  const { selectedSymbol, selectedMarket } = useStock();
  const stock = allStocks.find(s => s.symbol === selectedSymbol);

  if (!stock) return null;

  const isPos = stock.change >= 0;
  const stage = stageBadge(stock.wyckoffStage);
  const news = newsBySymbol[selectedSymbol] ?? [];

  return (
    <div className="bg-[#13161e] border border-white/[0.07] rounded-xl overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/[0.07]">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[20px] font-bold text-white leading-none">{stock.symbol}</p>
            <p className="text-[12px] text-white/45 mt-1">{stock.name}</p>
          </div>
          <div className="text-right">
            <p className="text-[22px] font-bold text-white leading-none">{stock.price.toFixed(2)}</p>
            <p className={`text-[12px] font-medium mt-1 ${isPos ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>
              {isPos ? '+' : ''}
              {stock.changeAmt.toFixed(2)} ({isPos ? '+' : ''}
              {stock.change.toFixed(2)}%)
            </p>
          </div>
        </div>
      </div>

      {/* Chart */}
      <PriceChart ticker={stock.symbol} market={selectedMarket} height={200} />

      {/* Chart legend */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-white/[0.06]">
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

      {/* Signal badges */}
      <div className="px-4 py-3 border-b border-white/[0.06] flex flex-wrap gap-1.5">
        {stock.sepa && (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-[#EAF3DE] text-[#27500A]">
            SEPA ✓
          </span>
        )}
        {stock.kell && (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-[#E6F1FB] text-[#0C447C]">
            Kell ✓
          </span>
        )}
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${stage.cls}`}>
          {stage.label}
        </span>
        {stock.vdu && (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-[#FAEEDA] text-[#633806]">
            VDU ✓
          </span>
        )}
        {stock.breakout && (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-[#E6F1FB] text-[#0C447C]">
            Breakout
          </span>
        )}
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-white/[0.08] text-white/55">
          RS {stock.rsScore}
        </span>
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-white/[0.08] text-white/55">
          Combo {stock.comboScore}/5
        </span>
      </div>

      {/* News */}
      <div className="flex-1 min-h-0">
        <p className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-white/25 border-b border-white/[0.06]">
          ข่าวล่าสุด
        </p>
        <div className="divide-y divide-white/[0.04]">
          {news.map(item => {
            const badge = sentBadge(item.sent);
            return (
              <div key={item.id} className="px-4 py-3">
                <div className="flex items-start gap-2 mb-1.5">
                  <span className={`flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded ${badge.cls}`}>
                    {badge.label}
                  </span>
                  <p className="text-[12px] text-white/70 leading-snug">{item.title}</p>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-white/30">
                  <span>{item.source}</span>
                  <span>·</span>
                  <span>{item.time}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
