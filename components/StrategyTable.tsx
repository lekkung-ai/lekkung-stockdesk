'use client';

import { ReactNode } from 'react';
import { tickerToSector } from '@/lib/sectorData';

export function stageCls(stage: string | null): string {
  if (!stage) return 'bg-white/[0.07] text-white/30';
  if (stage === 'Bull' || stage === 'S.Bull') return 'bg-[#EAF3DE] text-[#27500A]';
  if (stage === 'Accumulation' || stage === 'Recovery') return 'bg-[#E6F1FB] text-[#0C447C]';
  if (stage === 'Warning') return 'bg-[#FAEEDA] text-[#633806]';
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
  label,
  min,
  max,
  value,
  onChange,
  unit = '',
  dir = 'gte',
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  dir?: 'gte' | 'lte';
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-white/40 whitespace-nowrap">
        {label} {dir === 'gte' ? '≥' : '≤'}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={(max - min) <= 20 ? 1 : (max - min) <= 100 ? 1 : 1}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-28 accent-[#1D9E75] cursor-pointer"
      />
      <span className="text-[13px] font-semibold text-[#1D9E75] tabular-nums w-14 text-right">
        {value}{unit}
      </span>
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
