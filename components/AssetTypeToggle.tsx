'use client';

import type { AssetType } from '@/lib/fundFilter';

const LABELS: Record<AssetType, string> = { stock: 'หุ้น', fund: 'กองทุน & REIT', all: 'ทั้งหมด' };
const ORDER: AssetType[] = ['stock', 'fund', 'all'];

// "หุ้น (n) / กองทุน & REIT (n) / ทั้งหมด (n)" — same pill look as ModeToggle.
// counts = rows after the page's other filters (stage / RS / เข้าใหม่) so each
// number matches what choosing it would list.
export default function AssetTypeToggle({
  value,
  counts,
  onChange,
}: {
  value: AssetType;
  counts: Record<AssetType, number>;
  onChange: (type: AssetType) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 bg-[#13161e] border border-white/[0.07] rounded-xl p-0.5 flex-shrink-0">
      {ORDER.map(t => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={`px-3 py-1.5 rounded-lg text-label font-medium transition-colors whitespace-nowrap ${
            value === t ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'
          }`}
        >
          {LABELS[t]} ({counts[t]})
        </button>
      ))}
    </div>
  );
}
