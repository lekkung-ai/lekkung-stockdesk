'use client';

import { useSyncExternalStore } from 'react';
import { formatThaiDate } from '@/lib/utils';
import { freshnessCutoffMs } from '@/components/StaleDataBanner';

// Small "last updated" label for a data file's generated_at. Turns orange with
// "ข้อมูลไม่อัปเดต" once the data is older than one business day — same cutoff
// as StaleDataBanner, so a frozen pipeline can't hide behind a fixed "today" label.

const noopSubscribe = () => () => {};

function isStale(generatedAt: string | null | undefined): boolean {
  if (!generatedAt) return true;
  const ms = new Date(generatedAt).getTime();
  return Number.isNaN(ms) || ms < freshnessCutoffMs(Date.now());
}

export default function DataUpdatedBadge({ generatedAt }: { generatedAt: string | null | undefined }) {
  // Evaluated on the client only: the page is prerendered at build time, where
  // "now" would be the build's clock. Server snapshot = not stale (no flash of orange).
  const stale = useSyncExternalStore(noopSubscribe, () => isStale(generatedAt), () => false);
  const label = `อัปเดต ${formatThaiDate(generatedAt)}`;

  if (!stale) {
    return <span className="text-[11.5px] text-white/40 font-medium">{label}</span>;
  }
  return (
    <span className="text-[11.5px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-md px-2 py-0.5">
      ⚠ ข้อมูลไม่อัปเดต · {label}
    </span>
  );
}
