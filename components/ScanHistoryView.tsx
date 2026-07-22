'use client';

import { useState, useMemo } from 'react';
import { Calendar, ArrowDown, ArrowUp } from 'lucide-react';
import { getScanHistory } from '@/lib/scanHistory';
import { Th, Td, TableWrap, SortableTh, SortConfig } from '@/components/StrategyTable';
import StockChart from './StockChart';
import ThaiDateInput from './ThaiDateInput';

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
function isoToThaiLabel(iso: string): string {
  const [y, m, d] = iso.split('-');
  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  return `${parseInt(d)} ${months[parseInt(m) - 1]} ${parseInt(y) + 543}`;
}
function daySpan(fromIso: string, toIso: string): number {
  const a = new Date(fromIso + 'T00:00:00Z').getTime();
  const b = new Date(toIso + 'T00:00:00Z').getTime();
  return Math.round((b - a) / 86400000) + 1;
}

interface RangedRow {
  ticker: string;
  hitDatesInRange: string[];
  hitCount: number;
  firstSeen: string;
  lastSeen: string;
  firstClose: number;
  lastClose: number;
  pctChange: number | null;
}

export default function ScanHistoryView({
  scanName,
  initialTicker,
}: {
  scanName: string;
  initialTicker?: string | null;
}) {
  const data = useMemo(() => getScanHistory(scanName), [scanName]);

  // The actual span of data on disk is very often much shorter than
  // windowDays (a fixed 90-day cap on the aggregator) - e.g. only 18 days
  // in if the batch has only been running since July 1st. Deriving the real
  // earliest/latest hit date from the data itself, instead of trusting
  // windowDays, keeps the label and the date-picker bounds honest.
  const { earliestDate, latestDate } = useMemo(() => {
    if (!data || data.tickers.length === 0) return { earliestDate: null as string | null, latestDate: null as string | null };
    let min = data.tickers[0].firstSeen;
    let max = data.tickers[0].lastSeen;
    for (const t of data.tickers) {
      if (t.firstSeen < min) min = t.firstSeen;
      if (t.lastSeen > max) max = t.lastSeen;
    }
    return { earliestDate: min, latestDate: max };
  }, [data]);

  const [fromDate, setFromDate] = useState(earliestDate ?? daysAgoISO(29));
  const [toDate, setToDate] = useState(latestDate ?? todayISO());
  const [selectedTicker, setSelectedTicker] = useState<string | null>(initialTicker ?? null);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'pctChange', dir: 'desc' });

  const handleSort = (key: string) => {
    setSortConfig(prev => prev?.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' });
  };

  const rows: RangedRow[] = useMemo(() => {
    if (!data) return [];
    const out: RangedRow[] = [];
    for (const t of data.tickers) {
      const hitDatesInRange = t.hitDates.filter(d => d >= fromDate && d <= toDate);
      if (hitDatesInRange.length === 0) continue;
      const firstSeen = hitDatesInRange[0];
      const lastSeen = hitDatesInRange[hitDatesInRange.length - 1];
      const firstClose = t.closeByDate[firstSeen];
      const lastClose = t.closeByDate[lastSeen];
      const pctChange = firstClose ? ((lastClose - firstClose) / firstClose) * 100 : null;
      out.push({ ticker: t.ticker, hitDatesInRange, hitCount: hitDatesInRange.length, firstSeen, lastSeen, firstClose, lastClose, pctChange });
    }
    const key = sortConfig?.key ?? 'pctChange';
    const dir = sortConfig?.dir === 'asc' ? 1 : -1;
    out.sort((a, b) => {
      const va = (a as unknown as Record<string, unknown>)[key];
      const vb = (b as unknown as Record<string, unknown>)[key];
      if (typeof va === 'string' && typeof vb === 'string') return dir * va.localeCompare(vb);
      return dir * (((va as number) ?? -Infinity) - ((vb as number) ?? -Infinity));
    });
    return out;
  }, [data, fromDate, toDate, sortConfig]);

  if (!data || data.tickers.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-label text-white/30">ยังไม่มีข้อมูลย้อนหลัง (ต้องรอ batch สะสมข้อมูลอย่างน้อย 1 วัน)</p>
      </div>
    );
  }

  const activeTicker = selectedTicker ?? rows[0]?.ticker ?? null;
  const activeRow = rows.find(r => r.ticker === activeTicker);

  return (
    <div className="space-y-4">
      {/* Date Filter Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#13161e] border border-white/[0.08] p-3.5 rounded-xl">
        <div className="flex flex-wrap items-center gap-2">
          <Calendar size={14} className="text-white/40" />
          <ThaiDateInput
            value={fromDate}
            max={toDate}
            min={earliestDate ?? undefined}
            onChange={setFromDate}
          />
          <span className="text-white/40 text-[12px]">ถึง</span>
          <ThaiDateInput
            value={toDate}
            max={latestDate ?? todayISO()}
            min={fromDate}
            onChange={setToDate}
          />
        </div>
        <div className="text-[11.5px] text-white/40">
          {earliestDate && latestDate && (
            <>ช่วงประวัติ {isoToThaiLabel(earliestDate)} – {isoToThaiLabel(latestDate)} ({daySpan(earliestDate, latestDate)} วัน) · </>
          )}
          อัปเดตล่าสุด {isoToThaiLabel(data.generatedAt.slice(0, 10))}
        </div>
      </div>

      {/* Top Chart Section (Placed ABOVE the table for immediate viewing) */}
      {activeTicker && (
        <div className="bg-[#13161e] border border-emerald-500/30 rounded-xl p-4 shadow-xl space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap border-b border-white/[0.06] pb-3">
            <div className="flex items-center gap-3">
              <h2 className="text-[18px] font-extrabold text-white tracking-wide">{activeTicker}</h2>
              <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                ติด scan {activeRow?.hitCount ?? 0} วันในช่วงวันที่เลือก
              </span>
              <span className="text-[11px] text-white/40 hidden sm:inline">
                (จุดสีเหลืองใต้แท่งเทียน = วันที่ติด scan)
              </span>
            </div>
            {selectedTicker && (
              <button
                onClick={() => setSelectedTicker(null)}
                className="text-[11px] font-medium text-white/50 hover:text-white px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
              >
                ย้อนกลับไปตัวแรก
              </button>
            )}
          </div>
          <StockChart ticker={activeTicker} height={340} showEma10 highlightDates={activeRow?.hitDatesInRange} />
        </div>
      )}

      <p className="text-[11px] text-white/30 italic">
        * คลิกแถวในตารางด้านล่างเพื่อสลับดูกราฟของหุ้นตัวนั้นๆ ด้านบนทันที
      </p>

      {/* History Table */}
      <TableWrap>
        <thead className="border-b border-white/[0.06] bg-white/[0.015]">
          <tr>
            <Th>#</Th>
            <SortableTh sortKey="ticker" currentSort={sortConfig} onSort={handleSort}>Symbol</SortableTh>
            <SortableTh right sortKey="hitCount" currentSort={sortConfig} onSort={handleSort}>จำนวนวันที่ติด</SortableTh>
            <SortableTh sortKey="firstSeen" currentSort={sortConfig} onSort={handleSort}>วันแรก - ล่าสุด</SortableTh>
            <SortableTh right sortKey="firstClose" currentSort={sortConfig} onSort={handleSort}>ราคาแรก → ล่าสุด</SortableTh>
            <SortableTh right sortKey="pctChange" currentSort={sortConfig} onSort={handleSort}>% เปลี่ยน</SortableTh>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const isActive = activeTicker === r.ticker;
            return (
              <tr
                key={r.ticker}
                onClick={() => setSelectedTicker(r.ticker)}
                className={`border-b border-white/[0.04] cursor-pointer transition-colors ${
                  isActive ? 'bg-emerald-500/10 border-l-4 border-l-emerald-500 font-medium' : 'hover:bg-white/[0.03]'
                }`}
              >
                <Td className="text-white/40"><span className="text-white/30 tabular-nums">{i + 1}</span></Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <span className={`font-bold ${isActive ? 'text-emerald-400' : 'text-white'}`}>{r.ticker}</span>
                    {isActive && <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300">กำลังดูอยู่</span>}
                  </div>
                </Td>
                <Td right mono>{r.hitCount}</Td>
                <Td className="text-label text-white/50">
                  {isoToThaiLabel(r.firstSeen)} → {isoToThaiLabel(r.lastSeen)}
                </Td>
                <Td right mono>
                  <span className="text-white/50">{r.firstClose?.toFixed(2)}</span>
                  <span className="text-white/20 mx-1">→</span>
                  <span className="text-white/80">{r.lastClose?.toFixed(2)}</span>
                </Td>
                <Td right mono>
                  {r.pctChange != null ? (
                    <span className={r.pctChange > 0 ? 'text-[#1D9E75]' : r.pctChange < 0 ? 'text-[#E24B4A]' : 'text-white/50'}>
                      {r.pctChange > 0 ? '+' : ''}{r.pctChange.toFixed(2)}%
                    </span>
                  ) : '—'}
                </Td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="py-12 text-center text-label text-white/25">
                ไม่มีหุ้นติด scan ในช่วงวันที่เลือก
              </td>
            </tr>
          )}
        </tbody>
      </TableWrap>
    </div>
  );
}
