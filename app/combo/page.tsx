'use client';

import { useState, useMemo } from 'react';
import { scanData, scanGeneratedAt } from '@/lib/scanData';
import { formatThaiDate } from '@/lib/utils';
import { useLivePrices } from '@/lib/useLivePrices';
import {
  rsColor, stageCls, SectorChip, Th, Td, TableWrap, FilterBar, SliderField, Divider, PageHeader, LivePriceCell,
} from '@/components/StrategyTable';

const ALL_STAGES = ['S.Bull', 'Bull', 'Accumulation', 'Recovery', 'Warning', 'Bear'];

function BadgeCell({ value, label, color }: { value: boolean; label: string; color: string }) {
  if (!value) return <span className="text-white/15 text-[11px]">—</span>;
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold leading-none ${color}`}>
      {label}
    </span>
  );
}

export default function ComboPage() {
  const [comboMin, setComboMin] = useState(2);
  const [stages, setStages] = useState<Set<string>>(new Set(ALL_STAGES));
  const { priceMap, fetchDone } = useLivePrices(scanData.map(s => s.ticker));

  const allStagesSelected = stages.size === ALL_STAGES.length;

  const filtered = useMemo(() =>
    scanData
      .filter(s => s.combo_score >= comboMin)
      .filter(s => allStagesSelected || (s.stage !== null && stages.has(s.stage)))
      .sort((a, b) => b.combo_score - a.combo_score || b.rs_score - a.rs_score),
    [comboMin, stages, allStagesSelected]
  );

  return (
    <div className="p-4 md:p-6 space-y-4">
      <PageHeader
        title="Combo Score"
        subtitle="ผ่านหลาย criteria พร้อมกัน — ยิ่งมากยิ่งแน่"
        count={filtered.length}
        updatedAt={formatThaiDate(scanGeneratedAt)}
        total={scanData.length}
      />

      <FilterBar>
        <SliderField label="Combo ≥" min={0} max={4} value={comboMin} onChange={setComboMin} />
        <Divider />
        <span className="text-[10px] text-white/20 uppercase tracking-wider">Stage</span>
        {ALL_STAGES.map(s => (
          <button
            key={s}
            onClick={() => {
              const next = new Set(stages);
              if (next.has(s)) next.delete(s);
              else next.add(s);
              setStages(next);
            }}
            className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${
              stages.has(s) ? stageCls(s) : 'bg-white/[0.04] text-white/20 hover:text-white/40'
            }`}
          >
            {s}
          </button>
        ))}
        {(!allStagesSelected || comboMin !== 2) && (
          <button
            onClick={() => { setComboMin(2); setStages(new Set(ALL_STAGES)); }}
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
            <Th right>Price</Th>
            <Th>Stage</Th>
            <Th>SEPA</Th>
            <Th>Kell</Th>
            <Th>BO</Th>
            <Th right>RS</Th>
            <Th right>Combo</Th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((s, i) => (
            <tr key={s.ticker} className="border-b border-white/[0.04] hover:bg-white/[0.025] transition-colors">
              <Td><span className="text-white/20 tabular-nums">{i + 1}</span></Td>
              <Td>
                <div className="font-bold text-white">{s.ticker}</div>
                <SectorChip ticker={s.ticker} />
              </Td>
              <Td right mono>
                <LivePriceCell jsonPrice={s.price} livePrice={priceMap[s.ticker]} fetchDone={fetchDone} />
              </Td>
              <Td>
                {s.stage ? (
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${stageCls(s.stage)}`}>
                    {s.stage}
                  </span>
                ) : <span className="text-white/20 text-[11px]">—</span>}
              </Td>
              <Td><BadgeCell value={s.sepa} label="SEPA" color="bg-[#EAF3DE] text-[#27500A]" /></Td>
              <Td><BadgeCell value={s.kell} label="Kell" color="bg-[#E6F1FB] text-[#0C447C]" /></Td>
              <Td><BadgeCell value={s.breakout} label="BO" color="bg-[#E6F1FB] text-[#0C447C]" /></Td>
              <Td right mono>
                <span className="font-bold text-[14px]" style={{ color: rsColor(s.rs_score) }}>
                  {s.rs_score}
                </span>
              </Td>
              <Td right>
                <div className="flex items-center justify-end gap-1">
                  {Array.from({ length: 4 }, (_, idx) => (
                    <div
                      key={idx}
                      className={`w-2 h-2 rounded-full ${
                        idx < s.combo_score ? 'bg-[#1D9E75]' : 'bg-white/[0.08]'
                      }`}
                    />
                  ))}
                  <span className="text-[12px] font-semibold text-white/60 ml-1 tabular-nums">
                    {s.combo_score}
                  </span>
                </div>
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
