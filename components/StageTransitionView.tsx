'use client';

import React, { useMemo, useState } from 'react';
import { SortableTh, Th, TableWrap, type SortConfig } from '@/components/StrategyTable';
import Pagination from '@/components/Pagination';
import { formatThaiDate } from '@/lib/utils';
import { TS } from '@/lib/typeScale';
import type { StageDef, StageTransitionData } from '@/lib/stageTransitions';

// "ย้อนหลัง" view of /market-stage and /stage-analysis: which tickers changed
// stage lately, from what, and how long ago. Layout follows
// mockups/stage_history_mock.html (dashboard repo).

const PAGE_SIZE = 50;
const STRIP_DAYS = 60;
const DAY_CHOICES: [number, string][] = [[1, 'วันนี้'], [3, '3 วัน'], [5, '5 วัน'], [10, '10 วัน'], [20, '20 วัน'], [0, 'ทั้งหมด']];
type Dir = 'all' | 'up' | 'down';

const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const shortDate = (iso: string) => `${parseInt(iso.slice(8, 10))} ${MONTHS[parseInt(iso.slice(5, 7)) - 1]}`;

interface Row {
  ticker: string;
  cur: string;
  prev: string;
  start: string;
  age: number; // trading days in the current stage, today included
  dir: -1 | 0 | 1; // 0 = to/from a stage off the scale (IPO / Unknown)
  price: number | null;
  pct: number | null;
  strip: (string | null)[]; // stage per day over the last STRIP_DAYS days, null = not in the scan
  runs: { stage: string; start: string; end: string; days: number }[];
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full border ${TS.body} transition-colors whitespace-nowrap ${
        on ? 'bg-[#1e2a44] border-[#4f8cff] text-[#cfe0ff]' : 'border-white/[0.08] text-white/60 hover:text-white/90'
      }`}
    >
      {children}
    </button>
  );
}

export default function StageTransitionView({ data, stages }: { data: StageTransitionData | null; stages: StageDef[] }) {
  const [within, setWithin] = useState(5);
  const [dir, setDir] = useState<Dir>('all');
  const [stageNow, setStageNow] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'age', dir: 'asc' });
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);

  const stageMap = useMemo(() => new Map(stages.map(s => [s.name, s])), [stages]);
  const def = (name: string): StageDef => stageMap.get(name) ?? { name, rank: null, color: '#424242', badgeCls: 'text-white/60' };
  const Badge = ({ name }: { name: string }) => <StageBadge name={name} cls={def(name).badgeCls} />;

  const dates = data?.dates ?? [];
  const latest = dates[dates.length - 1];

  // Tickers still in the latest scan whose current stage started inside the window.
  const allRows = useMemo<Row[]>(() => {
    if (!data || !latest) return [];
    const idx = new Map(data.dates.map((d, i) => [d, i]));
    const last = data.dates.length - 1;
    const stripFrom = Math.max(0, data.dates.length - STRIP_DAYS);
    const out: Row[] = [];
    for (const t of data.tickers) {
      const n = t.runs.length;
      if (n < 2 || t.runs[n - 1][2] !== latest) continue;
      const [cur, start] = t.runs[n - 1];
      const prev = t.runs[n - 2][0];
      const rc = stageMap.get(cur)?.rank ?? null;
      const rp = stageMap.get(prev)?.rank ?? null;
      const price = t.closeByDate[latest] ?? null;
      const base = t.closeByDate[start];
      const strip: (string | null)[] = new Array(last - stripFrom + 1).fill(null);
      for (const [s, a, b] of t.runs) {
        for (let i = Math.max(idx.get(a)!, stripFrom); i <= idx.get(b)!; i++) strip[i - stripFrom] = s;
      }
      out.push({
        ticker: t.ticker,
        cur, prev, start,
        age: last - idx.get(start)! + 1,
        dir: rc == null || rp == null ? 0 : rc > rp ? 1 : -1,
        price,
        pct: price != null && base ? ((price - base) / base) * 100 : null,
        strip,
        runs: t.runs.map(([stage, a, b]) => ({ stage, start: a, end: b, days: idx.get(b)! - idx.get(a)! + 1 })),
      });
    }
    return out;
  }, [data, latest, stageMap]);

  const changedToday = allRows.filter(r => r.age === 1);
  const in5 = allRows.filter(r => r.age <= 5);
  const best = stages.find(s => s.rank != null);

  const rows = useMemo(() => {
    const list = allRows.filter(r =>
      (within === 0 || r.age <= within) &&
      (dir === 'all' || (dir === 'up' ? r.dir > 0 : r.dir < 0)) &&
      (stageNow == null || r.cur === stageNow)
    );
    const key = sortConfig?.key ?? 'age';
    const sign = sortConfig?.dir === 'desc' ? -1 : 1;
    const val = (r: Row): number | string => {
      switch (key) {
        case 'ticker': return r.ticker;
        case 'cur': return -(stageMap.get(r.cur)?.rank ?? -99); // asc = best first
        case 'start': return r.start;
        case 'price': return r.price ?? -Infinity;
        case 'pct': return r.pct ?? -Infinity;
        default: return r.age;
      }
    };
    return list.sort((a, b) => {
      const x = val(a), y = val(b);
      const c = x < y ? -1 : x > y ? 1 : 0;
      return c !== 0 ? c * sign : a.ticker.localeCompare(b.ticker);
    });
  }, [allRows, within, dir, stageNow, sortConfig, stageMap]);

  if (!data || dates.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-label text-white/30">ยังไม่มีข้อมูลย้อนหลัง</p>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const resetPage = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); setOpen(null); };
  const handleSort = (key: string) => {
    setPage(1);
    setSortConfig(prev => (prev?.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  };
  const stripDays = Math.min(STRIP_DAYS, dates.length);
  const presentStages = stages.filter(s => allRows.some(r => r.cur === s.name));

  return (
    <div className="space-y-3">
      <p className={`${TS.body} text-white/40`}>
        หุ้นที่เปลี่ยน stage ในช่วงที่เลือก · ข้อมูลย้อนหลัง {dates.length} วันทำการ ({shortDate(dates[0])} – {shortDate(latest)}) · อัปเดต {formatThaiDate(data.generatedAt)}
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <Card label="เปลี่ยน stage วันนี้">
          {changedToday.length}{' '}
          <span className="text-[15px] text-[#1D9E75]">↑{changedToday.filter(r => r.dir > 0).length}</span>{' '}
          <span className="text-[15px] text-[#E24B4A]">↓{changedToday.filter(r => r.dir < 0).length}</span>
        </Card>
        <Card label="เปลี่ยนใน 5 วัน">{in5.length}</Card>
        <Card label={`เพิ่งเข้า ${best?.name ?? ''} (5 วัน)`}><span className="text-[#1D9E75]">{in5.filter(r => r.cur === best?.name).length}</span></Card>
        <Card label="เพิ่งหลุดลง (5 วัน)"><span className="text-[#E24B4A]">{in5.filter(r => r.dir < 0).length}</span></Card>
      </div>

      <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-3 flex flex-wrap gap-x-5 gap-y-2.5 items-center">
        <FilterGroup label="เปลี่ยนภายใน">
          {DAY_CHOICES.map(([v, l]) => <Chip key={v} on={within === v} onClick={() => resetPage(setWithin)(v)}>{l}</Chip>)}
        </FilterGroup>
        <FilterGroup label="ทิศทาง">
          {([['all', 'ทั้งหมด'], ['up', '↑ ดีขึ้น'], ['down', '↓ แย่ลง']] as [Dir, string][]).map(([v, l]) => (
            <Chip key={v} on={dir === v} onClick={() => resetPage(setDir)(v)}>{l}</Chip>
          ))}
        </FilterGroup>
        <FilterGroup label="stage ตอนนี้">
          <Chip on={stageNow == null} onClick={() => resetPage(setStageNow)(null)}>ทั้งหมด</Chip>
          {presentStages.map(s => <Chip key={s.name} on={stageNow === s.name} onClick={() => resetPage(setStageNow)(s.name)}>{s.name}</Chip>)}
        </FilterGroup>
      </div>

      <TableWrap>
        <thead className="border-b border-white/[0.06] bg-white/[0.015]">
          <tr>
            <SortableTh sortKey="ticker" currentSort={sortConfig} onSort={handleSort}>Symbol</SortableTh>
            <SortableTh sortKey="cur" currentSort={sortConfig} onSort={handleSort}>Stage ตอนนี้</SortableTh>
            <Th>เปลี่ยนจาก</Th>
            <SortableTh sortKey="start" currentSort={sortConfig} onSort={handleSort}>เข้าเมื่อ</SortableTh>
            <SortableTh right sortKey="age" currentSort={sortConfig} onSort={handleSort}>อยู่มา (วัน)</SortableTh>
            <SortableTh right sortKey="price" currentSort={sortConfig} onSort={handleSort}>ราคา</SortableTh>
            <SortableTh right sortKey="pct" currentSort={sortConfig} onSort={handleSort}>% ตั้งแต่เปลี่ยน</SortableTh>
            <Th className="hidden md:table-cell">{stripDays} วันล่าสุด (เก่า → ใหม่)</Th>
          </tr>
        </thead>
        <tbody>
          {pageRows.map(r => (
            <React.Fragment key={r.ticker}>
              <tr
                onClick={() => setOpen(open === r.ticker ? null : r.ticker)}
                className={`border-b border-white/[0.04] cursor-pointer transition-colors ${open === r.ticker ? 'bg-white/[0.08]' : 'hover:bg-white/[0.025]'}`}
              >
                <td className={`px-3 py-2 ${TS.tableCell} font-bold text-white whitespace-nowrap`}>
                  {r.ticker}
                  {r.age === 1 && <span className="ml-1.5 px-1.5 py-px rounded bg-[#1d4ed8] text-white text-[11px] font-semibold align-middle">ใหม่</span>}
                </td>
                <td className="px-3 py-2 whitespace-nowrap"><Badge name={r.cur} /></td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <Badge name={r.prev} />{' '}
                  <span className={`${TS.tableCell} ${r.dir > 0 ? 'text-[#1D9E75]' : r.dir < 0 ? 'text-[#E24B4A]' : 'text-white/40'}`}>
                    {r.dir > 0 ? '↑' : r.dir < 0 ? '↓' : '→'}
                  </span>
                </td>
                <td className={`px-3 py-2 ${TS.tableCell} text-white/70 whitespace-nowrap`}>{shortDate(r.start)}</td>
                <td className={`px-3 py-2 ${TS.tableCell} text-white/70 text-right tabular-nums`}>{r.age}</td>
                <td className={`px-3 py-2 ${TS.tableCell} text-white/70 text-right tabular-nums`}>{r.price != null ? r.price.toFixed(2) : '—'}</td>
                <td className={`px-3 py-2 ${TS.tableCell} text-right tabular-nums ${r.pct == null ? 'text-white/40' : r.pct >= 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>
                  {r.pct == null ? '—' : `${r.pct >= 0 ? '+' : ''}${r.pct.toFixed(1)}%`}
                </td>
                <td className="px-3 py-2 hidden md:table-cell">
                  {/* cells share a fixed width so the long Weinstein names still fit at 1440px */}
                  <div className="flex gap-px h-4 w-[180px] min-[1500px]:w-[300px]">
                    {r.strip.map((s, i) => (
                      <i
                        key={i}
                        className="flex-1 rounded-[1px]"
                        style={{ background: s ? def(s).color : 'transparent' }}
                        title={`${shortDate(dates[dates.length - r.strip.length + i])}: ${s ?? 'ไม่มีผลสแกน'}`}
                      />
                    ))}
                  </div>
                </td>
              </tr>
              {open === r.ticker && (
                <tr className="bg-black/20 border-b border-white/[0.04]">
                  <td colSpan={8} className="px-3 py-3">
                    {/* the cell is sticky-left (TableWrap); on phones cap it to the screen so the sequence wraps in view */}
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 whitespace-normal max-w-[calc(100vw-56px)] md:max-w-none">
                      {r.runs.map((x, j) => (
                        <span key={j} className="inline-flex items-center gap-1.5">
                          {j > 0 && <span className="text-white/30">→</span>}
                          <Badge name={x.stage} />
                          <span className={`${TS.caption} text-white/40 whitespace-nowrap`}>
                            {shortDate(x.start)}–{shortDate(x.end)} ({x.days} วัน)
                          </span>
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={8} className={`py-12 text-center ${TS.body} text-white/30`}>ไม่มีหุ้นเปลี่ยน stage ในช่วงนี้</td>
            </tr>
          )}
        </tbody>
      </TableWrap>

      {totalPages > 1 && (
        <div className="flex flex-col items-center gap-1">
          <Pagination page={safePage} totalPages={totalPages} onChange={p => { setPage(p); setOpen(null); }} />
          <span className="text-[11px] text-white/35 tabular-nums">
            แสดง {(safePage - 1) * PAGE_SIZE + 1}–{(safePage - 1) * PAGE_SIZE + pageRows.length} จาก {rows.length}
          </span>
        </div>
      )}

      <div className={`flex flex-wrap gap-x-3 gap-y-1.5 ${TS.caption} text-white/45`}>
        {stages.map(s => (
          <span key={s.name} className="inline-flex items-center gap-1">
            <i className="inline-block w-2.5 h-2.5 rounded-[2px]" style={{ background: s.color }} />{s.name}
          </span>
        ))}
      </div>
      <p className={`${TS.caption} text-white/30`}>
        กดที่แถวเพื่อดูลำดับการเปลี่ยน stage ทั้งหมด · ↑↓ เทียบลำดับ stage จากดีไปแย่ · เปลี่ยนจาก/ไป IPO หรือ Unknown ไม่นับว่าดีขึ้นหรือแย่ลง (→) · ราคา = ราคาปิดของวันสแกนล่าสุด
      </p>
    </div>
  );
}

function StageBadge({ name, cls }: { name: string; cls: string }) {
  return <span className={`inline-flex items-center px-1.5 py-0.5 rounded ${TS.body} font-semibold ${cls}`}>{name}</span>;
}

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#13161e] border border-white/[0.07] rounded-xl px-3 py-2.5">
      <div className={`${TS.caption} text-white/45`}>{label}</div>
      <div className={`${TS.numberMain} text-white tabular-nums`}>{children}</div>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={`${TS.body} text-white/40 mr-0.5`}>{label}</span>
      {children}
    </div>
  );
}
