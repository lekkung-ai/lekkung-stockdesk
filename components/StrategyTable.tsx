'use client';

import { ReactNode } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { tickerToSector } from '@/lib/sectorData';

export function stageCls(stage: string | null): string {
  if (!stage) return 'bg-white/[0.07] text-white/30';
  if (stage === 'S.Bull') return 'bg-[#1b5e20] text-white';
  if (stage === 'Bull') return 'bg-[#4caf50] text-black font-bold';
  if (stage === 'Accumulation') return 'bg-[#00bcd4] text-black font-bold';
  if (stage === 'Recovery') return 'bg-[#9e9e9e] text-black font-bold';
  if (stage === 'Warning') return 'bg-[#FFEB3B] text-black font-bold';
  if (stage === 'Distribution') return 'bg-[#ff9800] text-black font-bold';
  if (stage === 'UNKNOWN' || stage === 'Unknown') return 'bg-[#424242] text-white font-bold';
  if (stage === 'Bear') return 'bg-[#ef5350] text-white font-bold';
  return 'bg-[#FCEBEB] text-[#791F1F]';
}

export function rsColor(score: number): string {
  if (score >= 80) return '#1D9E75';
  if (score >= 50) return '#BA7517';
  return '#E24B4A';
}

export function SectorChip({ ticker }: { ticker: string }) {
  const s = tickerToSector[ticker];
  if (!s) return null;
  return (
    <span className="text-[10px] text-white/25 truncate max-w-[120px] block mt-0.5">
      {s.sector}
    </span>
  );
}

export function Th({ children, right, className }: { children: ReactNode; right?: boolean; className?: string }) {
  return (
    <th
      className={`px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-white/25 whitespace-nowrap ${
        right ? 'text-right' : 'text-left'
      } ${className ?? ''}`}
    >
      {children}
    </th>
  );
}

export type SortConfig = { key: string; dir: 'asc' | 'desc' } | null;

export function SortableTh({
  children,
  right,
  className,
  sortKey,
  currentSort,
  onSort,
}: {
  children: ReactNode;
  right?: boolean;
  className?: string;
  sortKey: string;
  currentSort: SortConfig;
  onSort: (key: string) => void;
}) {
  const isSorted = currentSort?.key === sortKey;
  const isDesc = currentSort?.dir === 'desc';

  return (
    <th
      onClick={() => onSort(sortKey)}
      className={`px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap cursor-pointer hover:text-white/60 transition-colors select-none ${
        right ? 'text-right' : 'text-left'
      } ${isSorted ? 'text-white/80' : 'text-white/25'} ${className ?? ''}`}
    >
      <div className={`flex items-center gap-1.5 ${right ? 'justify-end' : 'justify-start'}`}>
        {children}
        <div className="flex flex-col -space-y-[6px] opacity-50">
          <ChevronUp size={12} className={isSorted && !isDesc ? 'text-[#F9C942] opacity-100' : ''} />
          <ChevronDown size={12} className={isSorted && isDesc ? 'text-[#F9C942] opacity-100' : ''} />
        </div>
      </div>
    </th>
  );
}

export function Td({ children, right, mono, className }: { children: ReactNode; right?: boolean; mono?: boolean; className?: string }) {
  return (
    <td
      className={`px-3 py-2.5 text-[12px] text-white/70 whitespace-nowrap ${
        right ? 'text-right' : ''
      } ${mono ? 'tabular-nums' : ''} ${className ?? ''}`}
    >
      {children}
    </td>
  );
}

export function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="bg-[#13161e] border border-white/[0.07] rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">{children}</table>
      </div>
    </div>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">{children}</div>
    </div>
  );
}

export function SliderField({
  label, min, max, value, onChange, unit = '', dir = 'gte', step,
}: {
  label: string, min: number, max: number, value: number, onChange: (v: number) => void,
  unit?: string, dir?: 'gte' | 'lte', step?: number
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[10px] text-white/30 uppercase tracking-wider">{label} {dir === 'gte' ? '>=' : '<='}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-24 accent-[#1D9E75]"
      />
      <span className="text-[12px] font-bold text-[#1D9E75] min-w-[3ch]">{value}{unit}</span>
    </div>
  );
}

export function Divider() {
  return <div className="h-4 w-px bg-white/[0.07] hidden sm:block" />;
}

export function LivePriceCell({
  jsonPrice,
  livePrice,
  fetchDone,
}: {
  jsonPrice: number;
  livePrice: number | undefined;
  fetchDone: boolean;
}) {
  if (!fetchDone) return <span className="text-white/40">{jsonPrice.toFixed(2)}</span>;
  if (livePrice != null) return <>{livePrice.toFixed(2)}</>;
  return (
    <span title="ราคา ณ วันที่รัน scan" className="text-white/40 cursor-help">
      {jsonPrice.toFixed(2)}
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  count,
  total,
  updatedAt,
}: {
  title: string;
  subtitle: string;
  count: number;
  total: number;
  updatedAt?: string;
}) {
  return (
    <div>
      <h1 className="text-[18px] font-bold text-white">{title}</h1>
      <p className="text-[12px] text-white/35 mt-0.5">
        <span className="text-white/65 font-medium">{count}</span>
        {' / '}
        {total} หุ้น · {subtitle}
      </p>
      {updatedAt !== undefined && (
        <p className="text-[11px] text-white/25 mt-1">อัปเดตล่าสุด: {updatedAt}</p>
      )}
    </div>
  );
}
