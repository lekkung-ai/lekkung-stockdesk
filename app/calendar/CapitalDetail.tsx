'use client';

// Detail block under XR / XW / "หุ้นใหม่เข้า" rows of /calendar (mock calendar-capital-v2).
// Numbers: lib/capitalCalc.ts with the latest scan close; facts: /api/corporate-action + /data/capital_events.json.

import { useState } from 'react';
import {
  fmtMillion, fmtPct, fmtPrice, listingCalc, xrCalc, xwCalc, SOURCE_LABEL,
  type CapitalEvent, type CapitalResult,
} from '@/lib/capitalCalc';

const SKY = '#7dd3fc'; // current price
const AMBER = '#f59e0b';

export interface CapitalRowInput {
  kind: 'XR' | 'XW' | 'NEW' | 'BOARD';
  ticker: string;
  upcoming: boolean;          // date >= today
  close: number | null;       // latest scan close
  halted: boolean;            // SP / H mark
  ratio?: string | null;
  exercise?: number | null;
  allotShare?: number | null;
  withWarrant?: { ratio: string | null; allotShare: number | null } | null; // XR with a same-day XW
  result?: CapitalResult | null; // RO result (actual take-up)
  capital?: CapitalEvent;        // NEW / BOARD
}

function Field({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[12px] text-white/40">{k}</div>
      <div className="text-[13px] font-semibold text-white/85">{children}</div>
    </div>
  );
}

function SplitBar({ oldPct, newLabel, color = '#a78bfa' }: { oldPct: number; newLabel: string; color?: string }) {
  const o = Math.max(0, Math.min(100, oldPct));
  return (
    <div className="w-[200px] max-w-full">
      <div className="flex h-2.5 rounded overflow-hidden bg-white/[0.08]">
        <div style={{ width: `${o}%`, background: '#4b5563' }} />
        <div style={{ width: `${100 - o}%`, background: color }} />
      </div>
      <div className="flex justify-between text-[12px] text-white/40 mt-0.5">
        <span>เดิม {o.toFixed(1)}%</span><span>{newLabel} {(100 - o).toFixed(1)}%</span>
      </div>
    </div>
  );
}

function MarketPrice({ close, halted }: { close: number | null; halted: boolean }) {
  if (halted) return <span className="text-white/50">งดซื้อขาย</span>;
  if (close == null) return <span className="text-white/40">ไม่มีราคา</span>;
  return <span style={{ color: SKY }}>{fmtPrice(close)}</span>;
}

function vsMarket(discount: number | null): string {
  if (discount == null) return '';
  if (Math.abs(discount) < 0.5) return ' (ใกล้เคียงตลาด)';
  return discount > 0 ? ` (ถูกกว่า ${fmtPct(discount, false)})` : ` (แพงกว่า ${fmtPct(-discount, false)})`;
}

function XrDetail({ r }: { r: CapitalRowInput }) {
  const [open, setOpen] = useState(false);
  const c = xrCalc({ ratio: r.ratio, exercise: r.exercise, close: r.close, allotShare: r.allotShare, upcoming: r.upcoming, halted: r.halted });
  if (!c) return null;
  const big = c.pctNew >= 100;
  const meaning: string[] = [`ถ้าไม่จอง: สัดส่วนถือ/กำไรต่อหุ้นเหลือ ${c.holdingIfSkip.toFixed(1)}%`];
  if (big) meaning.push(`หุ้นใหม่มากกว่าหุ้นเดิม ${(c.pctNew / 100).toLocaleString('en-US', { maximumFractionDigits: 1 })} เท่า → ต้องใช้เงินจองมาก และอาจมีหุ้นใหม่ไหลออกมาขายตอนเข้าตลาด`);
  else if (c.discountPct != null && Math.abs(c.discountPct) < 0.5) meaning.push('ราคาใช้สิทธิเท่าราคาตลาด → สิทธิแทบไม่มีมูลค่า ราคาไม่ต้องปรับลงวัน XR');
  else if (c.discountPct != null && c.discountPct < 0) meaning.push('ราคาใช้สิทธิสูงกว่าตลาด → ซื้อในตลาดถูกกว่าใช้สิทธิ');
  if (r.result) meaning.push(`ผลจองจริง ${r.result.take_up_pct.toFixed(1)}%`);
  const oldS = c.oldShares;
  const actualNew = r.result?.sold ?? null;
  const rows: { k: string; before: string; max: string; actual: string }[] = [
    { k: 'จำนวนหุ้น', before: fmtMillion(oldS), max: fmtMillion(oldS != null && c.newSharesMax != null ? oldS + c.newSharesMax : null),
      actual: fmtMillion(oldS != null && actualNew != null ? oldS + actualNew : null) },
    { k: 'สัดส่วนของคนที่ไม่จอง', before: '100%', max: `${c.holdingIfSkip.toFixed(1)}%`,
      actual: oldS != null && actualNew != null ? `${((oldS / (oldS + actualNew)) * 100).toFixed(1)}%` : '—' },
    { k: 'เงินที่บริษัทได้', before: '—', max: c.moneyMax != null ? `${(c.moneyMax / 1e6).toLocaleString('en-US', { maximumFractionDigits: 1 })} ลบ.` : '—',
      actual: actualNew != null && r.exercise != null ? `${((actualNew * r.exercise) / 1e6).toLocaleString('en-US', { maximumFractionDigits: 1 })} ลบ.` : '—' },
  ];
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <Field k={r.result ? 'หุ้นเพิ่ม (สูงสุด)' : 'หุ้นเพิ่มสูงสุด'}>
          <span style={c.warn ? { color: AMBER } : undefined}>{fmtPct(c.pctNew)}</span>
        </Field>
        <SplitBar oldPct={c.holdingIfSkip} newLabel="ใหม่" />
        <Field k="ราคาใช้สิทธิ vs ตลาด">
          {fmtPrice(r.exercise)} vs <MarketPrice close={r.close} halted={r.halted} />
          <span className="font-normal text-white/50">{vsMarket(c.discountPct)}</span>
        </Field>
        {c.terp != null && (
          <Field k="ราคาหลัง XR ตามทฤษฎี">
            {fmtPrice(Number(c.terp.toFixed(4)))}{' '}
            <span className="font-normal text-white/50">{c.terpChgPct != null && Math.abs(c.terpChgPct) >= 0.05 ? `(${fmtPct(c.terpChgPct)})` : '(ไม่ปรับ)'}</span>
          </Field>
        )}
        {r.withWarrant && (
          <span className="text-[12px] font-semibold px-2 py-0.5 rounded bg-[#EF9F27]/15 text-[#fcd34d] ring-1 ring-[#EF9F27]/30">
            พ่วง W{r.withWarrant.ratio ? ` ${r.withWarrant.ratio}` : ''}
          </span>
        )}
      </div>
      <p className={`text-[12.5px] mt-1.5 ${c.warn ? 'text-[#fcd34d]' : 'text-white/50'}`}>{meaning.join(' · ')}</p>
      <button onClick={() => setOpen(v => !v)} className="text-[12px] text-white/40 hover:text-white/70 mt-1">
        {open ? '▾ ซ่อนรายละเอียด' : '▸ ดูรายละเอียด'}
      </button>
      {open && (
        <div className="mt-1.5 bg-black/20 border border-white/[0.07] rounded-lg p-3 overflow-x-auto">
          <table className="text-[12.5px]">
            <thead>
              <tr className="text-white/40">
                <th className="text-left font-normal pr-5 pb-1"></th>
                <th className="text-right font-normal pr-5 pb-1">ก่อน</th>
                <th className="text-right font-normal pr-5 pb-1">สูงสุด (ถ้าจองเต็ม)</th>
                {r.result && <th className="text-right font-normal pb-1">จริง</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map(x => (
                <tr key={x.k} className="text-white/75">
                  <td className="pr-5 py-0.5 whitespace-nowrap">{x.k}</td>
                  <td className="pr-5 py-0.5 text-right whitespace-nowrap">{x.before}</td>
                  <td className="pr-5 py-0.5 text-right whitespace-nowrap">{x.max}</td>
                  {r.result && <td className="py-0.5 text-right whitespace-nowrap">{x.actual}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[12px] text-white/40 mt-2">
            {oldS == null ? 'ไม่มีจำนวนหุ้นจาก Settrade · ' : 'หุ้นเดิม = จำนวนหุ้นใหม่สูงสุด × อัตราส่วน · '}
            {r.result ? 'คอลัมน์ "จริง" จากประกาศผลการขาย (F53-5)' : '"สูงสุด" = ถ้าจองครบ · พอบริษัทแจ้งผลการจองจะมีคอลัมน์ "จริง"'}
          </p>
        </div>
      )}
    </>
  );
}

function XwDetail({ r }: { r: CapitalRowInput }) {
  const c = xwCalc(r.ratio);
  if (!c) {
    return (
      <p className="text-[12.5px] text-white/50">
        อัตราส่วนนี้ไม่ใช่ หุ้นเดิม : W (คำนวณหุ้นเพิ่มไม่ได้) ·{' '}
        <a href={`https://www.set.or.th/th/market/product/stock/quote/${r.ticker}/rights-benefits`} target="_blank" rel="noopener noreferrer"
          className="underline decoration-dotted hover:text-white/80">ดูประกาศ ↗</a>
      </p>
    );
  }
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <Field k="หุ้นเพิ่มสูงสุดถ้าแปลงหมด">{fmtPct(c.pctNewMax)}</Field>
        <SplitBar oldPct={100 - c.newShareMax} newLabel="W" color={AMBER} />
        <Field k="ราคาแปลง">
          <a href={`https://www.set.or.th/th/market/product/stock/quote/${r.ticker}/rights-benefits`} target="_blank" rel="noopener noreferrer"
            className="font-normal text-white/60 underline decoration-dotted hover:text-white/90">ดูประกาศ ↗</a>
        </Field>
      </div>
      <p className="text-[12.5px] mt-1.5 text-white/50">ไม่เพิ่มหุ้นทันที · หุ้นจะเพิ่มก็ต่อเมื่อมีคนแปลง W (คิด W 1 หน่วย = 1 หุ้น · เงื่อนไขจริงดูในประกาศ)</p>
    </>
  );
}

function NewDetail({ r }: { r: CapitalRowInput }) {
  const e = r.capital!;
  const s = e.shares;
  const c = listingCalc({ old: s?.old, added: s?.new, price: e.price, close: r.close, halted: r.halted });
  const src = e.source_type ?? '';
  const allot = e.allottees ?? [];
  const take = e.result?.take_up_pct;
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <Field k="หุ้นเดิม → รวม">{fmtMillion(s?.old).replace(' ล้าน', '')} → {fmtMillion(s?.total ?? null)}</Field>
        {c && <Field k="เพิ่มขึ้น"><span style={c.warn ? { color: AMBER } : undefined}>{fmtPct(c.pctNew)}</span></Field>}
        {c && <SplitBar oldPct={100 - c.newShare} newLabel={src === 'W' || src === 'CB' ? 'แปลง' : src || 'ใหม่'} color={c.warn ? '#f0abfc' : '#a78bfa'} />}
        <Field k="ราคาได้หุ้น vs ตลาด">
          {e.price != null ? fmtPrice(e.price) : (e.prices ?? []).map(p => fmtPrice(p.price)).join(' / ') || '—'} vs <MarketPrice close={r.close} halted={r.halted} />
          <span className="font-normal text-white/50">{vsMarket(c?.discountPct ?? null)}</span>
        </Field>
        {c?.holderGainPct != null && (
          <Field k={c.holderGainPct < 0 ? 'ผู้ได้หุ้นขาดทุนอยู่' : 'ผู้ได้หุ้นกำไรอยู่'}>
            <span style={{ color: c.warn ? AMBER : c.holderGainPct < 0 ? '#fca5a5' : undefined }}>{fmtPct(c.holderGainPct)}</span>
          </Field>
        )}
        {src === 'RO' && take != null && <Field k="จองจริง">{take.toFixed(1)}%</Field>}
      </div>
      <p className={`text-[12.5px] mt-1.5 ${c?.warn ? 'text-[#fcd34d]' : 'text-white/50'}`}>
        {c?.warn ? 'ได้หุ้นถูกกว่าตลาดมาก และขายได้แล้ว → ระวังแรงขาย · ' : ''}
        {allot.length > 0 && (
          <>จัดสรรให้ {allot.slice(0, 2).map(a => `${a.name} ${fmtMillion(a.shares)}หุ้น`).join(' + ')}{allot.length > 2 ? ` + อีก ${allot.length - 2} ราย` : ''} · </>
        )}
        {r.halted && 'หุ้นงดซื้อขาย ไม่คำนวณจากราคา · '}
        {e.origin?.link && (
          <a href={e.origin.link} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted hover:text-white/80">ประกาศ SET ↗</a>
        )}
      </p>
    </>
  );
}

function BoardDetail({ r }: { r: CapitalRowInput }) {
  const e = r.capital!;
  return (
    <p className="text-[12.5px] text-white/45">
      {e.title}{' '}
      {e.origin?.link && (
        <a href={e.origin.link} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted hover:text-white/80 whitespace-nowrap">ประกาศ ↗</a>
      )}
    </p>
  );
}

export default function CapitalDetail({ r }: { r: CapitalRowInput }) {
  const body = r.kind === 'XR' ? <XrDetail r={r} /> : r.kind === 'XW' ? <XwDetail r={r} /> : r.kind === 'NEW' ? <NewDetail r={r} /> : <BoardDetail r={r} />;
  return <div className="px-3 pb-3 md:pl-[318px] -mt-1">{body}</div>;
}

/** Main-line text for the new kinds (the row's detail column). */
export function capitalMainLine(e: CapitalEvent): string {
  if (e.kind === 'board') return `ประกาศแล้ว · รอ EGM · ${(e.tags ?? []).map(t => (t === 'W' ? 'Warrant' : t === 'CB' ? 'หุ้นกู้แปลงสภาพ' : t)).join(' + ')}`;
  const src = SOURCE_LABEL[e.source_type ?? ''] ?? e.source_type ?? '';
  const n = e.shares?.new;
  const price = e.price != null ? ` @ ${fmtPrice(e.price)} บาท` : '';
  return `หุ้นเพิ่มทุนเริ่มซื้อขาย · ที่มา: ${src}${n ? ` · ${fmtMillion(n)}หุ้น${price}` : ''}`;
}
