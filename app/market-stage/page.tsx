'use client';

import { useState, useMemo } from 'react';
import { stageData } from '@/lib/strategyData';
import { scanGeneratedAt } from '@/lib/scanData';
import { formatThaiDate } from '@/lib/utils';
import { useLivePrices } from '@/lib/useLivePrices';
import {
  stageCls, SectorChip, Th, Td, TableWrap, FilterBar, PageHeader, LivePriceCell, SortableTh, SortConfig,
} from '@/components/StrategyTable';

const ALL_STAGES = ['S.Bull', 'Bull', 'Accumulation', 'Recovery', 'Warning', 'Distribution', 'Bear', 'UNKNOWN'];

const STAGE_ORDER: Record<string, number> = {
  'S.Bull': 0,
  'Bull': 1,
  'Accumulation': 2,
  'Recovery': 3,
  'Warning': 4,
  'Bear': 5,
  'Distribution': 6,
  'UNKNOWN': 7,
};

export default function MarketStagePage() {
  const [stages, setStages] = useState<Set<string>>(new Set(ALL_STAGES));
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const { priceMap, fetchDone } = useLivePrices(stageData.map(s => s.Ticker));

  const allStagesSelected = stages.size === ALL_STAGES.length;

  const handleSort = (key: string) => {
    setSortConfig(prev => prev?.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' });
  };

  function toggleStage(s: string) {
    const next = new Set(stages);
    if (next.has(s)) next.delete(s);
    else next.add(s);
    setStages(next);
  }

  const filtered = useMemo(() => {
    let result = stageData.filter(s => allStagesSelected || stages.has(s.Stage));
    if (sortConfig) {
      result = result.sort((a, b) => {
        const aVal = (a as any)[sortConfig.key] || 0;
        const bVal = (b as any)[sortConfig.key] || 0;
        if (sortConfig.key === 'Stage') {
          const soA = STAGE_ORDER[a.Stage] ?? 99;
          const soB = STAGE_ORDER[b.Stage] ?? 99;
          return sortConfig.dir === 'asc' ? soA - soB : soB - soA;
        }
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return sortConfig.dir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }
        return sortConfig.dir === 'asc' ? (aVal || 0) - (bVal || 0) : (bVal || 0) - (aVal || 0);
      });
    } else {
      result = result.sort((a, b) => {
        const so = (STAGE_ORDER[a.Stage] ?? 99) - (STAGE_ORDER[b.Stage] ?? 99);
        if (so !== 0) return so;
        return b.Bar_Count - a.Bar_Count;
      });
    }
    return result;
  }, [stages, allStagesSelected, sortConfig]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <PageHeader
        title="Market Stage"
        subtitle="Wyckoff/Weinstein Stage Analysis"
        count={filtered.length}
        updatedAt={formatThaiDate(scanGeneratedAt)}
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
            <SortableTh sortKey="Ticker" currentSort={sortConfig} onSort={handleSort}>Symbol</SortableTh>
            <SortableTh right sortKey="Price" currentSort={sortConfig} onSort={handleSort}>Price</SortableTh>
            <SortableTh sortKey="Stage" currentSort={sortConfig} onSort={handleSort}>Stage</SortableTh>
            <SortableTh right sortKey="Bar_Count" currentSort={sortConfig} onSort={handleSort}>Days In Stage</SortableTh>
            <SortableTh right sortKey="EMA50" currentSort={sortConfig} onSort={handleSort}>EMA50</SortableTh>
            <SortableTh right sortKey="EMA200" currentSort={sortConfig} onSort={handleSort}>EMA200</SortableTh>
            <SortableTh right sortKey="ADTV(MB)" currentSort={sortConfig} onSort={handleSort}>ADTV (MB)</SortableTh>
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
              <Td right mono>
                <LivePriceCell jsonPrice={s.Price} livePrice={priceMap[s.Ticker]} fetchDone={fetchDone} />
              </Td>
              <Td right mono>
                <span className={s.Price > (s.EMA50 || 0) ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}>
                  {s.EMA50 != null ? s.EMA50.toFixed(2) : '-'}
                </span>
              </Td>
              <Td right mono>
                <span className={s.Price > (s.EMA200 || 0) ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}>
                  {s.EMA200 != null ? s.EMA200.toFixed(2) : '-'}
                </span>
              </Td>
              <Td right mono>
                <span className="text-white/60">{s.Bar_Count != null ? s.Bar_Count : '-'} วัน</span>
              </Td>
              <Td right mono>{s['ADTV(MB)'] != null ? s['ADTV(MB)'].toFixed(0) : '-'}</Td>
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
