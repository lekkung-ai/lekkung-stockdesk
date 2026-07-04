'use client';

import { useState, useMemo } from 'react';
import { kellData } from '@/lib/strategyData';
import { daysInScan } from '@/lib/scanDays';
import { scanGeneratedAt } from '@/lib/scanData';
import { formatThaiDate } from '@/lib/utils';
import { useLivePrices } from '@/lib/useLivePrices';
import {
  SectorChip, Th, Td, TableWrap, FilterBar, SliderField, Divider, PageHeader, LivePriceCell, SortableTh, SortConfig,
} from '@/components/StrategyTable';

const SIGNALS = ['ทั้งหมด', 'EMAC Buy', 'Trend Riding'] as const;
type SignalFilter = (typeof SIGNALS)[number];

function distColor(dist: number): string {
  if (dist <= 2) return '#1D9E75';
  if (dist <= 5) return '#EF9F27';
  return '#E24B4A';
}

export default function KellPage() {
  const [signalFilter, setSignalFilter] = useState<SignalFilter>('ทั้งหมด');
  const [distMax, setDistMax] = useState(8);
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const { priceMap, fetchDone } = useLivePrices(kellData.map(s => s.Ticker));

  const handleSort = (key: string) => {
    setSortConfig(prev => prev?.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' });
  };

  const filtered = useMemo(() => {
    let result = kellData
      .filter(s => signalFilter === 'ทั้งหมด' || s.Signal === signalFilter)
      .filter(s => s['Dist_EMA10_%'] <= distMax);
      
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
      result = result.sort((a, b) => Math.abs(a['Dist_EMA10_%']) - Math.abs(b['Dist_EMA10_%']));
    }
    return result;
  }, [signalFilter, distMax, sortConfig]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <PageHeader
        title="Oliver Kell EMAC"
        subtitle="EMA 10 Channel — ยิ่งแนบ EMA ยิ่งดี"
        count={filtered.length}
        updatedAt={formatThaiDate(scanGeneratedAt)}
        total={kellData.length}
      />

      <FilterBar>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-white/40 mr-1">Signal</span>
          {SIGNALS.map(sig => (
            <button
              key={sig}
              onClick={() => setSignalFilter(sig)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all border ${
                signalFilter === sig
                  ? 'bg-[#1D9E75]/10 text-[#1D9E75] border-[#1D9E75]/25'
                  : 'bg-white/[0.04] text-white/35 border-white/[0.06] hover:text-white/60'
              }`}
            >
              {sig}
            </button>
          ))}
        </div>
        <Divider />
        <SliderField
          label="Dist EMA10"
          min={1}
          max={15}
          value={distMax}
          onChange={setDistMax}
          unit="%"
          dir="lte"
        />
      </FilterBar>

      <TableWrap>
        <thead className="border-b border-white/[0.06] bg-white/[0.015]">
          <tr>
            <Th>#</Th>
            <SortableTh sortKey="Ticker" currentSort={sortConfig} onSort={handleSort}>Symbol</SortableTh>
            <SortableTh sortKey="Signal" currentSort={sortConfig} onSort={handleSort}>Signal</SortableTh>
            <SortableTh right sortKey="Price" currentSort={sortConfig} onSort={handleSort}>Price</SortableTh>
            <Th right>Days</Th>
            <SortableTh right sortKey="EMA10" currentSort={sortConfig} onSort={handleSort}>EMA10</SortableTh>
            <SortableTh right sortKey="Dist_EMA10_%" currentSort={sortConfig} onSort={handleSort}>% Dist EMA10</SortableTh>
            <SortableTh right sortKey="ADTV(MB)" currentSort={sortConfig} onSort={handleSort}>ADTV (MB)</SortableTh>
            <Th>Status</Th>
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
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
                  s.Signal === 'EMAC Buy'
                    ? 'bg-[#EAF3DE] text-[#27500A]'
                    : 'bg-[#E6F1FB] text-[#0C447C]'
                }`}>
                  {s.Signal}
                </span>
              </Td>
              <Td right mono>
                <LivePriceCell jsonPrice={s.Price} livePrice={priceMap[s.Ticker]} fetchDone={fetchDone} />
              </Td>
              <Td right mono>
                <span className="text-white/60">{daysInScan('kell', s.Ticker) ?? '—'}</span>
              </Td>
              <Td right mono>{s.EMA10.toFixed(2)}</Td>
              <Td right mono>
                <span className="font-semibold" style={{ color: distColor(s['Dist_EMA10_%']) }}>
                  {s['Dist_EMA10_%'].toFixed(1)}%
                </span>
              </Td>
              <Td right mono>{s['ADTV(MB)'].toFixed(0)}</Td>
              <Td>
                <span className={`text-[11px] ${
                  s.Status === 'ชิด EMA' ? 'text-[#1D9E75]'
                  : s.Status === 'Trend OK' ? 'text-[#EF9F27]'
                  : 'text-white/35'
                }`}>
                  {s.Status}
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
