'use client';

// Sticky "showing X of Y" counter for the mobile infinite-scroll table view -
// sticks to the top of #app-scroll as the list scrolls underneath it, so the
// user always has a sense of how much further there is to go.
export default function MobileScanProgress({ shown, total }: { shown: number; total: number }) {
  if (total === 0) return null;
  return (
    <div className="md:hidden sticky top-0 z-10 py-1.5 mb-2 bg-[#0d0f15] text-[11px] text-white/40 text-center rounded-lg border border-white/[0.06]">
      แสดง {shown.toLocaleString('th-TH')} / ทั้งหมด {total.toLocaleString('th-TH')} ตัว
    </div>
  );
}
