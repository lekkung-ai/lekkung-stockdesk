'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { sectorToSlug } from '@/lib/sectorData';
import { heatColor, heatTextColor } from '@/lib/heatColor';
import { formatPct } from '@/lib/sectorChange';
import {
  flowChg, flowLabel, flowRows, flowValue, parseFlowWindow, parseSortDir, parseSortKey, rowName, strengthRows,
  MIN_AVG_VALUE_MB, type FlowRow, type FlowWindow, type SortKey,
} from '@/lib/sectorFlow';

const STATUS_STYLE: Record<string, string> = {
  'แข็งต่อเนื่อง': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40',
  'เพิ่งเริ่มแข็ง': 'bg-sky-500/15 text-sky-400 border-sky-500/40',
  'เริ่มหมดแรง': 'bg-orange-500/15 text-orange-400 border-orange-500/40',
  'อ่อนต่อเนื่อง': 'bg-rose-500/15 text-rose-400 border-rose-500/40',
};

const BAR_MAX = 3; // bars saturate at ×3 so one outlier doesn't flatten the rest
const FLOW_COLS = 'md:grid-cols-[minmax(170px,1.1fr)_2fr_64px_120px_72px_170px]';

const fmtMb = (v: number | null | undefined) =>
  v == null ? '—' : v >= 1000 ? `${(v / 1000).toFixed(1)} พัน` : v.toFixed(v < 10 ? 1 : 0);

function PctText({ pct }: { pct: number | null }) {
  const c = heatTextColor(pct);
  if (pct == null || c == null) return <span className="text-white/30">—</span>;
  return <span className="font-mono font-bold" style={{ color: c }}>{formatPct(pct)}</span>;
}

// Excess-return cell colour: the ±3% heat scale stretched to ±5%
const excessColor = (v: number | null) => heatColor(v == null ? null : (v * 3) / 5);

export default function SectorFlowView({ subsectors, sectors, marketBenchmark = false }: { subsectors: FlowRow[]; sectors: FlowRow[]; marketBenchmark?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const win: FlowWindow = parseFlowWindow(sp.get('flow'));
  const showAll = sp.get('all') === '1';
  const tab = sp.get('tab') === 'sector' ? 'sector' : 'subsector';
  const sortKey = parseSortKey(sp.get('sort'));
  const sortDir = parseSortDir(sp.get('dir'));

  const setParams = (upd: Record<string, string | null>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(upd)) {
      if (v == null) p.delete(k);
      else p.set(k, v);
    }
    const q = p.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  };

  const flowList = useMemo(() => flowRows(subsectors, win, showAll), [subsectors, win, showAll]);
  const hiddenCount = subsectors.length - flowRows(subsectors, win, false).length;
  const strengthList = useMemo(
    () => strengthRows(tab === 'sector' ? sectors : subsectors, sortKey, sortDir),
    [tab, sectors, subsectors, sortKey, sortDir],
  );

  const clickSort = (key: SortKey) => {
    if (sortKey === key) setParams({ sort: key, dir: sortDir === 'desc' ? 'asc' : 'desc' });
    else setParams({ sort: key, dir: key === 'name' ? 'asc' : 'desc' });
  };

  const seg = (active: boolean) =>
    `px-3.5 py-1.5 rounded-lg text-[12px] font-bold transition-all ${active ? 'bg-white text-black shadow-sm' : 'text-white/50 hover:text-white'}`;

  const th = (k: SortKey, label: string, align: 'text-left' | 'text-right' | 'text-center' = 'text-right') => (
    <th className={`px-3 py-2.5 font-semibold ${align}`}>
      <button onClick={() => clickSort(k)} className="inline-flex items-center gap-1 hover:text-white transition-colors">
        {label}
        {sortKey === k && (sortDir === 'desc' ? <ArrowDown size={11} /> : <ArrowUp size={11} />)}
      </button>
    </th>
  );

  return (
    <div className="space-y-5">
      {/* Section 1: where is money flowing */}
      <section className="bg-[#13161e] border border-white/[0.08] rounded-2xl p-4 space-y-3" data-testid="flow-section">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[15px] font-extrabold text-white">เงินไหลเข้ากลุ่มไหน</h2>
          <div className="flex gap-1 bg-white/[0.04] p-1 rounded-xl border border-white/[0.08]">
            <button className={seg(win === '1d')} onClick={() => setParams({ flow: null })}>วันนี้</button>
            <button className={seg(win === '5d')} onClick={() => setParams({ flow: '5d' })}>5 วัน</button>
          </div>
        </div>

        <div className={`hidden md:grid ${FLOW_COLS} gap-3 px-2 text-[10.5px] text-white/35`}>
          <span>กลุ่มย่อย</span>
          <span>สัดส่วนมูลค่าซื้อขายเทียบปกติ (เส้น = ×1.0)</span>
          <span className="text-right">×เท่า</span>
          <span className="text-right">มูลค่า (ล้านบาท) {win === '1d' ? 'วันนี้' : 'เฉลี่ย 5 วัน'} / ปกติ</span>
          <span className="text-right">ราคากลุ่ม</span>
          <span>ความหมาย</span>
        </div>

        <div className="space-y-1">
          {flowList.map(r => {
            const f = flowValue(r, win);
            const chg = flowChg(r, win);
            const label = flowLabel(f, chg);
            const val = win === '1d' ? r.value_1d : r.value_5d;
            const base = win === '1d' ? r.base_value_1d : r.base_value_5d;
            const pctBar = f == null ? 0 : (Math.min(f, BAR_MAX) / BAR_MAX) * 100;
            const refPct = (1 / BAR_MAX) * 100;
            return (
              <div key={`${r.sector}/${r.subsector}`} className={`grid grid-cols-2 ${FLOW_COLS} gap-x-3 gap-y-1 items-center px-2 py-1.5 rounded-lg hover:bg-white/[0.03]`}>
                <Link href={`/sector/${sectorToSlug(r.sector)}?market=SET`} className="min-w-0 col-span-2 md:col-span-1">
                  <p className="text-[13px] font-bold text-white truncate">{r.subsector}</p>
                  <p className="text-[10.5px] text-white/35 truncate">{r.sector}</p>
                </Link>
                <div className="relative h-4 bg-white/[0.04] rounded col-span-2 md:col-span-1">
                  <div className="absolute inset-y-0 left-0 rounded" style={{ width: `${pctBar}%`, background: f != null && f >= 1.3 ? '#3B82F6' : f != null && f <= 0.7 ? '#4B5060' : '#6B7280' }} />
                  <div className="absolute inset-y-[-2px] w-px bg-white/70" style={{ left: `${refPct}%` }} />
                </div>
                <span className="text-right font-mono font-extrabold text-[13px] text-white">{f == null ? '—' : `×${f.toFixed(2)}`}</span>
                <span className="text-right text-[11.5px] text-white/50 font-mono">{fmtMb(val)} / {fmtMb(base)}</span>
                <span className="text-right text-[12px]"><PctText pct={chg} /></span>
                <span className={`text-[11.5px] font-semibold ${label === 'เงียบ' ? 'text-white/35' : label?.includes('ลง') ? 'text-rose-400' : 'text-emerald-400'}`}>{label ?? ''}</span>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between text-[11px] text-white/40 pt-1 border-t border-white/[0.05]">
          <span>
            แสดง {flowList.length} กลุ่ม
            {!showAll && hiddenCount > 0 ? ` · ซ่อน ${hiddenCount} กลุ่มที่ซื้อขายเฉลี่ย < ${MIN_AVG_VALUE_MB} ล้านบาท/วัน` : ''}
          </span>
          {(hiddenCount > 0 || showAll) && (
            <button onClick={() => setParams({ all: showAll ? null : '1' })} className="px-2.5 py-1 rounded-lg border border-white/10 bg-white/[0.04] hover:text-white">
              {showAll ? 'ซ่อนกลุ่มเล็ก' : 'แสดงทั้งหมด'}
            </button>
          )}
        </div>
      </section>

      {/* Section 2: getting stronger / fading */}
      <section className="bg-[#13161e] border border-white/[0.08] rounded-2xl p-4 space-y-3" data-testid="strength-section">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-extrabold text-white">กลุ่มไหนกำลังแข็งขึ้น / หมดแรง</h2>
            <p className="text-[11.5px] text-white/40 mt-0.5">ผลตอบแทนส่วนเกินเทียบ SET (จุด %) · เรียงค่าเริ่มต้นตามสถานะ · คลิกหัวคอลัมน์เพื่อเรียง · คลิกแถวเพื่อดู sector</p>
            {marketBenchmark && (
              <p className="text-[11px] text-amber-400/80 mt-0.5" data-testid="benchmark-note">เทียบกับค่าเฉลี่ยทั้งตลาด (ข้อมูลดัชนี SET ไม่อัปเดต)</p>
            )}
          </div>
          <div className="flex gap-1 bg-white/[0.04] p-1 rounded-xl border border-white/[0.08]">
            <button className={seg(tab === 'subsector')} onClick={() => setParams({ tab: null })}>Subsector</button>
            <button className={seg(tab === 'sector')} onClick={() => setParams({ tab: 'sector' })}>Sector</button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-[11px] text-white/40 border-b border-white/[0.06]">
                {th('name', tab === 'sector' ? 'Sector' : 'Subsector', 'text-left')}
                {th('n', 'จำนวนหุ้น')}
                {th('excess_1w', 'ส่วนเกิน 1W', 'text-center')}
                {th('excess_1m', 'ส่วนเกิน 1M', 'text-center')}
                {th('excess_3m', 'ส่วนเกิน 3M', 'text-center')}
                {th('status', 'สถานะ', 'text-center')}
              </tr>
            </thead>
            <tbody>
              {strengthList.map(r => (
                <tr
                  key={`${r.sector}/${r.subsector ?? ''}`}
                  onClick={() => router.push(`/sector/${sectorToSlug(r.sector)}?market=SET`)}
                  className="border-b border-white/[0.04] hover:bg-white/[0.04] cursor-pointer"
                >
                  <td className="px-3 py-2">
                    <Link href={`/sector/${sectorToSlug(r.sector)}?market=SET`} onClick={e => e.stopPropagation()} className="font-bold text-white hover:underline">{rowName(r)}</Link>
                    {r.subsector && <span className="ml-2 text-[10.5px] text-white/35">{r.sector}</span>}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-white/50">{r.n}</td>
                  {([r.excess_1w, r.excess_1m, r.excess_3m] as (number | null)[]).map((v, i) => (
                    <td key={i} className="px-1 py-1">
                      <div className="rounded text-center py-1.5 font-mono font-bold text-white" style={{ background: excessColor(v), textShadow: '0 1px 2px rgba(0,0,0,0.55)', opacity: v == null ? 0.5 : 1 }}>
                        {v == null ? '—' : formatPct(v)}
                      </div>
                    </td>
                  ))}
                  <td className="px-3 py-2 text-center">
                    {r.status ? (
                      <span className={`inline-block px-2.5 py-0.5 rounded-full border text-[11px] font-bold ${STATUS_STYLE[r.status] ?? ''}`}>{r.status}</span>
                    ) : (
                      <span className="text-white/30">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10.5px] text-white/30">
          ผลตอบแทนกลุ่มถ่วง market cap โดยประมาณจำนวนหุ้นจาก market cap ปัจจุบัน ÷ ราคาปัจจุบัน (ไม่ใช่จำนวนหุ้นย้อนหลังจริง) · 1W/1M/3M = 5/21/63 วันทำการ
        </p>
      </section>
    </div>
  );
}
