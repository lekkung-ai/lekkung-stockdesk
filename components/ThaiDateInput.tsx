'use client';

import { useRef } from 'react';

function isoToThaiShort(iso: string): string {
  const [y, m, d] = iso.split('-');
  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  return `${parseInt(d)} ${months[parseInt(m) - 1]} ${parseInt(y) + 543}`;
}

// Native <input type="date"> always renders its text in the browser/OS
// locale (US "06/19/2026" regardless of any lang/locale prop) - there's no
// standard HTML/CSS way to override just the displayed text while keeping
// the native calendar picker. This wraps the native input (kept, but made
// invisible via text-transparent + a transparent caret) with a Thai-label
// overlay on top, positioned so a click still lands on - and opens - the
// real native input underneath.
export default function ThaiDateInput({
  value,
  min,
  max,
  onChange,
}: {
  value: string;
  min?: string;
  max?: string;
  onChange: (iso: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      className="relative px-2 py-2 bg-[#13161e] border border-white/[0.07] rounded-xl text-label text-white/70 outline-none focus-within:border-white/20 [color-scheme:dark] cursor-pointer"
      onClick={() => {
        const el = inputRef.current;
        if (!el) return;
        // showPicker() is the only way to open a native date picker
        // programmatically; fall back to focus() where unsupported.
        if (typeof el.showPicker === 'function') el.showPicker();
        else el.focus();
      }}
    >
      <span className="pointer-events-none tabular-nums">{isoToThaiShort(value)}</span>
      <input
        ref={inputRef}
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={e => e.target.value && onChange(e.target.value)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        aria-label="เลือกวันที่"
      />
    </div>
  );
}
