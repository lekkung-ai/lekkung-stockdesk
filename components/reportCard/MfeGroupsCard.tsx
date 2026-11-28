'use client';

// Replaces the old dot chart's first view: 4 groups of closed setups (MFE vs sold).
// "ดูรายไม้" expands the original dot chart (collapsed by default).

import { useState } from 'react';
import { MfeScatter } from '@/components/reportCard/ReportCardCharts';
import { fmtInt, fmtPct } from '@/lib/reportCard';
import { MFE_KEEP_RATIO, MFE_NEVER_RAN_PCT, MFE_SMALL_N, MfeGroupKey, groupMfe, mfeHeadline } from '@/lib/mfeGroups';
import { TS } from '@/lib/typeScale';

const META: Record<MfeGroupKey, { no: string; label: string; color: string; meaning: string }> = {
  never: { no: '①', label: 'ไม่เคยวิ่ง', color: '#9ca3af', meaning: 'ซื้อแล้วไม่ไปไหน → ปัญหาการเลือกหุ้น / จังหวะเข้า' },
  gaveAll: { no: '②', label: 'เคยกำไร แต่คืนหมด', color: '#ef4444', meaning: `เคยกำไร ≥ ${MFE_NEVER_RAN_PCT}% แต่จบขาดทุน → กติกาขายช้าเกิน` },
  gaveHalf: { no: '③', label: 'กำไร แต่คืนเกินครึ่ง', color: '#f59e0b', meaning: 'ได้กำไรน้อยกว่าครึ่งของที่เคยขึ้นไป' },
  kept: { no: '④', label: 'เก็บกำไรได้ดี', color: '#22c55e', meaning: 'เก็บได้ตั้งแต่ครึ่งหนึ่งของจุดสูงสุดขึ้นไป' },
};
const pct0 = (v: number) => `${Math.round(v)}%`;

export default function MfeGroupsCard({ points, sampled, color, mfeLine }: { points: [number, number][]; sampled?: boolean; color: string; mfeLine: number }) {
  const [open, setOpen] = useState(false);
  const g = groupMfe(points);
  const h = mfeHeadline(g);
  return (
    <div data-testid="mfe-groups">
      <p className={`${TS.body} text-white/45 mt-0.5 mb-2`}>
        ไม้ที่ปิดแล้ว {fmtInt(g.total)} ไม้{sampled ? ' (สุ่มมา)' : ''} · ปัญหาอยู่ฝั่งไหน
        {g.small && <span data-testid="mfe-small" className="ml-2 text-[#f59e0b] font-semibold">ตัวอย่างน้อย (&lt; {MFE_SMALL_N} ไม้)</span>}
      </p>
      {h && (
        <p data-testid="mfe-headline" className={`${TS.tableCell} text-white/85 mb-3`}>
          ปัญหาหลัก: <b style={{ color: g.main === 'never' ? '#d1d5db' : '#fca5a5' }}>{h.main}</b> — {pct0(h.mainPct)} ของไม้
          {g.main === 'never' ? ` ไม่เคยวิ่งเกิน ${MFE_NEVER_RAN_PCT}% เลย` : ` เคยกำไรแล้วคืนหมด`}
          {' · '}รองลงมา <b>{h.other}</b> {pct0(h.otherPct)}
        </p>
      )}
      <div className="flex h-8 rounded-lg overflow-hidden gap-[2px]" role="img" aria-label="สัดส่วนไม้แต่ละกลุ่ม">
        {g.groups.filter(x => x.n > 0).map(x => (
          <div key={x.key} style={{ width: `${x.pct}%`, background: META[x.key].color }} className="flex items-center justify-center text-[12px] font-bold text-[#0b0d12] overflow-hidden">
            {x.pct >= 6 ? pct0(x.pct) : ''}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mt-3">
        {g.groups.map(x => (
          <div key={x.key} data-testid={`mfe-tile-${x.key}`} className="rounded-lg bg-white/[0.03] border border-white/[0.07] px-3 py-2.5" style={{ borderTop: `4px solid ${META[x.key].color}` }}>
            <div className={`${TS.body} font-semibold text-white/85`}>{META[x.key].no} {META[x.key].label}</div>
            <div className="text-[24px] font-bold text-white leading-tight">{fmtInt(x.n)} <span className={`${TS.body} font-normal text-white/50`}>ไม้ · {pct0(x.pct)}</span></div>
            <div className={`${TS.body} text-white/55 mt-1`}>ขึ้นสูงสุดเฉลี่ย {fmtPct(x.avgMfe)}</div>
            <div className={`${TS.body} text-white/55`}>ขายได้เฉลี่ย {fmtPct(x.avgRet)}</div>
            <div className={`${TS.body} text-white/40 mt-1.5`}>{META[x.key].meaning}</div>
          </div>
        ))}
      </div>
      <button type="button" data-testid="mfe-toggle" onClick={() => setOpen(o => !o)} aria-expanded={open} className={`mt-3 ${TS.body} text-white/60 hover:text-white/85`}>
        {open ? '▾' : '▸'} ดูรายไม้ (กราฟจุดแบบเดิม)
      </button>
      {open && (
        <div data-testid="mfe-scatter" className="mt-2">
          <MfeScatter points={points} color={color} mfeLine={mfeLine} />
          <p className={`${TS.body} text-white/40 mt-1`}>จุดที่อยู่ขวาล่าง = เคยกำไรดีแต่ขายขาดทุน</p>
        </div>
      )}
      <p className={`${TS.body} text-white/40 mt-3`}>
        วิธีแบ่งกลุ่ม · ขึ้นสูงสุด = MFE ระหว่างถือ · ① MFE &lt; {MFE_NEVER_RAN_PCT}% · ② MFE ≥ {MFE_NEVER_RAN_PCT}% และขายขาดทุน (≤ 0) · ③ ขายกำไรแต่ได้ &lt; {MFE_KEEP_RATIO * 100}% ของ MFE · ④ ขายกำไรได้ ≥ {MFE_KEEP_RATIO * 100}% ของ MFE
      </p>
    </div>
  );
}
