'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { sectorToSlug } from '@/lib/sectorData';
import { heatColor, heatTextColor } from '@/lib/heatColor';
import { formatPct } from '@/lib/sectorChange';
import {
  flowChg, flowRows, flowValue, parseFlowWindow, parseSortDir, parseSortKey, rowName, sectorLinkFromFlow, strengthRows,
  MIN_AVG_VALUE_MB, STATUSES, type FlowRow, type FlowWindow, type SortKey,
} from '@/lib/sectorFlow';
import {
  baseValue, flowSummary, fmtNetBaht, netFlowMb, netLabel, netRows, statusBoxes, windowValue,
  NET_LABEL_PCT, NO_STATUS, type BoxKey, type NetLabel,
} from '@/lib/sectorFlowNet';

// "แบบใหม่" layout of /sector-flow (?layout=new). Same data, URL params and row links as the
// classic SectorFlowView (which is left untouched); type is one step larger than the classic
// view: body 15px · main numbers 16px · headings 20px (local to this component only).

// Same status colours as SectorFlowView's STATUS_STYLE (duplicated so the classic file stays untouched)
const STATUS_STYLE: Record<string, string> = {
  'แข็งต่อเนื่อง': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40',
  'เพิ่งเริ่มแข็ง': 'bg-sky-500/15 text-sky-400 border-sky-500/40',
  'เริ่มหมดแรง': 'bg-orange-500/15 text-orange-400 border-orange-500/40',
  'อ่อนต่อเนื่อง': 'bg-rose-500/15 text-rose-400 border-rose-500/40',
};
const BOX_STYLE: Record<BoxKey, { head: string; frame: string; hint: string }> = {
  'เพิ่งเริ่มแข็ง': { head: 'text-sky-400', frame: 'border-sky-500/35 bg-sky-500/[0.06]', hint: '3 เดือนยังตามหลัง แต่ 1 เดือนชนะ SET แล้ว' },
  'แข็งต่อเนื่อง': { head: 'text-emerald-400', frame: 'border-emerald-500/35 bg-emerald-500/[0.06]', hint: '3 เดือนและ 1 เดือนชนะ SET' },
  'เริ่มหมดแรง': { head: 'text-orange-400', frame: 'border-orange-500/35 bg-orange-500/[0.06]', hint: '3 เดือนชนะ แต่ 1 เดือนตามหลัง SET' },
  'อ่อนต่อเนื่อง': { head: 'text-rose-400', frame: 'border-rose-500/35 bg-rose-500/[0.06]', hint: 'ทั้งสองช่วงตามหลัง SET' },
  [NO_STATUS]: { head: 'text-white/50', frame: 'border-white/10 bg-white/[0.03]', hint: 'ข้อมูลไม่พอคำนวณสถานะ' },
};
const LABEL_STYLE: Record<Exclude<NetLabel, null>, string> = {
  'ไล่ซื้อ': 'text-emerald-400',
  'เทขาย': 'text-orange-400',
  'เลิกสนใจ': 'text-white/45',
};
const IN_COLOR = '#22A45D';
const OUT_COLOR = '#E24B4A';

// million-baht value for the row tooltip: "33.5 พันล้านบาท" / "569 ล้านบาท"
const fmtMbBaht = (v: number | null | undefined) =>
  v == null ? '—' : v >= 1000 ? `${(v / 1000).toFixed(1)} พันล้านบาท` : `${v.toFixed(v < 10 ? 1 : 0)} ล้านบาท`;

function PctText({ pct }: { pct: number | null }) {
  const c = heatTextColor(pct);
  if (pct == null || c == null) return <span className="text-white/30">—</span>;
  return <span className="font-mono font-bold" style={{ color: c }}>{formatPct(pct)}</span>;
}

// Excess-return cell colour: the ±3% heat scale stretched to ±5% (same as the classic table)
const excessColor = (v: number | null) => heatColor(v == null ? null : (v * 3) / 5);

const NAME_JOIN = ', ';

export default function SectorFlowNewView({ subsectors, sectors, marketBenchmark = false }: { subsectors: FlowRow[]; sectors: FlowRow[]; marketBenchmark?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [showHelp, setShowHelp] = useState(false);

  const win: FlowWindow = parseFlowWindow(sp.get('flow'));
  const showAll = sp.get('all') === '1';
  const tab = sp.get('tab') === 'sector' ? 'sector' : 'subsector';
  const asTable = sp.get('view') === 'table';
  const sortKey = parseSortKey(sp.get('sort'));
  const sortDir = parseSortDir(sp.get('dir'));
  // Same row links as the classic view: from=flow + back=<this page's query incl. layout> (+ sub=<subsector>)
  const rowHref = (sector: string, subsector?: string | null) =>
    sectorLinkFromFlow(sectorToSlug(sector), subsector, sp.toString());

  const setParams = (upd: Record<string, string | null>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(upd)) {
      if (v == null) p.delete(k);
      else p.set(k, v);
    }
    const q = p.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  };

  const summary = useMemo(() => flowSummary(subsectors, win), [subsectors, win]);
  const list = useMemo(() => netRows(subsectors, win, showAll), [subsectors, win, showAll]);
  const hiddenCount = subsectors.length - flowRows(subsectors, win, false).length;
  const maxAbs = useMemo(() => Math.max(1, ...list.map(r => Math.abs(netFlowMb(r, win) ?? 0))), [list, win]);
  const strengthSrc = tab === 'sector' ? sectors : subsectors;
  const boxes = useMemo(() => statusBoxes(strengthSrc), [strengthSrc]);
  const strengthList = useMemo(() => strengthRows(strengthSrc, sortKey, sortDir), [strengthSrc, sortKey, sortDir]);

  const clickSort = (key: SortKey) => {
    if (sortKey === key) setParams({ sort: key, dir: sortDir === 'desc' ? 'asc' : 'desc' });
    else setParams({ sort: key, dir: key === 'name' ? 'asc' : 'desc' });
  };

  const seg = (active: boolean) =>
    `px-3.5 py-1.5 rounded-lg text-[13px] font-bold transition-all ${active ? 'bg-white text-black shadow-sm' : 'text-white/50 hover:text-white'}`;

  const th = (k: SortKey, label: string, align: 'text-left' | 'text-right' | 'text-center' = 'text-right') => (
    <th className={`px-3 py-2.5 font-semibold ${align}`}>
      <button onClick={() => clickSort(k)} className="inline-flex items-center gap-1 hover:text-white transition-colors">
        {label}
        {sortKey === k && (sortDir === 'desc' ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
      </button>
    </th>
  );

  const winWord = win === '1d' ? 'วันนี้' : '5 วันนี้';

  return (
    <div className="space-y-5" data-testid="flow-new-layout">
      {/* Top-line summary */}
      <section className="bg-[#13161e] border border-white/[0.08] rounded-2xl p-5 space-y-1.5" data-testid="flow-summary">
        <p className="text-[20px] font-extrabold text-white leading-snug">
          {winWord}เงินเข้า{' '}
          <span className="text-emerald-400">{summary.inflow.length ? summary.inflow.join(NAME_JOIN) : '—'}</span>
        </p>
        <p className="text-[20px] font-extrabold text-white leading-snug">
          เงินออกจาก{' '}
          <span className="text-rose-400">{summary.outflow.length ? summary.outflow.join(NAME_JOIN) : '—'}</span>
        </p>
        <p className="text-[13px] text-white/35">3 กลุ่มที่เงินเข้า / ออกมากที่สุด · ไม่นับกลุ่มที่ซื้อขายเฉลี่ย &lt; {MIN_AVG_VALUE_MB} ล้านบาท/วัน</p>
      </section>

      {/* How to read: 2 lines + full text behind a toggle */}
      <section className="bg-[#13161e] border border-white/[0.08] rounded-2xl p-4 text-[15px] text-white/60 leading-relaxed space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p><span className="font-bold text-white/85">เงินเข้า/ออก</span> = เงินที่ไหลเข้ากลุ่มมากกว่า (หรือน้อยกว่า) สัดส่วนปกติของกลุ่มในตลาด เป็นล้านบาทต่อวัน</p>
            <p><span className="font-bold text-white/85">สถานะ</span> = ผลตอบแทนเทียบ SET ช่วง 3 เดือน (ระดับ) กับ 1 เดือน (ทิศทาง)</p>
          </div>
          <button
            onClick={() => setShowHelp(v => !v)}
            aria-expanded={showHelp}
            className="shrink-0 px-3 py-1 rounded-lg border border-white/10 bg-white/[0.04] text-[13px] text-white/60 hover:text-white"
          >
            {showHelp ? 'ซ่อนวิธีอ่าน' : 'วิธีอ่าน'}
          </button>
        </div>
        {showHelp && (
          <div className="pt-2 border-t border-white/[0.06] space-y-1.5" data-testid="flow-help">
            <p>
              <span className="font-bold text-white/85">เงินเข้า/ออก (บาท)</span> — มูลค่าซื้อขายของกลุ่ม × (1 − 1/×เท่า) โดย ×เท่า = สัดส่วนมูลค่าซื้อขายของกลุ่มในตลาดทั้งหมด เทียบกับสัดส่วนปกติของ 20 วันทำการก่อนหน้า
              · บวก = กลุ่มได้ส่วนแบ่งเงินในตลาดมากกว่าปกติ · ลบ = น้อยกว่าปกติ · รวมทุกกลุ่มแล้วใกล้ 0 (เงินย้ายจากกลุ่มหนึ่งไปอีกกลุ่ม)
              · &quot;5 วัน&quot; ใช้ค่าเฉลี่ยรายวันของ 5 วันล่าสุดเทียบกับ 20 วันก่อนหน้านั้น
            </p>
            <p>
              <span className="font-bold text-white/85">ป้าย</span> — <span className="text-emerald-400 font-bold">ไล่ซื้อ</span> = เงินเข้า ≥ {NET_LABEL_PCT}% ของมูลค่าปกติและราคากลุ่มขึ้น ·
              <span className="text-orange-400 font-bold"> เทขาย</span> = เงินเข้า ≥ {NET_LABEL_PCT}% แต่ราคากลุ่มลง ·
              <span className="text-white/60 font-bold"> เลิกสนใจ</span> = เงินออก ≥ {NET_LABEL_PCT}% ของมูลค่าปกติ
            </p>
            <p>
              <span className="font-bold text-white/85">สถานะความแข็ง</span> — ดูผลตอบแทนส่วนเกินเทียบ SET (ถ่วง market cap):
              <span className="text-emerald-400 font-bold"> แข็งต่อเนื่อง</span> = 3 เดือนและ 1 เดือนชนะ SET ·
              <span className="text-sky-400 font-bold"> เพิ่งเริ่มแข็ง</span> = 3 เดือนยังตามหลัง แต่ 1 เดือนชนะแล้ว ·
              <span className="text-orange-400 font-bold"> เริ่มหมดแรง</span> = 3 เดือนชนะ แต่ 1 เดือนตามหลัง ·
              <span className="text-rose-400 font-bold"> อ่อนต่อเนื่อง</span> = ทั้งสองช่วงตามหลัง SET
            </p>
          </div>
        )}
      </section>

      {/* Section 1: net money in / out */}
      <section className="bg-[#13161e] border border-white/[0.08] rounded-2xl p-4 space-y-3" data-testid="flow-section">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[20px] font-extrabold text-white">เงินไหลเข้า-ออก</h2>
          <div className="flex gap-1 bg-white/[0.04] p-1 rounded-xl border border-white/[0.08]">
            <button className={seg(win === '1d')} onClick={() => setParams({ flow: null })}>วันนี้</button>
            <button className={seg(win === '5d')} onClick={() => setParams({ flow: '5d' })}>5 วัน</button>
          </div>
        </div>

        <div className="hidden md:grid md:grid-cols-[minmax(180px,1.1fr)_2fr_130px_84px_90px] gap-3 px-2 text-[13px] text-white/35">
          <span>กลุ่มย่อย</span>
          <span className="flex justify-between"><span>← เงินออก</span><span>เงินเข้า →</span></span>
          <span className="text-right">ล้านบาท/วัน</span>
          <span className="text-right">ราคากลุ่ม</span>
          <span>ความหมาย</span>
        </div>

        <div className="space-y-1">
          {list.map(r => {
            const net = netFlowMb(r, win);
            const f = flowValue(r, win);
            const chg = flowChg(r, win);
            const label = netLabel(r, win);
            const pct = net == null ? 0 : (Math.abs(net) / maxAbs) * 50;
            const tip = `×${f == null ? '—' : f.toFixed(2)} · มูลค่า${win === '1d' ? 'วันนี้' : 'เฉลี่ย 5 วัน'} ${fmtMbBaht(windowValue(r, win))} · ปกติ ${fmtMbBaht(baseValue(r, win))}`;
            return (
              <div
                key={`${r.sector}/${r.subsector}`}
                title={tip}
                className="grid grid-cols-2 md:grid-cols-[minmax(180px,1.1fr)_2fr_130px_84px_90px] gap-x-3 gap-y-1 items-center px-2 py-1.5 rounded-lg hover:bg-white/[0.03]"
                data-testid="net-row"
              >
                <Link href={rowHref(r.sector, r.subsector)} className="min-w-0 col-span-2 md:col-span-1">
                  <p className="text-[15px] font-bold text-white truncate">{r.subsector}</p>
                  <p className="text-[12px] text-white/35 truncate">{r.sector}</p>
                </Link>
                <div className="relative h-5 bg-white/[0.04] rounded col-span-2 md:col-span-1" aria-hidden>
                  <div className="absolute inset-y-[-2px] left-1/2 w-px bg-white/60" />
                  {net != null && net !== 0 && (
                    <div
                      className="absolute inset-y-0 rounded"
                      style={{
                        width: `${pct}%`,
                        background: net > 0 ? IN_COLOR : OUT_COLOR,
                        ...(net > 0 ? { left: '50%' } : { right: '50%' }),
                      }}
                    />
                  )}
                </div>
                <span className="text-right font-mono font-extrabold text-[16px]" style={{ color: net == null ? undefined : net >= 0 ? '#2ECC71' : '#F23645' }}>
                  {fmtNetBaht(net)}
                </span>
                <span className="text-right text-[15px]"><PctText pct={chg} /></span>
                <span className={`text-[15px] font-semibold ${label ? LABEL_STYLE[label] : ''}`}>{label ?? ''}</span>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between text-[13px] text-white/40 pt-1 border-t border-white/[0.05]">
          <span>
            แสดง {list.length} กลุ่ม
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
            <h2 className="text-[20px] font-extrabold text-white">กลุ่มไหนกำลังแข็งขึ้น / หมดแรง</h2>
            <p className="text-[13px] text-white/40 mt-0.5">
              {asTable ? 'ผลตอบแทนส่วนเกินเทียบ SET (จุด %) · คลิกหัวคอลัมน์เพื่อเรียง · คลิกแถวเพื่อดู sector' : 'ในแต่ละกล่องเรียงตามส่วนเกิน 1 เดือน (ตัวเลขข้างชื่อ) · คลิกชื่อเพื่อดู sector'}
            </p>
            {marketBenchmark && (
              <p className="text-[13px] text-amber-400/80 mt-0.5" data-testid="benchmark-note">เทียบกับค่าเฉลี่ยทั้งตลาด (ข้อมูลดัชนี SET ไม่อัปเดต)</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 bg-white/[0.04] p-1 rounded-xl border border-white/[0.08]">
              <button className={seg(tab === 'subsector')} onClick={() => setParams({ tab: null })}>Subsector</button>
              <button className={seg(tab === 'sector')} onClick={() => setParams({ tab: 'sector' })}>Sector</button>
            </div>
            <button
              onClick={() => setParams({ view: asTable ? null : 'table' })}
              className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.04] text-[13px] font-semibold text-white/60 hover:text-white"
            >
              {asTable ? 'ดูแบบกล่อง' : 'ดูตัวเลข'}
            </button>
          </div>
        </div>

        {!asTable ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3" data-testid="status-boxes">
            {([...STATUSES, ...(boxes[NO_STATUS].length ? [NO_STATUS] : [])] as BoxKey[]).map(k => (
              <div key={k} className={`rounded-xl border p-3 space-y-2 ${BOX_STYLE[k].frame}`} data-testid="status-box" data-status={k}>
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className={`text-[16px] font-extrabold ${BOX_STYLE[k].head}`}>{k} <span className="text-white/40 font-semibold">({boxes[k].length})</span></h3>
                  <span className="text-[12px] text-white/35">{BOX_STYLE[k].hint}</span>
                </div>
                {boxes[k].length === 0 ? (
                  <p className="text-[13px] text-white/30">—</p>
                ) : (
                  <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
                    {boxes[k].map(r => (
                      <li key={`${r.sector}/${r.subsector ?? ''}`} className="text-[15px]">
                        <Link href={rowHref(r.sector, r.subsector)} className="font-bold text-white hover:underline">{rowName(r)}</Link>
                        <span className="ml-1.5 text-[12px] font-mono" style={{ color: heatTextColor(r.excess_1m) ?? 'rgba(255,255,255,0.35)' }}>
                          {r.excess_1m == null ? '—' : formatPct(r.excess_1m)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[15px]">
              <thead>
                <tr className="text-[13px] text-white/40 border-b border-white/[0.06]">
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
                    onClick={() => router.push(rowHref(r.sector, r.subsector))}
                    className="border-b border-white/[0.04] hover:bg-white/[0.04] cursor-pointer"
                  >
                    <td className="px-3 py-2">
                      <Link href={rowHref(r.sector, r.subsector)} onClick={e => e.stopPropagation()} className="font-bold text-white hover:underline">{rowName(r)}</Link>
                      {r.subsector && <span className="ml-2 text-[12px] text-white/35">{r.sector}</span>}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-white/50">{r.n}</td>
                    {([r.excess_1w, r.excess_1m, r.excess_3m] as (number | null)[]).map((v, i) => (
                      <td key={i} className="px-1 py-1">
                        <div className="rounded text-center py-1.5 font-mono font-bold text-[16px] text-white" style={{ background: excessColor(v), textShadow: '0 1px 2px rgba(0,0,0,0.55)', opacity: v == null ? 0.5 : 1 }}>
                          {v == null ? '—' : formatPct(v)}
                        </div>
                      </td>
                    ))}
                    <td className="px-3 py-2 text-center">
                      {r.status ? (
                        <span className={`inline-block px-2.5 py-0.5 rounded-full border text-[13px] font-bold ${STATUS_STYLE[r.status] ?? ''}`}>{r.status}</span>
                      ) : (
                        <span className="text-white/30">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[12px] text-white/30">
          ผลตอบแทนกลุ่มถ่วง market cap โดยประมาณจำนวนหุ้นจาก market cap ปัจจุบัน ÷ ราคาปัจจุบัน (ไม่ใช่จำนวนหุ้นย้อนหลังจริง) · 1W/1M/3M = 5/21/63 วันทำการ
        </p>
      </section>
    </div>
  );
}
