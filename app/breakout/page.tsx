'use client';

import { useState, useMemo } from 'react';
import { breakoutData } from '@/lib/strategyData';
import { daysInScan } from '@/lib/scanDays';
import { getScanGeneratedAt } from '@/lib/scanGeneratedAt';
import StaleDataBanner from '@/components/StaleDataBanner';
import { formatThaiDate } from '@/lib/utils';
import { useLivePrices } from '@/lib/useLivePrices';
import {
  SectorChip, Th, Td, TableWrap, FilterBar, SliderField, Divider, PageHeader, LivePriceCell, SortableTh, SortConfig,
} from '@/components/StrategyTable';
import ScanHistoryView from '@/components/ScanHistoryView';
import ModeToggle from '@/components/ModeToggle';
import TrendSparkline from '@/components/TrendSparkline';
import { sparklineMap } from '@/lib/sparklineData';
import ScanDiffChips, { DiffFilter } from '@/components/ScanDiffChips';
import DroppedTickersList from '@/components/DroppedTickersList';
import NewBadge from '@/components/NewBadge';
import { getScanDiff } from '@/lib/scanDiff';
import ReportCardBar from '@/components/ReportCardBar';

export default function BreakoutPage() {
  const [toBreakMax, setToBreakMax] = useState(10);
  const [boxWidthMax, setBoxWidthMax] = useState(20);
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const [mode, setMode] = useState<'today' | 'history'>('today');
  const [diffFilter, setDiffFilter] = useState<DiffFilter>('all');
  const { priceMap, fetchDone } = useLivePrices(breakoutData.map(s => s.Ticker));
  const newSet = useMemo(() => new Set(getScanDiff('breakout')?.newTickers ?? []), []);

  const handleSort = (key: string) => {
    setSortConfig(prev => prev?.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' });
  };

  const filtered = useMemo(() => {
    let result = breakoutData
      .filter(s => s['To_Break'] <= toBreakMax)
      .filter(s => s['Box_Width'] <= boxWidthMax)
      .filter(s => diffFilter !== 'new' || newSet.has(s.Ticker));

    if (sortConfig) {
      result = result.sort((a, b) => {
        if (sortConfig.key === '__days') {
          const aVal = daysInScan('breakout', a.Ticker) ?? -1;
          const bVal = daysInScan('breakout', b.Ticker) ?? -1;
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
      result = result.sort((a, b) => a['To_Break'] - b['To_Break']);
    }
    return result;
  }, [toBreakMax, boxWidthMax, sortConfig, diffFilter, newSet]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader
          title="Breakout Setup"
          subtitle="VDU / Box Pattern — ยิ่ง To_Break น้อย ยิ่งจ่อ break"
          count={filtered.length}
          updatedAt={formatThaiDate(getScanGeneratedAt('breakout'))}
          total={breakoutData.length}
        />
        <ModeToggle mode={mode} onChange={setMode} />
      </div>
      <StaleDataBanner generatedAt={getScanGeneratedAt('breakout')} />
      <ReportCardBar scanKey="breakout" />

      {mode === 'history' ? (
        <ScanHistoryView scanName="breakout" />
      ) : (
      <>
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
        <span className="text-label text-white/25 ml-auto">
          ค่าติดลบ = broke แล้ว
        </span>
        <Divider />
        <ScanDiffChips scanName="breakout" filter={diffFilter} onChange={setDiffFilter} />
      </FilterBar>

      {diffFilter === 'dropped' ? (
        <DroppedTickersList scanName="breakout" />
      ) : (
      <TableWrap>
        <thead className="border-b border-white/[0.06] bg-white/[0.015]">
          <tr>
            <Th>#</Th>
            <SortableTh sortKey="Ticker" currentSort={sortConfig} onSort={handleSort}>Symbol</SortableTh>
            <SortableTh right sortKey="Price" currentSort={sortConfig} onSort={handleSort}>Price</SortableTh>
            <Th right>Trend</Th>
            <SortableTh right sortKey="__days" currentSort={sortConfig} onSort={handleSort}>Days</SortableTh>
            <SortableTh right sortKey="Box_High(Break)" currentSort={sortConfig} onSort={handleSort}>Break Price</SortableTh>
            <SortableTh right sortKey="To_Break" currentSort={sortConfig} onSort={handleSort}>% To Break</SortableTh>
            <SortableTh right sortKey="Box_Width" currentSort={sortConfig} onSort={handleSort}>Box Width</SortableTh>
            <SortableTh right sortKey="ADTV(MB)" currentSort={sortConfig} onSort={handleSort}>ADTV (MB)</SortableTh>
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
                    {newSet.has(s.Ticker) && <NewBadge />}
                  </div>
                  <SectorChip ticker={s.Ticker} />
                </Td>
                <Td right mono>
                  <LivePriceCell jsonPrice={s.Price} livePrice={priceMap[s.Ticker]} fetchDone={fetchDone} />
                </Td>
                <Td right>
                  <div className="flex justify-end"><TrendSparkline data={sparklineMap[s.Ticker]} /></div>
                </Td>
                <Td right mono>
                  <span className="text-white/60">{daysInScan('breakout', s.Ticker) ?? '—'}</span>
                </Td>
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
              <td colSpan={10} className="py-12 text-center text-[13px] text-white/25">
                ไม่พบหุ้นที่ตรงกับ filter
              </td>
            </tr>
          )}
        </tbody>
      </TableWrap>
      )}
      </>
      )}
    </div>
  );
}
