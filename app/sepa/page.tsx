'use client';

import { useState, useMemo } from 'react';
import { sepaData } from '@/lib/strategyData';
import { scanGeneratedAt } from '@/lib/scanData';
import { formatThaiDate } from '@/lib/utils';
import { useLivePrices } from '@/lib/useLivePrices';
import {
  rsColor, SectorChip, Th, Td, TableWrap, FilterBar, SliderField, Divider, PageHeader, LivePriceCell,
} from '@/components/StrategyTable';

export default function SepaPage() {
  const [rsMin, setRsMin] = useState(60);
  const [fromHighMax, setFromHighMax] = useState(15);
  const { priceMap, fetchDone } = useLivePrices(sepaData.map(s => s.Ticker));

  const filtered = useMemo(() =>
    sepaData
      .filter(s => s.RS_Rating >= rsMin)
      .filter(s => s['%_From_High'] >= -fromHighMax)
      .sort((a, b) => b['%_From_High'] - a['%_From_High']),
    [rsMin, fromHighMax]
  );

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
            <Th>Symbol</Th>
            <Th right>Price</Th>
            <Th right>SMA 50</Th>
            <Th right>SMA 200</Th>
            <Th right>52W High</Th>
            <Th right>% From High</Th>
            <Th right>RS</Th>
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
              <td colSpan={8} className="py-12 text-center text-[13px] text-white/25">
                ไม่พบหุ้นที่ตรงกับ filter
              </td>
            </tr>
          )}
        </tbody>
      </TableWrap>
    </div>
  );
}
