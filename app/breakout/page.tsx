'use client';

import { useState, useMemo } from 'react';
import { breakoutData } from '@/lib/strategyData';
import {
  SectorChip, Th, Td, TableWrap, FilterBar, SliderField, Divider, PageHeader,
} from '@/components/StrategyTable';

export default function BreakoutPage() {
  const [toBreakMax, setToBreakMax] = useState(10);
  const [boxWidthMax, setBoxWidthMax] = useState(20);

  const filtered = useMemo(() =>
    breakoutData
      .filter(s => s['To_Break'] <= toBreakMax)
      .filter(s => s['Box_Width'] <= boxWidthMax)
      .sort((a, b) => a['To_Break'] - b['To_Break']),
    [toBreakMax, boxWidthMax]
  );

  return (
    <div className="p-4 md:p-6 space-y-4">
      <PageHeader
        title="Breakout Setup"
        subtitle="VDU / Box Pattern — ยิ่ง To_Break น้อย ยิ่งจ่อ break"
        count={filtered.length}
        total={breakoutData.length}
      />

      <FilterBar>
        <SliderField
          label="To Break"
          min={-10}
          max={20}
          value={toBreakMax}
          onChange={setToBreakMax}
          unit="%"
          dir="lte"
        />
        <Divider />
        <SliderField
          label="Box Width"
          min={3}
          max={30}
          value={boxWidthMax}
          onChange={setBoxWidthMax}
          unit="%"
          dir="lte"
        />
        <span className="text-[11px] text-white/25 ml-auto">
          ค่าติดลบ = broke แล้ว
        </span>
      </FilterBar>

      <TableWrap>
        <thead className="border-b border-white/[0.06] bg-white/[0.015]">
          <tr>
            <Th>#</Th>
            <Th>Symbol</Th>
            <Th right>Price</Th>
            <Th right>Box High (Break)</Th>
            <Th right>To Break %</Th>
            <Th right>Box Width %</Th>
            <Th right>ADTV (MB)</Th>
            <Th right>SMA150 Chg</Th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((s, i) => {
            const toBrk = s['To_Break'];
            const broke = toBrk <= 0;
            return (
              <tr key={s.Ticker} className="border-b border-white/[0.04] hover:bg-white/[0.025] transition-colors">
                <Td><span className="text-white/20 tabular-nums">{i + 1}</span></Td>
                <Td>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-white">{s.Ticker}</span>
                    {broke && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#EAF3DE] text-[#27500A] leading-none">
                        BROKE
                      </span>
                    )}
                  </div>
                  <SectorChip ticker={s.Ticker} />
                </Td>
                <Td right mono>{s.Price.toFixed(2)}</Td>
                <Td right mono>
                  <span className="text-white/50">{s['Box_High(Break)'].toFixed(2)}</span>
                </Td>
                <Td right mono>
                  <span className={`font-semibold ${
                    broke ? 'text-[#1D9E75]' : toBrk <= 3 ? 'text-[#EF9F27]' : 'text-white/50'
                  }`}>
                    {toBrk >= 0 ? '+' : ''}{toBrk.toFixed(1)}%
                  </span>
                </Td>
                <Td right mono>
                  <span className={s['Box_Width'] <= 8 ? 'text-[#1D9E75]' : 'text-white/50'}>
                    {s['Box_Width'].toFixed(1)}%
                  </span>
                </Td>
                <Td right mono>{s['ADTV(MB)'].toFixed(0)}</Td>
                <Td right mono>
                  <span className="text-[#1D9E75]">+{s.SMA150_Chg.toFixed(2)}%</span>
                </Td>
              </tr>
            );
          })}
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
