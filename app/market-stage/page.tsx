'use client';

import { useState, useMemo } from 'react';
import { stageData } from '@/lib/strategyData';
import {
  stageCls, SectorChip, Th, Td, TableWrap, FilterBar, PageHeader,
} from '@/components/StrategyTable';

const ALL_STAGES = ['S.Bull', 'Bull', 'Accumulation', 'Recovery', 'Warning', 'Bear'];

const STAGE_ORDER: Record<string, number> = {
  'S.Bull': 0,
  'Bull': 1,
  'Accumulation': 2,
  'Recovery': 3,
  'Warning': 4,
  'Bear': 5,
  'Distribution': 6,
};

export default function MarketStagePage() {
  const [stages, setStages] = useState<Set<string>>(new Set(ALL_STAGES));

  const allStagesSelected = stages.size === ALL_STAGES.length;

  function toggleStage(s: string) {
    const next = new Set(stages);
    if (next.has(s)) next.delete(s);
    else next.add(s);
    setStages(next);
  }

  const filtered = useMemo(() =>
    stageData
      .filter(s => allStagesSelected || stages.has(s.Stage))
      .sort((a, b) => {
        const so = (STAGE_ORDER[a.Stage] ?? 99) - (STAGE_ORDER[b.Stage] ?? 99);
        if (so !== 0) return so;
        return b.Bar_Count - a.Bar_Count;
      }),
    [stages, allStagesSelected]
  );

  return (
    <div className="p-4 md:p-6 space-y-4">
      <PageHeader
        title="Market Stage"
        subtitle="Wyckoff/Weinstein Stage Analysis"
        count={filtered.length}
        total={stageData.length}
      />

      <FilterBar>
        <span className="text-[10px] text-white/20 uppercase tracking-wider flex-shrink-0">Stage</span>
        {ALL_STAGES.map(s => (
          <button
            key={s}
            onClick={() => toggleStage(s)}
            className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${
              stages.has(s) ? stageCls(s) : 'bg-white/[0.04] text-white/20 hover:text-white/40'
            }`}
          >
            {s}
          </button>
        ))}
        {!allStagesSelected && (
          <button
            onClick={() => setStages(new Set(ALL_STAGES))}
            className="ml-auto text-[11px] text-white/25 hover:text-white/60 transition-colors"
          >
            Reset
          </button>
        )}
      </FilterBar>

      <TableWrap>
        <thead className="border-b border-white/[0.06] bg-white/[0.015]">
          <tr>
            <Th>#</Th>
            <Th>Symbol</Th>
            <Th>Stage</Th>
            <Th right>Price</Th>
            <Th right>EMA 50</Th>
            <Th right>EMA 200</Th>
            <Th right>วันใน Stage</Th>
            <Th right>ADTV (MB)</Th>
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
              <Td>
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${stageCls(s.Stage)}`}>
                  {s.Stage}
                </span>
              </Td>
              <Td right mono>{s.Price.toFixed(2)}</Td>
              <Td right mono>
                <span className={s.Price > s.EMA50 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}>
                  {s.EMA50.toFixed(2)}
                </span>
              </Td>
              <Td right mono>
                <span className={s.Price > s.EMA200 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}>
                  {s.EMA200.toFixed(2)}
                </span>
              </Td>
              <Td right mono>
                <span className="text-white/60">{s.Bar_Count} วัน</span>
              </Td>
              <Td right mono>{s['ADTV(MB)'].toFixed(0)}</Td>
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
