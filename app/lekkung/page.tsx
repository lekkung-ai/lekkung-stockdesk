'use client';

import { useState, useMemo } from 'react';
import { lekkungData } from '@/lib/strategyData';
import { scanGeneratedAt } from '@/lib/scanData';
import { formatThaiDate } from '@/lib/utils';
import { useLivePrices } from '@/lib/useLivePrices';
import {
  SectorChip, Th, Td, TableWrap, FilterBar, SliderField, Divider, PageHeader, LivePriceCell, SortableTh, SortConfig,
} from '@/components/StrategyTable';
import StockChart from '@/components/StockChart';
import React from 'react';

export default function LekkungPage() {
  const [profitMin, setProfitMin] = useState(20);
  const [revMin, setRevMin] = useState(10);
  const [roeMin, setRoeMin] = useState(15);
  const [mcapMin, setMcapMin] = useState(0);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const { priceMap, fetchDone } = useLivePrices(lekkungData.map(s => s.Ticker));

  const handleSort = (key: string) => {
    setSortConfig(prev => prev?.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' });
  };

  const filtered = useMemo(() => {
    let result = lekkungData
      .filter(s => s.NetProfit_Growth_QoQY >= profitMin)
      .filter(s => s.Revenue_Growth_YoY >= revMin)
      .filter(s => (s.ROE * 100) >= roeMin)
      .filter(s => mcapMin === 0 || ((s.Market_Cap || 0) / 1e6) >= mcapMin);
      
    if (sortConfig) {
      result = result.sort((a, b) => {
        const aVal = (a as any)[sortConfig.key];
        const bVal = (b as any)[sortConfig.key];
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return sortConfig.dir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }
        return sortConfig.dir === 'asc' ? (aVal || 0) - (bVal || 0) : (bVal || 0) - (aVal || 0);
      });
    } else {
      result = result.sort((a, b) => b.NetProfit_Growth_QoQY - a.NetProfit_Growth_QoQY);
    }
    return result;
  }, [profitMin, revMin, roeMin, mcapMin, sortConfig]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <PageHeader
        title="Lekkung Growth"
        subtitle="Growth Stocks Focus Strategy"
        count={filtered.length}
        updatedAt={formatThaiDate(scanGeneratedAt)}
        total={lekkungData.length}
      />

      <FilterBar>
        <SliderField label="Profit Growth (QoQY) %" min={0} max={100} value={profitMin} onChange={setProfitMin} />
        <Divider />
        <SliderField label="Revenue Growth (YoY) %" min={0} max={100} value={revMin} onChange={setRevMin} />
        <Divider />
        <SliderField label="ROE %" min={15} max={50} value={roeMin} onChange={setRoeMin} />
        <Divider />
        <SliderField label="Market Cap (MB)" min={0} max={50000} value={mcapMin} onChange={setMcapMin} step={1000} />
      </FilterBar>

      <div className="[&_td]:text-[14px] [&_th]:text-[11px]">
      <TableWrap>
        <thead className="border-b border-white/[0.06] bg-white/[0.015]">
          <tr>
            <Th>#</Th>
            <SortableTh sortKey="Ticker" currentSort={sortConfig} onSort={handleSort}>Symbol</SortableTh>
            <SortableTh right sortKey="Close" currentSort={sortConfig} onSort={handleSort}>Price</SortableTh>
            <SortableTh right sortKey="PE_Ratio" currentSort={sortConfig} onSort={handleSort}>P/E</SortableTh>
            <SortableTh right sortKey="ROE" currentSort={sortConfig} onSort={handleSort}>ROE</SortableTh>
            <SortableTh right sortKey="Revenue_Growth_YoY" currentSort={sortConfig} onSort={handleSort}>Rev Gr (YoY)</SortableTh>
            <SortableTh right sortKey="NetProfit_Growth_QoQY" currentSort={sortConfig} onSort={handleSort}>Profit Gr (QoQY)</SortableTh>
            <SortableTh right sortKey="52W_High" currentSort={sortConfig} onSort={handleSort}>52w H/L</SortableTh>
            <SortableTh right sortKey="Market_Cap" currentSort={sortConfig} onSort={handleSort}>Market Cap (MB)</SortableTh>
            <SortableTh right sortKey="ADTV_MB" currentSort={sortConfig} onSort={handleSort}>ADTV (MB)</SortableTh>
          </tr>
        </thead>
        <tbody>
          {filtered.map((s, i) => (
            <React.Fragment key={s.Ticker}>
            <tr
              onClick={() => setSelectedTicker(selectedTicker === s.Ticker ? null : s.Ticker)}
              className={`border-b border-white/[0.04] transition-colors cursor-pointer ${
                selectedTicker === s.Ticker ? 'bg-white/[0.08]' : 'hover:bg-white/[0.02]'
              }`}
            >
              <Td className="text-white/40"><span className="text-white/20 tabular-nums">{i + 1}</span></Td>
              <Td>
                <div className="font-bold text-white">{s.Ticker}</div>
                <SectorChip ticker={s.Ticker} />
              </Td>
              <Td right mono>
                <LivePriceCell jsonPrice={s.Close} livePrice={priceMap[s.Ticker]} fetchDone={fetchDone} />
              </Td>
              <Td right mono>{s.PE_Ratio?.toFixed(2) || '-'}</Td>
              <Td right mono>
                <span className={s.ROE > 0.15 ? 'text-[#1D9E75]' : 'text-white'}>
                  {s.ROE ? (s.ROE * 100).toFixed(1) + '%' : '-'}
                </span>
              </Td>
              <Td right mono>
                <span className={s.Revenue_Growth_YoY > 20 ? 'text-[#1D9E75]' : 'text-white'}>
                  {s.Revenue_Growth_YoY?.toFixed(1) || '-'}%
                </span>
              </Td>
              <Td right mono>
                <span className={s.NetProfit_Growth_QoQY > 20 ? 'text-[#1D9E75]' : 'text-white'}>
                  {s.NetProfit_Growth_QoQY != null ? s.NetProfit_Growth_QoQY.toFixed(1) + '%' : '-'}
                </span>
              </Td>
              <Td right mono>
                <div className="flex flex-col items-end leading-tight text-[11px]">
                  <span className="text-[#E24B4A]">{s['52W_High']?.toFixed(2) || '-'}</span>
                  <span className="text-[#1D9E75]">{s['52W_Low']?.toFixed(2) || '-'}</span>
                </div>
              </Td>
              <Td right mono>
                <span className="text-white/70">
                  {s.Market_Cap ? (s.Market_Cap / 1e6).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '-'}
                </span>
              </Td>
              <Td right mono>{s.ADTV_MB?.toFixed(0) || '-'}</Td>
            </tr>
            {selectedTicker === s.Ticker && (
              <tr key={`${s.Ticker}-chart`} className="bg-black/20 border-b border-white/[0.04]">
                <td colSpan={11} className="p-4">
                  <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-4 shadow-lg relative">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-baseline gap-2">
                        <h2 className="text-[16px] font-bold text-white tracking-wide">{s.Ticker}</h2>
                        <span className="text-[11px] text-white/40">Technical Chart</span>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedTicker(null); }}
                        className="text-[11px] text-white/40 hover:text-white px-2 py-1 rounded bg-white/5 hover:bg-white/10 transition-colors"
                      >
                        ปิดกราฟ
                      </button>
                    </div>
                    <StockChart ticker={s.Ticker} height={350} showEma10={true} />
                  </div>
                </td>
              </tr>
            )}
          </React.Fragment>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={11} className="py-12 text-center text-[13px] text-white/25">
                ไม่พบหุ้นที่ตรงกับ filter
              </td>
            </tr>
          )}
        </tbody>
      </TableWrap>
      </div>
    </div>
  );
}
