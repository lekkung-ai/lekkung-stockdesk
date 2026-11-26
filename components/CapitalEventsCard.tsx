'use client';

// Overview card "เหตุการณ์ทุน · หุ้นใหม่เข้าตลาด" (mock capital-events-v1 ①).
// Facts: /data/capital_events.json (static file, same fetch as /calendar) · prices: the scan closes the page already has (props) ·
// every number comes from lib/capitalCalc (selectCapitalCard → xrCalc / listingCalc / xwCalc), none is computed here.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { bangkokDateKey } from '@/lib/utils';
import {
  fmtDay, fmtPct, fmtPrice, isHalted, niceNum, parseRatio, selectCapitalCard, tradingDaysAhead, CARD_AHEAD_TRADING_DAYS, CARD_VISIBLE_ROWS,
  type CapitalCardRow, type CapitalEventsFile,
} from '@/lib/capitalCalc';
import type { NewsFlagsFile } from '@/lib/newsFlags';

const AMBER = '#f59e0b';

const CHIP: Record<string, string> = {
  XR: 'bg-[#2e1065] text-[#c4b5fd] border-[#4c1d95]',
  XW: 'bg-[#3f2a06] text-[#fcd34d] border-[#78350f]',
  PP: 'bg-[#3b0764] text-[#f0abfc] border-[#86198f]',
  RO: 'bg-[#1e1b4b] text-[#a5b4fc] border-[#3730a3]',
  DEFAULT: 'bg-[#1f2937] text-[#d1d5db] border-[#374151]',
};

function when(row: CapitalCardRow, today: string): { text: string; cls: string } {
  if (row.date === today) return { text: 'วันนี้', cls: 'text-[#fbbf24] font-semibold' };
  if (row.date === tradingDaysAhead(today, 1)) return { text: `พรุ่งนี้ ${fmtDay(row.date, today)}`, cls: 'text-white/70' };
  return { text: fmtDay(row.date, today), cls: 'text-white/55' };
}

/** Main figure of a row: "5.5 : 1 @ 0.32 · +18.2%" / "+9.0% @ 1.35 · ⚠ ต่ำกว่าตลาด 33%". */
function Figure({ row }: { row: CapitalCardRow }) {
  const parts: React.ReactNode[] = [];
  const ratio = parseRatio(row.ratioText);
  if (row.kind === 'XR') {
    if (ratio) parts.push(<span key="r">{niceNum(ratio.old)} : {niceNum(ratio.new)}{row.price != null ? ` @ ${fmtPrice(row.price)}` : ''}</span>);
    if (row.pctNew != null) parts.push(<span key="p">{fmtPct(row.pctNew)}</span>);
    if (row.warn) parts.push(<span key="w" style={{ color: AMBER }}>⚠ หุ้นเพิ่มมาก</span>);
  } else if (row.kind === 'XW') {
    if (ratio) parts.push(<span key="r">W {niceNum(ratio.old)} : {niceNum(ratio.new)}</span>);
    if (row.pctNew != null) parts.push(<span key="p">{fmtPct(row.pctNew)} ถ้าแปลงหมด</span>);
  } else {
    if (row.pctNew != null) parts.push(<span key="p">{fmtPct(row.pctNew)}{row.price != null ? ` @ ${fmtPrice(row.price)}` : ''}</span>);
    if (row.warn && row.discountPct != null) parts.push(<span key="w" style={{ color: AMBER }}>⚠ ต่ำกว่าตลาด {Math.round(row.discountPct)}%</span>);
  }
  if (row.halted) parts.push(<span key="h" className="text-white/45">งดซื้อขาย</span>);
  if (parts.length === 0) parts.push(<span key="n" className="text-white/40">ดูรายละเอียดในปฏิทิน</span>);
  return <>{parts.map((p, i) => <span key={i}>{i > 0 && <span className="text-white/25"> · </span>}{p}</span>)}</>;
}

function EventRow({ row, today }: { row: CapitalCardRow; today: string }) {
  const w = when(row, today);
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1.5 border-t border-white/[0.05] first:border-t-0">
      <Link href={`/stock/${row.ticker}`} className="text-[14px] font-bold text-blue-400 hover:text-blue-300">{row.ticker}</Link>
      <span className={`text-[12px] font-bold px-1.5 py-px rounded border whitespace-nowrap ${CHIP[row.label] ?? CHIP[row.kind] ?? CHIP.DEFAULT}`}>{row.label}</span>
      <span className="text-[13px] text-white/80 min-w-0">
        <Figure row={row} />
      </span>
      <span className={`ml-auto text-[12px] whitespace-nowrap ${w.cls}`}>{w.text}</span>
    </div>
  );
}

function Side({ title, rows, today, empty, href, hrefLabel }: {
  title: string; rows: CapitalCardRow[]; today: string; empty: string; href: string; hrefLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const shown = open ? rows : rows.slice(0, CARD_VISIBLE_ROWS);
  const more = rows.length - CARD_VISIBLE_ROWS;
  return (
    <div className="min-w-0">
      <div className="text-[13px] font-semibold text-white/55 mb-0.5">{title}</div>
      {rows.length === 0 ? (
        <p className="text-[13px] text-white/45 py-1.5">{empty}</p>
      ) : (
        <div>{shown.map(r => <EventRow key={r.id} row={r} today={today} />)}</div>
      )}
      {more > 0 && (
        <button onClick={() => setOpen(v => !v)} className="text-[12px] text-white/50 hover:text-white/80 mt-0.5">
          {open ? '▴ ย่อ' : `+${more} รายการ ▾`}
        </button>
      )}
      <div><Link href={href} className="text-[12px] text-[#7dd3fc] hover:underline">{hrefLabel}</Link></div>
    </div>
  );
}

function stamp(generatedAt: string | undefined): string {
  if (!generatedAt) return '';
  const m = generatedAt.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return '';
  return `${fmtDay(`${m[1]}-${m[2]}-${m[3]}`, `${m[1]}-01-01`)} ${m[4]}:${m[5]}`;
}

export default function CapitalEventsCard({ prices }: { prices: Record<string, number> }) {
  const [file, setFile] = useState<CapitalEventsFile | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'failed'>('loading');
  const [halted, setHalted] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch('/data/capital_events.json')
      .then(r => (r.ok ? (r.json() as Promise<CapitalEventsFile>) : null))
      .then(f => {
        const ok = !!f && Array.isArray(f.events);
        setFile(ok ? f : null);
        setState(ok ? 'ok' : 'failed');
      })
      .catch(() => setState('failed'));
    fetch('/data/news_flags.json')
      .then(r => (r.ok ? (r.json() as Promise<NewsFlagsFile>) : null))
      .then(f => {
        const s = new Set<string>();
        for (const [t, flags] of Object.entries(f?.flags ?? {})) {
          if (Array.isArray(flags) && isHalted(flags.filter(x => x?.type === 'mark').map(x => x.label))) s.add(t);
        }
        setHalted(s);
      })
      .catch(() => { /* no marks → nothing treated as halted */ });
  }, []);

  const today = bangkokDateKey();
  const card = useMemo(() => selectCapitalCard(file?.events, { today, prices, halted }), [file, today, prices, halted]);

  return (
    <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-4 min-w-0" data-testid="home-capital-events">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 mb-2">
        <span className="text-[12px] font-semibold uppercase tracking-wider text-white/40">เหตุการณ์ทุน · หุ้นใหม่เข้าตลาด</span>
        {state === 'ok' && file?.generated_at && <span className="text-[12px] text-white/35">ข่าว SET ถึง {stamp(file.generated_at)}</span>}
      </div>
      {state === 'loading' ? (
        <div className="h-24 bg-white/[0.04] rounded animate-pulse" />
      ) : state === 'failed' ? (
        <p className="text-[13px] text-white/45 py-3">ยังโหลดข้อมูลเหตุการณ์ทุนไม่ได้</p>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
            <Side title="กำลังจะเกิด" rows={card.upcoming} today={today} href="/calendar?type=xr" hrefLabel="ดูทั้งหมดในปฏิทิน →"
              empty={`ไม่มีเหตุการณ์ทุนใน ${CARD_AHEAD_TRADING_DAYS} วันทำการข้างหน้า`} />
            <Side title="เพิ่งเข้ามา (5 วันทำการ)" rows={card.recent} today={today} href="/calendar?type=new" hrefLabel="ดูทั้งหมดในปฏิทิน →"
              empty="ไม่มีเหตุการณ์ทุนใน 5 วันที่ผ่านมา" />
          </div>
          <p className="text-[12px] text-white/40 mt-2 leading-snug">
            ⚠ = หุ้นใหม่ได้มาถูกกว่าราคาตลาดเกิน 10% และมากกว่า 5% ของหุ้นเดิม → ผู้ได้หุ้นมีกำไร อาจมีแรงขาย · XR ที่หุ้นเพิ่ม ≥ 50% ก็ขึ้น ⚠
          </p>
        </>
      )}
    </div>
  );
}
