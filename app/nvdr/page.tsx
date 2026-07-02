'use client';

import { useMemo } from 'react';
import nvdrRaw from '@/data/scans/nvdr.json';
import { getSectorForTicker } from '@/lib/sectorData';

export default function NVDRPage() {
  const data = nvdrRaw as { latest_date: string; today: any[]; '5d': any[] };

  // Calculate sector summaries
  const sectorSummary = useMemo(() => {
    const summary: Record<string, { buy: number; sell: number; total: number; net: number }> = {};
    for (const item of data.today) {
      const secInfo = getSectorForTicker(item.Symbol);
      const sector = secInfo ? secInfo.sector : 'Unknown';
      if (!summary[sector]) {
        summary[sector] = { buy: 0, sell: 0, total: 0, net: 0 };
      }
      summary[sector].buy += item.Buy || 0;
      summary[sector].sell += item.Sell || 0;
      summary[sector].total += item.Total || 0;
      summary[sector].net += item.Net || 0;
    }
    const arr = Object.entries(summary).map(([sector, vals]) => ({
      sector,
      ...vals,
    }));
    arr.sort((a, b) => b.net - a.net);
    return arr;
  }, [data.today]);

  const topBuyToday = [...data.today].sort((a, b) => b.Net - a.Net).slice(0, 20);
  const topSellToday = [...data.today].sort((a, b) => a.Net - b.Net).slice(0, 20);
  
  const topBuy5d = [...data['5d']].sort((a, b) => b.Net - a.Net).slice(0, 20);
  const topSell5d = [...data['5d']].sort((a, b) => a.Net - b.Net).slice(0, 20);

  const formatNum = (num: number) => {
    if (!num) return '-';
    // Format to Millions (M)
    return (num / 1000000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' M';
  };

  const TableBlock = ({ title, items }: { title: string; items: any[] }) => (
    <div className="bg-[#13161e] border border-white/[0.07] rounded-xl overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-white/[0.07] bg-white/[0.02]">
        <h2 className="text-[14px] font-bold text-white">{title}</h2>
      </div>
      <div className="flex-1 overflow-auto p-2">
        <table className="w-full text-left text-[12px]">
          <thead>
            <tr className="text-white/40 uppercase tracking-wider">
              <th className="py-2 px-2 font-medium">Symbol</th>
              <th className="py-2 px-2 font-medium text-right">Net Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {items.map((item, idx) => (
              <tr key={item.Symbol} className="hover:bg-white/[0.02] transition-colors">
                <td className="py-2 px-2">
                  <div className="flex items-center gap-2">
                    <span className="text-white/20 w-4">{idx + 1}.</span>
                    <span className="text-white font-medium">{item.Symbol}</span>
                  </div>
                </td>
                <td className={`py-2 px-2 text-right font-medium ${item.Net > 0 ? 'text-green-400' : item.Net < 0 ? 'text-red-400' : 'text-white/60'}`}>
                  {formatNum(item.Net)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-6 h-[100dvh] flex flex-col">
      <div>
        <h1 className="text-[18px] font-bold text-white">NVDR Fund Flow</h1>
        <p className="text-[12px] text-white/40 mt-0.5">
          Data as of {data.latest_date}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0">
        <div className="grid grid-cols-2 gap-4 h-full">
          <TableBlock title="Top Net Buy (1 Day)" items={topBuyToday} />
          <TableBlock title="Top Net Sell (1 Day)" items={topSellToday} />
        </div>
        
        <div className="bg-[#13161e] border border-white/[0.07] rounded-xl flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-white/[0.07] bg-white/[0.02]">
            <h2 className="text-[14px] font-bold text-white">NVDR Trading by Sector (1 Day)</h2>
          </div>
          <div className="flex-1 overflow-auto p-2">
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="text-white/40 uppercase tracking-wider">
                  <th className="py-2 px-2 font-medium">Sector</th>
                  <th className="py-2 px-2 font-medium text-right">Buy</th>
                  <th className="py-2 px-2 font-medium text-right">Sell</th>
                  <th className="py-2 px-2 font-medium text-right">Total</th>
                  <th className="py-2 px-2 font-medium text-right">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {sectorSummary.map((sec) => (
                  <tr key={sec.sector} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-2 px-2 font-bold text-white">{sec.sector}</td>
                    <td className="py-2 px-2 text-right text-green-400/80">{formatNum(sec.buy)}</td>
                    <td className="py-2 px-2 text-right text-red-400/80">{formatNum(sec.sell)}</td>
                    <td className="py-2 px-2 text-right text-white/80">{formatNum(sec.total)}</td>
                    <td className={`py-2 px-2 text-right font-bold ${sec.net > 0 ? 'text-green-400' : sec.net < 0 ? 'text-red-400' : 'text-white/60'}`}>
                      {formatNum(sec.net)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4 h-[50vh] lg:h-full lg:col-span-2">
          <TableBlock title="Top Net Buy (5 Days)" items={topBuy5d} />
          <TableBlock title="Top Net Sell (5 Days)" items={topSell5d} />
        </div>
      </div>
    </div>
  );
}
