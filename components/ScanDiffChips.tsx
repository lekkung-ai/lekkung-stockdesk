'use client';

import { getScanDiff } from '@/lib/scanDiff';

export type DiffFilter = 'all' | 'new' | 'dropped';

// "เข้าใหม่ / หลุดออก" chips row - compares today's scan against the
// previous trading day's snapshot (scripts/compute_scan_diff.py). Dropped
// tickers aren't in today's scan data at all, so selecting that chip swaps
// the table body to DroppedTickersList instead of filtering the normal rows.
export default function ScanDiffChips({
  scanName,
  filter,
  onChange,
}: {
  scanName: string;
  filter: DiffFilter;
  onChange: (f: DiffFilter) => void;
}) {
  const diff = getScanDiff(scanName);
  if (!diff) return null;

  const newCount = diff.newTickers.length;
  const droppedCount = diff.droppedTickers.length;

  const chip = (key: DiffFilter, label: string) => (
    <button
      onClick={() => onChange(key)}
      className={`px-2.5 py-1 rounded-lg text-label font-medium transition-all border ${
        filter === key
          ? 'bg-[#7F77DD]/15 text-[#7F77DD] border-[#7F77DD]/30'
          : 'bg-white/[0.04] text-white/35 border-white/[0.06] hover:text-white/60'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {chip('new', `เข้าใหม่วันนี้ (${newCount})`)}
      {chip('dropped', `หลุดวันนี้ (${droppedCount})`)}
      {chip('all', 'ทั้งหมด')}
    </div>
  );
}
