'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { stageCls } from '@/components/StrategyTable';

export const STAGE_ALL = 'all';

// Single-select stage dropdown - a native <select> can't color its <option>s,
// so each choice (and the trigger showing the current one) renders as the
// same stageCls badge the table uses, with its row count alongside.
export default function StageSelect({
  stages,
  counts,
  totalCount,
  value,
  onChange,
}: {
  stages: string[];
  counts: Record<string, number>;
  totalCount: number;
  value: string;
  onChange: (stage: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const options = [STAGE_ALL, ...stages];

  const badge = (s: string) =>
    s === STAGE_ALL ? (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-white/[0.08] text-white/70">
        ทั้งหมด ({totalCount})
      </span>
    ) : (
      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${stageCls(s)}`}>
        {s} ({counts[s] ?? 0})
      </span>
    );

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-md pl-1.5 pr-1 py-1 hover:border-white/20 transition-colors"
      >
        {badge(value)}
        <ChevronDown size={12} className={`text-white/40 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute left-0 top-full mt-1 z-30 min-w-[180px] bg-[#13161e] border border-white/[0.1] rounded-lg shadow-xl py-1"
        >
          {options.map(s => (
            <li key={s} role="option" aria-selected={s === value}>
              <button
                type="button"
                onClick={() => { onChange(s); setOpen(false); }}
                className={`w-full flex items-center justify-between gap-3 px-2.5 py-1.5 text-left transition-colors ${
                  s === value ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'
                }`}
              >
                {badge(s)}
                {s === value && <Check size={12} className="text-white/60" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
