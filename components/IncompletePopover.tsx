'use client';

import { useState, useRef, useEffect } from 'react';

interface IncompleteItem {
  Ticker: string;
  Reason: string;
}

// "รอข้อมูล N ตัว" used to be a plain hover-tooltip with no way to see WHICH
// tickers or WHY - this makes the count itself actionable so the health of
// the fundamentals pipeline (missing PE_Ratio, ROE, etc.) is inspectable
// without going to look at lekkung_incomplete.json by hand.
export default function IncompletePopover({ items }: { items: IncompleteItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        title="ผ่านเงื่อนไขราคา/สภาพคล่องแล้ว แต่ข้อมูลงบการเงินยังไม่ครบ (Yahoo/F45 ยังดึงไม่สำเร็จ) - คลิกดูรายชื่อ"
        className="text-label text-white/40 hover:text-white/70 underline decoration-dotted underline-offset-2 cursor-pointer transition-colors"
      >
        รอข้อมูล {items.length} ตัว
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 z-20 w-80 max-h-96 overflow-y-auto bg-[#13161e] border border-white/[0.1] rounded-xl shadow-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-label text-white/70 font-semibold">หุ้นที่รอข้อมูล ({items.length})</span>
            <button onClick={() => setOpen(false)} className="text-label text-white/30 hover:text-white/60">✕</button>
          </div>
          <div className="space-y-1.5">
            {items.map(item => (
              <div key={item.Ticker} className="flex items-baseline justify-between gap-3 py-1 border-b border-white/[0.04] last:border-0">
                <span className="text-body font-bold text-white flex-shrink-0">{item.Ticker}</span>
                <span className="text-label text-white/45 text-right">{item.Reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
