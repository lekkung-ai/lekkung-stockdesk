'use client';

import { useState, useMemo } from 'react';
import { sepaData } from '@/lib/strategyData';
import { daysInScan } from '@/lib/scanDays';
import { scanGeneratedAt } from '@/lib/scanData';
import { formatThaiDate } from '@/lib/utils';
import { useLivePrices } from '@/lib/useLivePrices';
import {
  rsColor, SectorChip, Th, Td, TableWrap, FilterBar, SliderField, Divider, PageHeader, LivePriceCell, SortableTh, SortConfig,
} from '@/components/StrategyTable';

export default function SepaPage() {
  const [rsMin, setRsMin] = useState(60);
  const [fromHighMax, setFromHighMax] = useState(15);
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const { priceMap, fetchDone } = useLivePrices(sepaData.map(s => s.Ticker));

  const handleSort = (key: string) => {
    setSortConfig(prev => prev?.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' });
  };

  const filtered = useMemo(() => {
    let result = sepaData
      .filter(s => s.RS_Rating >= rsMin)
      .filter(s => s['%_From_High'] >= -fromHighMax);
      
    if (sortConfig) {
      result = result.sort((a, b) => {
        if (sortConfig.key === '__days') {
          const aVal = daysInScan('sepa', a.Ticker) ?? -1;
          const bVal = daysInScan('sepa', b.Ticker) ?? -1;
          return sortConfig.dir === 'asc' ? aVal - bVal : bVal - aVal;
        }
        const aVal = (a as any)[sortConfig.key];
        const bVal = (b as any)[sortConfig.key];
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return sortConfig.dir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }
        return sortConfig.dir === 'asc' ? (aVal || 0) - (bVal || 0) : (bVal || 0) - (aVal || 0);
      });
    } else {
      result = result.sort((a, b) => b['%_From_High'] - a['%_From_High']);
    }
    return result;
  }, [rsMin, fromHighMax, sortConfig]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <PageHeader
        title="SEPA Trend Template"
        subtitle="Stan Weinstein + O'Neil SEPA criteria"
        count={filtered.length}
        updatedAt={formatThaiDate(scanGeneratedAt)}
        total={sepaData.length}
      />

      <FilterBar>
        <SliderField label="RS Rating" min={50} max={99} value={rsMin} onChange={setRsMin} />
        <Divider />
        <SliderField
          label="% From 52W High"
          min={1}
          max={30}
          value={fromHighMax}
          onChange={setFromHighMax}
          unit="%"
          dir="lte"
        />
        <span className="text-[11px] text-white/25 ml-auto">
          ยิ่งใกล้ High = momentum แข็ง
        </span>
      </FilterBar>

      <TableWrap>
        <thead className="border-b border-white/[0.06] bg-white/[0.015]">
          <tr>
            <Th>#</Th>
            <SortableTh sortKey="Ticker" currentSort={sortConfig} onSort={handleSort}>Symbol</SortableTh>
            <SortableTh right sortKey="Price" currentSort={sortConfig} onSort={handleSort}>Price</SortableTh>
            <SortableTh right sortKey="__days" currentSort={sortConfig} onSort={handleSort}>Days</SortableTh>
            <SortableTh right sortKey="52W_High" currentSort={sortConfig} onSort={handleSort}>52W High</SortableTh>
            <SortableTh right sortKey="%_From_High" currentSort={sortConfig} onSort={handleSort}>% From High</SortableTh>
            <SortableTh right sortKey="SMA_50" currentSort={sortConfig} onSort={handleSort}>SMA 50</SortableTh>
            <SortableTh right sortKey="SMA_200" currentSort={sortConfig} onSort={handleSort}>SMA 200</SortableTh>
            <SortableTh right sortKey="RS_Rating" currentSort={sortConfig} onSort={handleSort}>RS Rating</SortableTh>
          </tr>
        </thead>
        <tbody>
          {filtered.map((s, i) => (
            <tr key={s.Ticker} className="border-b border-white/[0.04] hover:bg-white/[0.025] transition-colors">
              <Td><span className="text-white/20 tabular-nums">{i + 1}</span></Td>
              <Td>
                <div className="font-bold text-white">{s.Ticker}</div>
                <SectorChip ticker={s.Ticker} />
              </Td>
              <Td right mono>
                <LivePriceCell jsonPrice={s.Price} livePrice={priceMap[s.Ticker]} fetchDone={fetchDone} />
              </Td>
              <Td right mono>
                <span className="text-white/60">{daysInScan('sepa', s.Ticker) ?? '—'}</span>
              </Td>
              <Td right mono>
                <span className={s.Price > s.SMA_50 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}>
                  {s.SMA_50.toFixed(2)}
                </span>
              </Td>
              <Td right mono>
                <span className={s.Price > s.SMA_200 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}>
                  {s.SMA_200.toFixed(2)}
                </span>
              </Td>
              <Td right mono>{s['52W_High'].toFixed(2)}</Td>
              <Td right mono>
                <span className={s['%_From_High'] >= -5 ? 'text-[#1D9E75]' : s['%_From_High'] >= -10 ? 'text-[#EF9F27]' : 'text-white/50'}>
                  {s['%_From_High'].toFixed(1)}%
                </span>
              </Td>
              <Td right mono>
                <span className="font-bold text-[14px]" style={{ color: rsColor(s.RS_Rating) }}>
                  {s.RS_Rating}
                </span>
              </Td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={9} className="py-12 text-center text-[13px] text-white/25">
                ไม่พบหุ้นที่ตรงกับ filter
              </td>
            </tr>
          )}
        </tbody>
      </TableWrap>
    </div>
  );
}
