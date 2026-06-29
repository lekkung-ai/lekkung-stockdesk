'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}

export default function Pagination({ page, totalPages, onChange }: Props) {
  if (totalPages <= 1) return null;

  // Build page number list: always show 1, last, and ±2 around current
  const nums: (number | '…')[] = [];
  const add = (n: number) => { if (!nums.includes(n)) nums.push(n); };
  add(1);
  for (let i = Math.max(2, page - 2); i <= Math.min(totalPages - 1, page + 2); i++) add(i);
  add(totalPages);

  // Insert ellipsis
  const withDots: (number | '…')[] = [];
  let prev: number | null = null;
  for (const n of nums as number[]) {
    if (prev !== null && n - prev > 1) withDots.push('…');
    withDots.push(n);
    prev = n;
  }

  const btn = 'min-w-[30px] h-[30px] rounded-lg text-[12px] font-medium transition-colors flex items-center justify-center';

  return (
    <div className="flex items-center justify-center gap-1 pt-3">
      <button
        onClick={() => onChange(page - 1)}
        disabled={page === 1}
        className={`${btn} border border-white/[0.07] text-white/40 hover:text-white/70 disabled:opacity-20 disabled:cursor-not-allowed`}
      >
        <ChevronLeft size={13} />
      </button>
      {withDots.map((n, i) =>
        n === '…' ? (
          <span key={`dot-${i}`} className="text-[12px] text-white/25 px-1">…</span>
        ) : (
          <button
            key={n}
            onClick={() => onChange(n as number)}
            className={`${btn} ${
              n === page
                ? 'bg-white/10 border border-white/20 text-white'
                : 'border border-white/[0.07] text-white/40 hover:text-white/70'
            }`}
          >
            {n}
          </button>
        )
      )}
      <button
        onClick={() => onChange(page + 1)}
        disabled={page === totalPages}
        className={`${btn} border border-white/[0.07] text-white/40 hover:text-white/70 disabled:opacity-20 disabled:cursor-not-allowed`}
      >
        <ChevronRight size={13} />
      </button>
    </div>
  );
}
