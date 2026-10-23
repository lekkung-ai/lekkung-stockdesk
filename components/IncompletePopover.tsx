'use client';

import { useState, useRef, useEffect } from 'react';

interface IncompleteItem {
  Ticker: string;
  Reason: string;
}

// Reason from lekkung_incomplete.json (pipeline English) → short Thai; the raw text stays in the tooltip
const FIELD_TH: Record<string, string> = {
  PE_Ratio: 'P/E',
  NetProfit_Growth_QoQY: 'Profit Gr',
  Revenue_Growth_YoY: 'Rev Gr',
  Profit_Growth_YoY: 'Profit Gr (ปี)',
};

// "missing: PE_Ratio; stale: NetProfit_Growth_QoQY Q1/26" → "ไม่มีค่า P/E · งบค้าง Q1/26 (Profit Gr)"
// stale = the newest period the sources had is older than the one already due (SET deadline + 7 days),
// so the pipeline refused to compute growth from it
export function reasonTh(reason: string): string {
  if (/not in daily_prices/i.test(reason)) return 'ดึงราคาและงบการเงินไม่สำเร็จ';
  const parts = reason.trim().split(/\s*;\s*/).map(part => {
    const m = /^(missing|stale):\s*(.+)$/i.exec(part);
    if (!m) return part;
    const items = m[2].split(/\s*,\s*/);
    if (m[1].toLowerCase() === 'missing') return `ไม่มีค่า ${items.map(f => FIELD_TH[f] ?? f).join(', ')}`;
    return items.map(it => {
      const [field, period] = it.split(/\s+/);
      return `งบค้าง ${period ?? ''} (${FIELD_TH[field] ?? field})`.replace('  ', ' ');
    }).join(', ');
  });
  return parts.join(' · ');
}

// The "งบไม่ครบ N ตัว" button (was "รอข้อมูล N ตัว") used to be a plain hover-tooltip with no way to see WHICH
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
        title="หุ้นที่ผ่านเงื่อนไขราคา/สภาพคล่องแล้ว แต่ยังไม่อยู่ในตาราง เพราะข้อมูลงบการเงินไม่ครบ (Yahoo/F45 ยังดึงไม่สำเร็จ หรือมีแต่งบไตรมาสเก่ากว่าที่ควรมี = งบค้าง) - คลิกดูรายชื่อ"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-amber-500/[0.08] text-amber-300/80 hover:bg-amber-500/15 hover:text-amber-200 transition-colors border border-amber-500/20 whitespace-nowrap"
        data-testid="lekkung-incomplete"
      >
        งบไม่ครบ {items.length} ตัว · ยังไม่อยู่ในตาราง
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 z-20 w-80 max-h-96 overflow-y-auto bg-[#13161e] border border-white/[0.1] rounded-xl shadow-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-label text-white/70 font-semibold">ผ่านเงื่อนไขราคาแล้ว แต่งบการเงินไม่ครบ ({items.length})</span>
            <button onClick={() => setOpen(false)} className="text-label text-white/30 hover:text-white/60">✕</button>
          </div>
          <p className="text-label text-white/40 mb-2">หุ้นเหล่านี้จะเข้าตารางเมื่อดึงงบได้ครบในสแกนรอบถัดไป</p>
          <div className="space-y-1.5">
            {items.map(item => (
              <div key={item.Ticker} className="flex items-baseline justify-between gap-3 py-1 border-b border-white/[0.04] last:border-0">
                <span className="text-body font-bold text-white flex-shrink-0">{item.Ticker}</span>
                <span className="text-label text-white/45 text-right" title={item.Reason}>{reasonTh(item.Reason)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
