'use client';

// Capital rows of /calendar (XR / XW / หุ้นใหม่เข้า / บอร์ดอนุมัติ) — layout of mock calendar-capital-v3:
// head (date · ticker · chip · 2-line summary) + 3 boxes (ตัวเลขสำคัญ · วันสำคัญ · ตัวอย่างถือ 10,000 หุ้น) + meaning + links.
// Numbers: lib/capitalCalc.ts with the latest scan close; facts: /api/corporate-action + /data/capital_events.json.

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import {
  fmtDay, fmtDayRange, fmtMillion, fmtPct, fmtPrice, fmtPriceShort, lastCumDate, lastCumNote, listingCalc, niceNum, parseRatio, pickSummary,
  rightsExample, xrCalc, xwCalc, SOURCE_LABEL,
  type CapitalEvent, type CapitalResult, type XrCalc,
} from '@/lib/capitalCalc';

const SKY = '#7dd3fc'; // current price
const AMBER = '#f59e0b';
const RED_SOFT = '#fca5a5';

export interface CapitalRowInput {
  kind: 'XR' | 'XW' | 'NEW' | 'BOARD';
  ticker: string;
  date: string;               // xdate / first trade day / announce day
  today: string;
  afterClose?: boolean;       // Bangkok time is past 16:30 (market closed)
  close: number | null;       // latest scan close
  priceDate: string | null;   // day of that close (combined.json generated_at)
  halted: boolean;            // SP / H mark → no price numbers
  warn: boolean;
  detail?: string;            // route's plain text, used when the ratio cannot be read
  ratio?: string | null;
  exercise?: number | null;
  allotShare?: number | null;
  recordDate?: string | null;
  subBegin?: string | null;
  subEnd?: string | null;
  withWarrant?: { ratio: string | null; allotShare: number | null } | null; // XR with a same-day XW
  withRights?: boolean;       // XW that comes with a same-day XR
  listingDate?: string | null; // first trade day of the new shares, when SET announced it
  result?: CapitalResult | null;
  capital?: CapitalEvent;
}

interface Shell { dateLabel: string; dayBadge: ReactNode }
interface RowProps { r: CapitalRowInput; open: boolean; toggle: () => void; shell: Shell }

const CHIP: Record<CapitalRowInput['kind'], string> = {
  XR: 'bg-[#2e1065] text-[#c4b5fd] border-[#4c1d95]',
  XW: 'bg-[#3f2a06] text-[#fcd34d] border-[#78350f]',
  NEW: 'bg-[#3b0764] text-[#f0abfc] border-[#86198f]',
  BOARD: 'bg-white/[0.06] text-white/60 border-white/15',
};

function Chip({ r }: { r: CapitalRowInput }) {
  const label = r.kind === 'NEW' ? (r.capital?.source_type ? `${r.capital.source_type} เข้า` : 'หุ้นใหม่เข้า') : r.kind === 'BOARD' ? 'ประกาศแล้ว' : r.kind;
  return (
    <span className={`inline-flex items-center gap-1 text-[13px] font-bold px-2.5 py-px rounded-md border whitespace-nowrap ${CHIP[r.kind]}`}>
      {r.warn && <AlertTriangle size={13} className="flex-shrink-0" />}
      {label}
    </span>
  );
}

function F({ l, h, children }: { l: string; h?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[13px] text-white/45">{l}</div>
      <div className="text-[17px] font-bold text-white/90 leading-snug">{children}</div>
      {h != null && h !== '' && <div className="text-[12.5px] text-white/50 leading-snug">{h}</div>}
    </div>
  );
}

function Box({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-[#10131b] border border-white/[0.08] rounded-[10px] px-4 py-3">
      <h3 className="text-[13px] font-semibold text-white/55 mb-2">{title}</h3>
      {children}
    </div>
  );
}

function SplitBar({ oldPct, newLabel, color = '#a78bfa' }: { oldPct: number; newLabel: string; color?: string }) {
  const o = Math.max(0, Math.min(100, oldPct));
  return (
    <div className="mt-3">
      <div className="flex h-3 rounded overflow-hidden bg-white/[0.08]">
        <div style={{ width: `${o}%`, background: '#4b5563' }} />
        <div style={{ width: `${100 - o}%`, background: color }} />
      </div>
      <div className="flex justify-between gap-2 text-[13px] text-white/50 mt-1">
        <span>หุ้นเดิม {trimPct(o)}</span><span>{newLabel} {trimPct(100 - o)}</span>
      </div>
    </div>
  );
}

const trimPct = (v: number) => `${v.toFixed(1).replace(/\.0$/, '')}%`;
const baht = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v).toLocaleString('en-US')} บาท`);
const mb = (v: number | null | undefined) => (v == null ? '—' : `${(v / 1e6).toLocaleString('en-US', { maximumFractionDigits: 1 })} ลบ.`);
const priceDay = (r: CapitalRowInput) => (r.priceDate ? `ราคาปิด ${fmtDay(r.priceDate, r.today)}` : 'ราคาปิดล่าสุด');
const rightsUrl = (t: string) => `https://www.set.or.th/th/market/product/stock/quote/${t}/rights-benefits`;

function Sky({ r }: { r: CapitalRowInput }) {
  if (r.halted) return <span className="text-white/55">งดซื้อขาย</span>;
  if (r.close == null) return <span className="text-white/45">ไม่มีราคา</span>;
  return <span style={{ color: SKY }}>{fmtPriceShort(r.close)}</span>;
}

function vsText(disc: number | null): string {
  if (disc == null) return '';
  if (Math.abs(disc) < 0.5) return 'ใกล้เคียงตลาด';
  return disc > 0 ? `ถูกกว่าตลาด ${disc.toFixed(1)}%` : `แพงกว่าตลาด ${(-disc).toFixed(1)}%`;
}

// ─── timeline ───
interface TlItem { from?: string | null; to?: string | null; text: string; note?: string | null }

function Timeline({ items, today }: { items: TlItem[]; today: string }) {
  return (
    <ul className="m-0 p-0 list-none">
      {items.map((it, i) => {
        const pending = !it.from;
        const end = it.to ?? it.from ?? '';
        const past = !pending && end < today;
        const now = !pending && (it.from as string) <= today && today <= end;
        const label = pending ? 'รอประกาศ'
          : it.to && it.to !== it.from ? fmtDayRange(it.from as string, it.to, today) : fmtDay(it.from, today);
        return (
          <li key={i} className={`grid grid-cols-[112px_1fr] gap-2.5 py-1.5 text-[14px] border-t border-dashed border-white/10 first:border-t-0 ${past ? 'opacity-40' : ''}`}>
            <span className={`font-semibold ${now ? '' : pending ? 'text-white/50' : ''}`} style={now ? { color: RED_SOFT } : undefined}>
              {label}{now && (!it.to || it.to === it.from) ? ' (วันนี้)' : now ? ' (ตอนนี้)' : ''}
            </span>
            <span className="text-white/80">{it.text}{it.note && <span className="text-[12px] text-white/40"> {it.note}</span>}</span>
          </li>
        );
      })}
    </ul>
  );
}

// ─── meaning sentence (⚠ = amber frame) ───
function xrMeaning(c: XrCalc, takeUp: number | null): string {
  const parts: string[] = [];
  if (c.pctNew >= 100) {
    const times = Math.round((1 + c.pctNew / 100) * 10) / 10;
    parts.push(`หุ้นรวมจะเป็น ${niceNum(times)} เท่าของเดิม ถ้าจองเต็ม · ช่วงหุ้นใหม่เข้าตลาดอาจมีแรงขายหนัก`);
  } else {
    parts.push(`ถ้าไม่จอง สัดส่วนถือ/กำไรต่อหุ้นเหลือ ${c.holdingIfSkip.toFixed(1)}%`);
  }
  const d = c.discountPct;
  if (d != null) {
    if (Math.abs(d) < 0.5) parts.push('ราคาใช้สิทธิเท่าราคาปิด → สิทธิแทบไม่มีมูลค่า ราคาไม่ต้องปรับลงวัน XR');
    else if (d < 0) parts.push('ราคาใช้สิทธิแพงกว่าราคาปิด → ซื้อในตลาดถูกกว่าใช้สิทธิ');
    else if (d < 10) parts.push(`ราคาใช้สิทธิถูกกว่าตลาดแค่ ${d.toFixed(0)}% ส่วนต่างให้คนจองไม่มาก`);
    else parts.push(`ราคาใช้สิทธิถูกกว่าตลาด ${d.toFixed(0)}% คนจองได้ส่วนลดพอสมควร`);
  }
  if (takeUp != null) parts.push(`ผลจองจริง ${takeUp.toFixed(1)}%`);
  return parts.join(' · ');
}

function Meaning({ warn, children }: { warn: boolean; children: ReactNode }) {
  return (
    <div className={`mt-3 text-[15px] px-3.5 py-2.5 rounded-lg ${warn ? 'bg-[#1c1508] border border-[#5b3d0a] text-[#fde68a]' : 'bg-white/[0.05] text-white/80'}`}>
      {warn ? '⚠ ' : ''}หมายความว่า: {children}
    </div>
  );
}

function Links({ r, set }: { r: CapitalRowInput; set?: string | null }) {
  const cls = 'underline decoration-dotted hover:text-white/85';
  return (
    <div className="mt-2 text-[13px] text-white/50 flex flex-wrap gap-x-4 gap-y-1">
      {set !== null && <a href={set ?? rightsUrl(r.ticker)} target="_blank" rel="noopener noreferrer" className={cls}>ประกาศ SET ↗</a>}
      <Link href={`/stock/${r.ticker}`} className={cls}>หน้า /stock/{r.ticker}</Link>
    </div>
  );
}

function Toggle({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="mt-2 text-[13px] text-white/50 hover:text-white/80 text-left">
      {open ? '▴ ย่อรายละเอียด' : '▾ ดูรายละเอียด (ตัวเลข · วันสำคัญ · ตัวอย่าง 10,000 หุ้น)'}
    </button>
  );
}

const Sep = () => <span className="text-white/30"> · </span>;
function Joined({ items }: { items: ReactNode[] }) {
  return <>{items.map((x, i) => <span key={i}>{i > 0 && <Sep />}{x}</span>)}</>;
}

// ─── XR ───
function xrParts(r: CapitalRowInput) {
  const c = xrCalc({ ratio: r.ratio, exercise: r.exercise, close: r.close, allotShare: r.allotShare, upcoming: r.date >= r.today, halted: r.halted });
  const ratio = parseRatio(r.ratio);
  const lastCum = lastCumDate(r.date);
  return { c, ratio, lastCum };
}

function SummaryPoints({ r, c, lastCum, exampleText }: { r: CapitalRowInput; c: XrCalc | null; lastCum: string; exampleText: ReactNode }) {
  const pts = pickSummary({ lastCum, today: r.today, discountPct: c?.discountPct ?? null, pctNew: c?.pctNew ?? null });
  const items: ReactNode[] = pts.map(p => {
    if (p.kind === 'last_cum') {
      return (
        p.days === 0 && r.afterClose
          ? <span key="lc">วันสุดท้ายคือ<b style={{ color: RED_SOFT }}>วันนี้</b> (ตลาดปิดแล้ว)</span>
          : <span key="lc">ซื้อ<b style={{ color: p.urgent ? RED_SOFT : AMBER }}>{p.days === 0 ? 'วันนี้' : 'พรุ่งนี้'} ({fmtDay(lastCum, r.today)})</b> เป็นวันสุดท้ายที่ได้สิทธิ</span>
      );
    }
    if (p.kind === 'expensive') {
      return (
        <span key="ex">ราคาใช้สิทธิ<b style={{ color: RED_SOFT }}>แพงกว่า</b>ราคาปิด ({fmtPrice(r.exercise)} vs <span style={{ color: SKY }}>{fmtPriceShort(r.close)}</span>) → ซื้อในตลาดถูกกว่าใช้สิทธิ</span>
      );
    }
    if (p.kind === 'bigger') return <span key="bg">หุ้นใหม่มากกว่าหุ้นเดิม {niceNum(Math.round((c!.pctNew / 100) * 10) / 10)} เท่า</span>;
    return <span key="eg">{exampleText}</span>;
  });
  return <div className="text-[14px] text-white/60 mt-0.5"><Joined items={items} /></div>;
}

function XrRow({ r, open, toggle, shell }: RowProps) {
  const { c, ratio, lastCum } = xrParts(r);
  const ex = rightsExample({ ratio: r.ratio, exercise: r.exercise });
  const total = c?.oldShares != null && c.newSharesMax != null ? c.oldShares + c.newSharesMax : null;
  const takeUp = r.result?.take_up_pct ?? null;
  const w = r.withWarrant ? parseRatio(r.withWarrant.ratio) : null;

  const line1 = ratio ? (
    <>
      เพิ่มทุนขายผู้ถือหุ้นเดิม (RO/PPO) · <b className="text-white">ถือ {niceNum(ratio.old)} หุ้น ได้สิทธิซื้อหุ้นใหม่ {niceNum(ratio.new)} หุ้น</b>
      {r.exercise != null && <> ราคา <b className="text-white">{fmtPrice(r.exercise)}</b> บาท</>}
      {!open && c && <> · หุ้นเพิ่มสูงสุด <b className="text-white" style={c.warn ? { color: AMBER } : undefined}>{fmtPct(c.pctNew)}</b></>}
    </>
  ) : <>{r.detail}</>;

  const summary = (
    <div className="text-[15px] text-white/85">
      {line1}
      <SummaryPoints r={r} c={c} lastCum={lastCum} exampleText={ex ? <>ถือ 10,000 หุ้น ได้สิทธิ {ex.rights.toLocaleString('en-US')} หุ้น ใช้เงิน {baht(ex.money)}</> : null} />
    </div>
  );

  const body = c && (
    <div className="mt-3 grid grid-cols-1 xl:grid-cols-[1.1fr_1fr] gap-3.5 2xl:ml-[330px]">
      <Box title="ตัวเลขสำคัญ">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-5 gap-y-3">
          <F l="หุ้นเพิ่มสูงสุด" h={c.oldShares != null && total != null ? `${fmtMillion(c.oldShares).replace(' ล้าน', '')} → ${fmtMillion(total)}หุ้น` : 'ไม่มีจำนวนหุ้นจาก Settrade'}>
            <span style={c.warn ? { color: AMBER } : undefined}>{fmtPct(c.pctNew)}</span>
          </F>
          <F l="ราคาใช้สิทธิ vs ราคาปิด" h={[vsText(c.discountPct), priceDay(r)].filter(Boolean).join(' · ')}>
            {fmtPrice(r.exercise)} <span className="font-normal text-white/50">vs</span> <Sky r={r} />
          </F>
          <F l="ราคาหลัง XR ตามทฤษฎี" h={c.terpChgPct == null ? 'ไม่มีราคาปิด' : Math.abs(c.terpChgPct) < 0.05 ? 'ไม่ปรับ' : `${c.terpChgPct < 0 ? 'ต่ำกว่า' : 'สูงกว่า'}ราคาปิด ${Math.abs(c.terpChgPct).toFixed(1)}%`}>
            {c.terp != null ? fmtPriceShort(c.terp) : '—'}
          </F>
          <F l="ถ้าไม่จอง สัดส่วนเหลือ" h="กำไรต่อหุ้นก็เหลือเท่านี้ (ถ้ากำไรเท่าเดิม)">{c.holdingIfSkip.toFixed(1)}%</F>
          <F l="เงินที่บริษัทได้ (ถ้าจองเต็ม)" h={r.result ? `จองจริง ${r.result.take_up_pct.toFixed(1)}% · ได้ ${mb(r.result.sold * (r.exercise ?? 0))}` : 'ผลจองจริงจะขึ้นเมื่อบริษัทแจ้ง'}>
            {mb(c.moneyMax)}
          </F>
          <F l="พ่วง Warrant" h={r.withWarrant ? 'ดูแถว XW ของหุ้นนี้' : undefined}>
            <span className="text-[15px]">{r.withWarrant ? (w ? `ถือ ${niceNum(w.old)} ได้ W ${niceNum(w.new)}` : 'มี') : 'ไม่มี'}</span>
          </F>
        </div>
        <SplitBar oldPct={c.holdingIfSkip} newLabel="หุ้นใหม่" />
        <p className="text-[12.5px] text-white/40 mt-1">
          {c.oldShares == null ? 'ไม่มีจำนวนหุ้นจาก Settrade · ' : 'หุ้นเดิม = จำนวนหุ้นใหม่สูงสุด × อัตราส่วน · '}ราคาหลัง XR = (ราคาปิด × เดิม + ราคาใช้สิทธิ × ใหม่) ÷ รวม
        </p>
      </Box>
      <div className="grid gap-3.5 content-start">
        <Box title="วันสำคัญ">
          <Timeline today={r.today} items={[
            { from: lastCum, text: 'วันสุดท้ายที่ซื้อแล้วได้สิทธิ', note: lastCumNote(r.date) },
            { from: r.date, text: 'XR · ซื้อวันนี้ไม่ได้สิทธิแล้ว ราคามักปรับลง' },
            { from: r.recordDate, text: 'ปิดสมุดทะเบียน (record date)' },
            { from: r.subBegin, to: r.subEnd, text: 'ช่วงจองซื้อและชำระเงิน' },
            { from: r.listingDate, text: 'หุ้นใหม่เข้าตลาด' },
          ]} />
        </Box>
        <Box title="ตัวอย่าง: ถ้าถือ 10,000 หุ้น">
          {ex && (
            <table className="w-full text-[14px] border-collapse">
              <tbody>
                {[
                  ['ได้สิทธิจองซื้อ', `${ex.rights.toLocaleString('en-US')} หุ้น`],
                  ['ใช้เงินจอง', baht(ex.money)],
                  ['ถ้าจองครบ → ถือรวม', `${ex.totalIfAll.toLocaleString('en-US')} หุ้น`],
                  ['ถ้าไม่จอง → สัดส่วนในบริษัท', `เหลือ ${trimPct(ex.holdingIfSkip)}`],
                  ...(takeUp != null ? [['ผลจองจริงของทั้งหมด', `${takeUp.toFixed(1)}%`]] : []),
                ].map(([k, v]) => (
                  <tr key={k} className="border-t border-dashed border-white/10 first:border-t-0">
                    <td className="py-1 pr-3 text-white/70">{k}</td><td className="py-1 text-right font-semibold">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Box>
      </div>
    </div>
  );

  return (
    <>
      <RowShell r={r} shell={shell} summary={summary} />
      <Toggle open={open} onClick={toggle} />
      {open && body}
      {open && c && <Meaning warn={r.warn}>{xrMeaning(c, takeUp)}</Meaning>}
      {open && <Links r={r} />}
    </>
  );
}

// ─── XW ───
function XwRow({ r, open, toggle, shell }: RowProps) {
  const x = xwCalc(r.ratio);
  const ratio = parseRatio(r.ratio);
  const lastCum = lastCumDate(r.date);
  const ex = rightsExample({ ratio: r.ratio });
  const link = <a href={rightsUrl(r.ticker)} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted text-white/60 hover:text-white/90 font-normal text-[15px]">ดูประกาศ ↗</a>;

  const line1 = x && ratio ? (
    <>
      แจก Warrant · <b className="text-white">ถือ {niceNum(ratio.old)} หุ้น ได้ W ฟรี {niceNum(ratio.new)} หน่วย</b>
      {!open && <> · หุ้นเพิ่มสูงสุดถ้าแปลงหมด <b className="text-white">{fmtPct(x.pctNewMax)}</b></>}
    </>
  ) : <>แจก Warrant · อัตราส่วน {r.ratio ?? '—'} <span className="text-white/50">(ไม่ใช่ หุ้นเดิม : W คำนวณหุ้นเพิ่มไม่ได้)</span></>;

  const summary = (
    <div className="text-[15px] text-white/85">
      {line1}
      <SummaryPoints r={r} c={null} lastCum={lastCum}
        exampleText={x && ex ? <>ถือ 10,000 หุ้น ได้ W {ex.rights.toLocaleString('en-US')} หน่วย (ไม่มีเงินจอง)</> : <>ราคาแปลงและอายุ W ดูในประกาศ</>} />
    </div>
  );

  const body = (
    <div className="mt-3 grid grid-cols-1 xl:grid-cols-[1.1fr_1fr] gap-3.5 2xl:ml-[330px]">
      <Box title="ตัวเลขสำคัญ">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-5 gap-y-3">
          <F l="หุ้นเพิ่มสูงสุดถ้าแปลงหมด" h="ไม่เพิ่มหุ้นทันที">{x ? fmtPct(x.pctNewMax) : '—'}</F>
          <F l="จำนวน W ที่แจก" h="หน่วย">{r.allotShare ? fmtMillion(r.allotShare).replace(' ล้าน', ' ล้าน') : '—'}</F>
          <F l="ราคาแปลง">{link}</F>
          <F l="อายุ W">{link}</F>
          <F l="แจกพร้อมเพิ่มทุน RO" h={r.withRights ? 'ดูแถว XR ของหุ้นนี้' : undefined}><span className="text-[15px]">{r.withRights ? 'ใช่' : 'ไม่ใช่'}</span></F>
        </div>
        {x && <SplitBar oldPct={100 - x.newShareMax} newLabel="W" color={AMBER} />}
        <p className="text-[12.5px] text-white/40 mt-1">คิด W 1 หน่วย = 1 หุ้น · เงื่อนไขจริง (ราคาแปลง/อายุ) ดูในประกาศ</p>
      </Box>
      <div className="grid gap-3.5 content-start">
        <Box title="วันสำคัญ">
          <Timeline today={r.today} items={[
            { from: lastCum, text: 'วันสุดท้ายที่ซื้อแล้วได้ W', note: lastCumNote(r.date) },
            { from: r.date, text: 'XW · ซื้อวันนี้ไม่ได้ W แจกฟรีแล้ว' },
            { from: r.recordDate, text: 'ปิดสมุดทะเบียน (record date)' },
            ...(r.subBegin ? [{ from: r.subBegin, to: r.subEnd, text: 'ช่วงจอง/ใช้สิทธิ (ตาม Settrade)' }] : []),
            { from: null, text: 'W เริ่มซื้อขาย' },
          ]} />
        </Box>
        <Box title="ตัวอย่าง: ถ้าถือ 10,000 หุ้น">
          {x && ex ? (
            <table className="w-full text-[14px] border-collapse">
              <tbody>
                <tr><td className="py-1 pr-3 text-white/70">ได้ W ฟรี</td><td className="py-1 text-right font-semibold">{ex.rights.toLocaleString('en-US')} หน่วย</td></tr>
                <tr className="border-t border-dashed border-white/10"><td className="py-1 pr-3 text-white/70">ใช้เงินจอง</td><td className="py-1 text-right font-semibold">ไม่มี (แจกฟรี)</td></tr>
              </tbody>
            </table>
          ) : <p className="text-[14px] text-white/55">คำนวณไม่ได้ · ดูอัตราส่วนในประกาศ</p>}
        </Box>
      </div>
    </div>
  );

  return (
    <>
      <RowShell r={r} shell={shell} summary={summary} />
      <Toggle open={open} onClick={toggle} />
      {open && body}
      {open && x && <Meaning warn={false}>ไม่เพิ่มหุ้นทันที · หุ้นจะเพิ่มก็ต่อเมื่อมีคนแปลง W (คิด W 1 หน่วย = 1 หุ้น)</Meaning>}
      {open && <Links r={r} />}
    </>
  );
}

// ─── new shares ───
function NewRow({ r, open, toggle, shell }: RowProps) {
  const e = r.capital as CapitalEvent;
  const s = e.shares;
  const c = listingCalc({ old: s?.old, added: s?.new, price: e.price, close: r.close, halted: r.halted });
  const src = e.source_type ?? '';
  const take = e.result?.take_up_pct;
  const priceTxt = e.price != null ? fmtPrice(e.price) : (e.prices ?? []).map(p => fmtPrice(p.price)).join(' / ') || '—';
  const allot = e.allottees ?? [];

  const line2 = c?.discountPct != null && c.holderGainPct != null
    ? (c.warn
      ? <>ได้หุ้นถูกกว่าตลาด {c.discountPct.toFixed(1)}% ({priceTxt} vs <span style={{ color: SKY }}>{fmtPriceShort(r.close)}</span>) → ผู้ได้หุ้นกำไร <b style={{ color: AMBER }}>{fmtPct(c.holderGainPct)}</b> · ระวังแรงขาย</>
      : <>ราคาได้หุ้น {priceTxt} vs <span style={{ color: SKY }}>{fmtPriceShort(r.close)}</span> · {vsText(c.discountPct)} · ผู้ได้หุ้น{c.holderGainPct < 0 ? 'ขาดทุน' : 'กำไร'}อยู่ {fmtPct(c.holderGainPct)}</>)
    : r.halted ? <>หุ้นงดซื้อขาย ไม่คำนวณจากราคา</> : <>หุ้นเดิม {fmtMillion(s?.old).replace(' ล้าน', '')} → รวม {fmtMillion(s?.total ?? null)}หุ้น</>;

  const summary = (
    <div className="text-[15px] text-white/85">
      <span className="text-[#f0abfc]">หุ้นเพิ่มทุนเริ่มซื้อขาย</span> · ที่มา: {SOURCE_LABEL[src] ?? src}
      {s?.new ? <> · <b className="text-white">{fmtMillion(s.new)}หุ้น{e.price != null ? ` @ ${fmtPrice(e.price)} บาท` : ''}</b></> : null}
      {c && <> · เพิ่มขึ้น <b style={c.warn ? { color: AMBER } : { color: '#fff' }}>{fmtPct(c.pctNew)}</b></>}
      <div className="text-[14px] text-white/60 mt-0.5">{line2}</div>
    </div>
  );

  const body = (
    <div className="mt-3 2xl:ml-[330px]">
      <Box title="ตัวเลขสำคัญ">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-5 gap-y-3">
          <F l="หุ้นเดิม → รวม" h="ล้านหุ้น">{fmtMillion(s?.old).replace(' ล้าน', '')} → {fmtMillion(s?.total ?? null).replace(' ล้าน', '')}</F>
          <F l="เพิ่มขึ้น" h={c ? `ใหม่ ${trimPct(c.newShare)} ของหุ้นรวม` : undefined}>
            <span style={c?.warn ? { color: AMBER } : undefined}>{c ? fmtPct(c.pctNew) : '—'}</span>
          </F>
          <F l="ราคาได้หุ้น vs ราคาปิด" h={[vsText(c?.discountPct ?? null), priceDay(r)].filter(Boolean).join(' · ')}>
            {priceTxt} <span className="font-normal text-white/50">vs</span> <Sky r={r} />
          </F>
          {c?.holderGainPct != null && (
            <F l={c.holderGainPct < 0 ? 'ผู้ได้หุ้นขาดทุนอยู่' : 'ผู้ได้หุ้นกำไรอยู่'}>
              <span style={{ color: c.warn ? AMBER : c.holderGainPct < 0 ? RED_SOFT : undefined }}>{fmtPct(c.holderGainPct)}</span>
            </F>
          )}
          {src === 'RO' && take != null && <F l="จองจริง" h="ของที่เสนอขาย">{take.toFixed(1)}%</F>}
        </div>
        {c && <SplitBar oldPct={100 - c.newShare} newLabel={src === 'W' || src === 'CB' ? 'แปลง' : src || 'ใหม่'} color={c.warn ? '#f0abfc' : '#a78bfa'} />}
        {allot.length > 0 && (
          <p className="text-[13px] text-white/60 mt-2">
            จัดสรรให้ {allot.slice(0, 2).map(a => `${a.name} ${fmtMillion(a.shares)}หุ้น`).join(' + ')}{allot.length > 2 ? ` + อีก ${allot.length - 2} ราย` : ''}
          </p>
        )}
      </Box>
    </div>
  );

  return (
    <>
      <RowShell r={r} shell={shell} summary={summary} />
      <Toggle open={open} onClick={toggle} />
      {open && body}
      {open && c?.warn && <Meaning warn>ได้หุ้นถูกกว่าตลาดมาก และขายได้แล้ว → ระวังแรงขาย</Meaning>}
      {open && <Links r={r} set={e.origin?.link ?? null} />}
    </>
  );
}

function BoardRow({ r, shell }: { r: CapitalRowInput; shell: Shell }) {
  const e = r.capital as CapitalEvent;
  const tags = (e.tags ?? []).map(t => (t === 'W' ? 'Warrant' : t === 'CB' ? 'หุ้นกู้แปลงสภาพ' : t)).join(' + ');
  const summary = (
    <div className="text-[15px] text-white/85">
      ประกาศแล้ว · รอ EGM{tags ? ` · ${tags}` : ''}
      <div className="text-[14px] text-white/55 mt-0.5">
        {e.title}{' '}
        {e.origin?.link && <a href={e.origin.link} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted hover:text-white/85 whitespace-nowrap">ประกาศ SET ↗</a>}
      </div>
    </div>
  );
  return <RowShell r={r} shell={shell} summary={summary} />;
}

// ─── shell: date · ticker · chip · summary (desktop grid / mobile stack) ───
function RowShell({ r, shell: s, summary }: { r: CapitalRowInput; shell: Shell; summary: ReactNode }) {
  const tk = <Link href={`/stock/${r.ticker}`} className="text-[16px] font-bold text-blue-400 hover:text-blue-300">{r.ticker}</Link>;
  return (
    <>
      <div className="md:hidden">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">{tk}<Chip r={r} /></div>
          <span className="text-[13px] text-white/60 whitespace-nowrap">{s.dateLabel}</span>
        </div>
        <div className="mt-0.5">{s.dayBadge}</div>
        <div className="mt-1.5">{summary}</div>
      </div>
      <div className="hidden md:grid grid-cols-[120px_96px_84px_1fr] gap-3.5 items-start">
        <div className="text-[14px] text-white/65">{s.dateLabel}<div className="mt-0.5">{s.dayBadge}</div></div>
        <div>{tk}</div>
        <div><Chip r={r} /></div>
        <div className="min-w-0">{summary}</div>
      </div>
    </>
  );
}

export default function CapitalRow({ r, dateLabel, dayBadge }: { r: CapitalRowInput; dateLabel: string; dayBadge: ReactNode }) {
  // manual choice wins; otherwise a ⚠ row opens by itself
  const [manual, setManual] = useState<boolean | null>(null);
  const open = manual ?? r.warn;
  const toggle = () => setManual(!open);
  const shell: Shell = { dateLabel, dayBadge };
  return (
    <div className="px-3 md:px-[18px] py-4 border-b border-white/[0.06] last:border-0 hover:bg-white/[0.015] transition-colors">
      {r.kind === 'XR' ? <XrRow r={r} open={open} toggle={toggle} shell={shell} />
        : r.kind === 'XW' ? <XwRow r={r} open={open} toggle={toggle} shell={shell} />
        : r.kind === 'NEW' ? <NewRow r={r} open={open} toggle={toggle} shell={shell} />
        : <BoardRow r={r} shell={shell} />}
    </div>
  );
}
