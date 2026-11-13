'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { TableWrap, Td, stageCls } from '@/components/StrategyTable';
import ReportCardChart from '@/components/ReportCardChart';
import { MfeScatter, MonthlyChart, ReturnHistogram } from '@/components/reportCard/ReportCardCharts';
import ReportCardTop from '@/components/reportCard/ReportCardTop';
import { TS, READABLE } from '@/lib/typeScale';
import {
  PRESETS,
  SORT_LABELS,
  SortKey,
  SortState,
  dirLabel,
  nextSort,
  parseSort,
  presetFor,
  sortParams,
  sortSetups,
} from '@/lib/reportCardSort';
import {
  BestWorstEntry,
  GIVEBACK_MFE_DEFAULT,
  NEG,
  NEUTRAL,
  POS,
  ReportMeta,
  ScanReport,
  SetupEntry,
  SetupSummary,
  beYear,
  fmtInt,
  fmtPct,
  fmtShortDate,
  formatGenerated,
  isNum,
  openDaysOut,
  returnColor,
} from '@/lib/reportCard';

const PER_PAGE = 20;
const CARD = 'bg-[#13161e] border border-white/[0.07] rounded-xl';
// Points / cumulative line: neutral, never the scan colour — PPBP is red and SEPA green,
// which would read as loss / profit (green/red are kept for returns only).
const CHART_MARK = 'rgba(255,255,255,0.75)';

const SCAN_ROUTE_MAP: Record<string, string> = {
  lekkung_growth: '/lekkung',
  sepa: '/sepa',
  kell: '/kell',
  breakout: '/breakout',
  oneil: '/oneil',
  ppbp: '/scanner',
};

/* ---------- small pieces ---------- */

// "วัดแบบไหน" chip next to every key number.
function Measure({ kind }: { kind: 'setup' | 'dn' }) {
  return (
    <span
      className={`${TS.caption} font-medium px-1.5 py-0.5 rounded border border-white/[0.1] bg-white/[0.04] text-white/55 whitespace-nowrap`}
      title={kind === 'setup' ? 'นับตามไม้: ซื้อวันถัดจากติดสแกน ขายวันที่หลุดสแกนครบ 5 วันทำการ' : 'นับแบบถือตายตัว N วันทำการ ทุกครั้งที่ติดสแกน'}
    >
      {kind === 'setup' ? 'ตามไม้' : 'D+N'}
    </span>
  );
}

function SectionTitle({ children, kind }: { children: React.ReactNode; kind?: 'setup' | 'dn' }) {
  return (
    <h2 className={`${TS.sectionTitle} text-white flex items-center gap-2 flex-wrap`}>
      {children}
      {kind && <Measure kind={kind} />}
    </h2>
  );
}

const Note = ({ children }: { children: React.ReactNode }) => (
  <p className={`${TS.body} text-white/45 leading-relaxed mt-2 ${READABLE}`}>{children}</p>
);

function StatCell({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-2.5 py-2">
      <span className={`${TS.caption} text-white/40 block mb-0.5`}>{label}</span>
      <span className="text-[14px] font-bold tabular-nums block" style={color ? { color } : undefined}>{value}</span>
      {sub && <span className={`${TS.caption} text-white/30 block mt-0.5 tabular-nums`}>{sub}</span>}
    </div>
  );
}

function SetupStatStrip({ s }: { s: SetupEntry }) {
  return (
    <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-3">
      <StatCell label="ซื้อ" value={s.entry_price.toFixed(2)} sub={s.entry_date} color={NEUTRAL} />
      <StatCell label={s.status === 'open' ? 'ล่าสุด' : 'ขาย'} value={s.exit_price.toFixed(2)} sub={s.exit_date} color={NEUTRAL} />
      <StatCell label="ผลตอบแทน" value={fmtPct(s.return_pct)} color={returnColor(s.return_pct)} />
      <StatCell label="ขึ้นสูงสุด (MFE)" value={fmtPct(s.mfe_pct)} color={NEUTRAL} />
      <StatCell label="ลงต่ำสุด (MAE)" value={fmtPct(s.mae_pct)} color={NEUTRAL} />
      <StatCell label="ถือ" value={`${s.holding_days} วัน`} color={NEUTRAL} />
    </div>
  );
}

function countOccurrences(entries: BestWorstEntry[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of entries) counts[e.ticker] = (counts[e.ticker] ?? 0) + 1;
  return counts;
}

function TickerChip({ entry, occurrenceCount }: { entry: BestWorstEntry; occurrenceCount: number }) {
  return (
    <Link
      href={`/stock/${entry.ticker}`}
      className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.07] transition-colors"
    >
      <span className="flex items-center gap-1.5 min-w-0">
        <span className={`${TS.body} font-semibold text-white/80 truncate`}>{entry.ticker}</span>
        {occurrenceCount > 1 && (
          <span className={`${TS.caption} text-white/35 flex-shrink-0`} title={`ติดลิสต์นี้ ${occurrenceCount} ครั้ง คนละวันสัญญาณ`}>
            ×{occurrenceCount}
          </span>
        )}
        <span className={`${TS.caption} text-white/30 tabular-nums flex-shrink-0`}>{fmtShortDate(entry.entry_date)}</span>
      </span>
      <span className={`${TS.body} font-medium tabular-nums flex-shrink-0`} style={{ color: returnColor(entry.return_pct) }}>
        {fmtPct(entry.return_pct)}
      </span>
    </Link>
  );
}

function ExitTag({ s }: { s: SetupEntry }) {
  const reason = s.exit_reason ?? (s.status === 'open' ? 'open' : s.holding_days === 0 ? 'single_day' : 'left_scan');
  const out = openDaysOut(s);
  if (s.excluded_outlier)
    return (
      <span title="ผลเกิน ±40% และมีวันไม่มีการซื้อขายระหว่างถือ ราคาไม่ใช่ราคาที่ซื้อขายได้จริง จึงไม่นับในตัวเลขสรุป" className={`px-2 py-0.5 rounded ${TS.caption} font-semibold bg-[#E24B4A]/10 text-[#f07a79] border border-[#E24B4A]/30 whitespace-nowrap`}>
        ตัดออก: ผิดปกติ
      </span>
    );
  if (reason === 'open' && out > 0)
    return (
      <span title="หลุดสแกนแล้วแต่ยังไม่ครบ 5 วันทำการ ไม้ยังไม่จบ" className={`px-2 py-0.5 rounded ${TS.caption} font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/25 whitespace-nowrap`}>
        หลุดมา {out} วัน
      </span>
    );
  if (reason === 'open')
    return (
      <span className={`px-2 py-0.5 rounded ${TS.caption} font-semibold bg-[#378ADD]/15 text-[#378ADD] border border-[#378ADD]/30 whitespace-nowrap`}>
        ยังถือ
      </span>
    );
  if (reason === 'single_day')
    return (
      <span className={`px-2 py-0.5 rounded ${TS.caption} font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/25 whitespace-nowrap`}>
        ติดสแกนวันเดียว
      </span>
    );
  return (
    <span className={`px-2 py-0.5 rounded ${TS.caption} font-semibold bg-white/[0.05] text-white/50 border border-white/[0.08] whitespace-nowrap`}>
      หลุดสแกน
    </span>
  );
}

/* ---------- sections ---------- */

function StageTable({ sum }: { sum: SetupSummary }) {
  const rows = sum.by_stage;
  if (!rows || rows.length === 0) return null;
  const mx = Math.max(1, ...rows.map(r => Math.abs(r.avg_return_pct ?? 0)));
  return (
    <div className={`${CARD} p-5`}>
      <SectionTitle kind="setup">ผลแยกตาม stage ของหุ้นตอนเข้าซื้อ</SectionTitle>
      <p className={`${TS.body} text-white/45 mt-0.5`}>Market Stage ของหุ้นตัวนั้นในวันเข้าซื้อ เรียงตามลำดับ stage</p>
      <div className="overflow-x-auto mt-3">
        <table className="w-full text-left min-w-[460px]">
          <thead>
            <tr className="border-b border-white/[0.06]">
              {['stage', 'ไม้', 'ผลเฉลี่ย', '', 'กำไร', 'ขึ้นสูงสุดเฉลี่ย'].map((h, i) => (
                <th key={i} className={`px-2 py-2 ${TS.body} font-semibold text-white/35 whitespace-nowrap ${i === 0 || i === 3 ? '' : 'text-right'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {rows.map(r => {
              const v = r.avg_return_pct ?? 0;
              const w = (Math.abs(v) / mx) * 50;
              return (
                <tr key={r.stage}>
                  <td className="px-2 py-2">
                    <span className={`px-1.5 py-0.5 rounded ${TS.caption} ${stageCls(r.stage === 'ไม่มีข้อมูล' ? null : r.stage)}`}>{r.stage}</span>
                  </td>
                  <td className={`px-2 py-2 ${TS.tableCell} text-right tabular-nums text-white/70`}>{fmtInt(r.n)}</td>
                  <td className={`px-2 py-2 ${TS.tableCell} text-right tabular-nums font-medium`} style={{ color: returnColor(r.avg_return_pct) }}>{fmtPct(r.avg_return_pct)}</td>
                  <td className="px-2 py-2 w-[30%]">
                    <div className="relative h-2.5">
                      <div className="absolute left-1/2 -top-1 -bottom-1 w-px bg-white/20" />
                      <div className="absolute top-0 h-2.5 rounded-sm" style={{ left: v >= 0 ? '50%' : `${50 - w}%`, width: `${w}%`, background: v >= 0 ? POS : NEG }} />
                    </div>
                  </td>
                  <td className={`px-2 py-2 ${TS.tableCell} text-right tabular-nums text-white/70`}>{isNum(r.win_rate_pct) ? `${r.win_rate_pct.toFixed(0)}%` : '—'}</td>
                  <td className={`px-2 py-2 ${TS.tableCell} text-right tabular-nums text-white/70`}>{fmtPct(r.avg_mfe_pct)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.some(r => r.n < 10) && <Note>กลุ่มที่มีไม่ถึง 10 ไม้ ตัวเลขยังเชื่อถือไม่ได้</Note>}
      <Note>
        ยังแยกตามสภาวะ SET ทั้งตลาดไม่ได้ เพราะประวัติ stage ของ SET_INDEX มีแค่ ส.ค.–ก.ย. ถ้าอยากได้มุมนี้ ต้องให้ pipeline เก็บ stage ของ SET ทุกวันก่อน
      </Note>
    </div>
  );
}

function HorizonTable({ data }: { data: ScanReport }) {
  const H = ['5', '10', '20'].filter(h => data.horizons[h]);
  if (H.length === 0) return null;
  const cell = (h: string, f: (m: ScanReport['horizons'][string]) => React.ReactNode, color?: (m: ScanReport['horizons'][string]) => string) => {
    const m = data.horizons[h];
    if (!m || !(m.n > 0)) return <td key={h} className={`px-3 py-2 ${TS.tableCell} text-right text-white/30`}>—</td>;
    return (
      <td key={h} className={`px-3 py-2 ${TS.tableCell} text-right tabular-nums`} style={{ color: color ? color(m) : 'rgba(255,255,255,0.7)' }}>
        {f(m)}
      </td>
    );
  };
  const rows: [string, (h: string) => React.ReactNode][] = [
    ['จำนวนครั้ง', h => cell(h, m => fmtInt(m.n))],
    ['ผลเฉลี่ย', h => cell(h, m => fmtPct(m.avg_return_pct), m => returnColor(m.avg_return_pct))],
    ['ค่ากลาง', h => cell(h, m => fmtPct(m.median_return_pct), m => returnColor(m.median_return_pct))],
    ['ไม้ที่กำไร', h => cell(h, m => (isNum(m.win_rate_pct) ? `${m.win_rate_pct.toFixed(0)}%` : '—'))],
    ['SET ช่วงเดียวกัน', h => cell(h, m => fmtPct(m.avg_set_return_pct), m => returnColor(m.avg_set_return_pct))],
    ['ชนะ SET', h => cell(h, m => fmtPct(m.excess_return_pct), m => returnColor(m.excess_return_pct))],
  ];
  return (
    <div className={`${CARD} p-5`}>
      <SectionTitle kind="dn">ถ้าถือตายตัว D+5 / D+10 / D+20</SectionTitle>
      <p className={`${TS.body} text-white/45 mt-0.5`}>อีกวิธีวัด: นับทุกครั้งที่ติดสแกน ถือครบ N วันทำการแล้วขาย ใช้ตัวเลขชุดเดียวกับหน้าแรก</p>
      <div className="overflow-x-auto mt-3">
        <table className="w-full max-w-[720px] text-left">
          <thead>
            <tr className="border-b border-white/[0.06]">
              <th className="px-3 py-2" />
              {H.map(h => <th key={h} className={`px-3 py-2 ${TS.body} font-semibold text-white/35 text-right`}>D+{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {rows.map(([label, render]) => (
              <tr key={label}>
                <td className={`px-3 py-2 ${TS.tableCell} text-white/60 whitespace-nowrap`}>{label}</td>
                {H.map(h => render(h))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Note>
        จำนวนไม้ลดลงเมื่อระยะยาวขึ้น เพราะตัวที่เพิ่งติดสแกนยังถือไม่ครบ N วัน · หุ้นที่หลุดแล้วกลับมาถูกนับใหม่ทุกครั้ง ไม้เดียวกันจึงอาจถูกนับซ้ำ
        · หุ้นไทยขยับทีละช่องราคา จึงมีกรณีราคาเท่าเดิมบ่อย ค่ากลางจึงมักเป็น 0
      </Note>
      <BestWorst data={data} />
    </div>
  );
}

function BestWorst({ data }: { data: ScanReport }) {
  const cols = ['5', '10', '20']
    .map(h => ({ h, m: data.horizons[h] }))
    .filter(x => x.m && ((x.m.best5?.length ?? 0) > 0 || (x.m.worst5?.length ?? 0) > 0));
  if (cols.length === 0) return null;
  return (
    <details className="mt-4 group">
      <summary className={`cursor-pointer ${TS.body} font-semibold text-white/60 hover:text-white/80`}>ดูดีสุด / แย่สุด 5 อันดับ ของแต่ละช่วง (D+N)</summary>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
        {cols.map(({ h, m }) => {
          const best = m.best5 ?? [];
          const worst = m.worst5 ?? [];
          const bc = countOccurrences(best);
          const wc = countOccurrences(worst);
          return (
            <div key={h} className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-3 space-y-3">
              <div className={`${TS.body} font-bold text-white/70`}>D+{h} วันทำการ</div>
              {best.length > 0 && (
                <div>
                  <div className={`${TS.caption} mb-1.5`} style={{ color: POS }}>ดีสุด 5</div>
                  <div className="space-y-1">{best.map(e => <TickerChip key={e.ticker + e.entry_date} entry={e} occurrenceCount={bc[e.ticker]} />)}</div>
                </div>
              )}
              {worst.length > 0 && (
                <div>
                  <div className={`${TS.caption} mb-1.5`} style={{ color: NEG }}>แย่สุด 5</div>
                  <div className="space-y-1">{worst.map(e => <TickerChip key={e.ticker + e.entry_date} entry={e} occurrenceCount={wc[e.ticker]} />)}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </details>
  );
}

/* ---------- รายการไม้ (sort / dir / status in the URL) ---------- */

const STATUSES = { all: 'ทั้งหมด', open: 'ยังถือ', closed: 'ปิดแล้ว' } as const;
type StatusKey = keyof typeof STATUSES;

function Pager({ page, total, count, label, onPage }: { page: number; total: number; count: number; label: string; onPage: (p: number) => void }) {
  if (total <= 1) return null;
  const btn = 'inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition-colors text-white/70';
  return (
    <div className={`flex items-center justify-between px-3 py-2.5 ${CARD} ${TS.body}`}>
      <span className="text-white/45">
        {label} {fmtInt(count)} ไม้ · แสดง {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, count)}
      </span>
      <div className="flex items-center gap-2">
        <button onClick={() => onPage(Math.max(1, page - 1))} disabled={page === 1} className={btn}>
          <ChevronLeft size={13} />
          ก่อนหน้า
        </button>
        <span className="text-white/60 font-medium px-1">{page} / {total}</span>
        <button onClick={() => onPage(Math.min(total, page + 1))} disabled={page === total} className={btn}>
          ถัดไป
          <ChevronRight size={13} />
        </button>
      </div>
    </div>
  );
}

const TH_BASE = `px-3 py-2.5 text-label font-semibold uppercase tracking-wider whitespace-nowrap`;

function SortTh({ label, sortKey, sort, onSort, right, wrap }: {
  label: React.ReactNode; sortKey: SortKey; sort: SortState; onSort: (k: SortKey) => void; right?: boolean; wrap?: boolean;
}) {
  const active = sort.key === sortKey;
  const arrow = active ? (sort.dir === 'asc' ? '▲' : '▼') : '▼';
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`${TH_BASE} ${right ? 'text-right' : 'text-left'} ${wrap ? '!whitespace-normal leading-tight' : ''} ${active ? 'text-white' : 'text-white/35'}`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        title={`เรียงตาม ${SORT_LABELS[sortKey]}`}
        className={`group inline-flex items-center gap-1 uppercase tracking-wider font-semibold rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40 hover:text-white/80 ${right ? 'flex-row-reverse' : ''} ${active ? 'text-white' : ''}`}
      >
        <span>{label}</span>
        <span
          aria-hidden="true"
          className={`text-[9px] leading-none ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-40 group-focus-visible:opacity-40'}`}
        >
          {arrow}
        </span>
      </button>
    </th>
  );
}

function SetupTables({ setups }: { setups: SetupEntry[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rawStatus = searchParams.get('status');
  const rawSort = searchParams.get('sort');
  const rawDir = searchParams.get('dir');
  const sort = useMemo(() => parseSort(rawSort, rawDir), [rawSort, rawDir]);
  const status: StatusKey = rawStatus && rawStatus in STATUSES ? (rawStatus as StatusKey) : 'all';

  const [openPage, setOpenPage] = useState(1);
  const [closedPage, setClosedPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  useEffect(() => {
    setOpenPage(1);
    setClosedPage(1);
  }, [sort.key, sort.dir, status]);

  const replaceUrl = (params: URLSearchParams) => {
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const setStatus = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'all') params.delete('status');
    else params.set('status', value);
    replaceUrl(params);
  };
  // The single sort state: header click and dropdown both end up here.
  const setSort = (next: SortState) => {
    const params = new URLSearchParams(searchParams.toString());
    const p = sortParams(next);
    if (p.sort) params.set('sort', p.sort); else params.delete('sort');
    if (p.dir) params.set('dir', p.dir); else params.delete('dir');
    replaceUrl(params);
  };
  const onHeaderSort = (key: SortKey) => setSort(nextSort(sort, key));

  const showStage = setups.some(s => s.stage_at_entry != null);

  const tickerTotal = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of setups) c[s.ticker] = (c[s.ticker] ?? 0) + 1;
    return c;
  }, [setups]);
  const seqOf = useMemo(() => {
    const m = new Map<SetupEntry, number>();
    const g: Record<string, SetupEntry[]> = {};
    for (const s of setups) (g[s.ticker] ??= []).push(s);
    for (const t in g) [...g[t]].sort((a, b) => a.entry_date.localeCompare(b.entry_date)).forEach((s, i) => m.set(s, i + 1));
    return m;
  }, [setups]);

  const openList = useMemo(() => sortSetups(setups.filter(s => s.status === 'open'), sort), [setups, sort]);
  const closedList = useMemo(() => sortSetups(setups.filter(s => s.status === 'closed'), sort), [setups, sort]);

  const nCols = showStage ? 9 : 8;
  const head = (exitLabel: string) => (
    <thead className="border-b border-white/[0.06] bg-white/[0.015]">
      <tr>
        <SortTh label="หุ้น" sortKey="ticker" sort={sort} onSort={onHeaderSort} />
        <SortTh label={<>ซื้อ<br />(วันถัดจากติดสแกน)</>} sortKey="entry" sort={sort} onSort={onHeaderSort} wrap />
        <SortTh label={exitLabel} sortKey="exit" sort={sort} onSort={onHeaderSort} />
        <SortTh label="ถือ (วัน)" sortKey="hold" sort={sort} onSort={onHeaderSort} right />
        <SortTh label="ผลตอบแทน" sortKey="ret" sort={sort} onSort={onHeaderSort} right />
        <SortTh label="ขึ้นสูงสุด" sortKey="mfe" sort={sort} onSort={onHeaderSort} right />
        <SortTh label="ลงต่ำสุด" sortKey="mae" sort={sort} onSort={onHeaderSort} right />
        {showStage && <SortTh label="stage ตอนเข้า" sortKey="stage" sort={sort} onSort={onHeaderSort} />}
        <SortTh label="ปิดเพราะ" sortKey="reason" sort={sort} onSort={onHeaderSort} />
      </tr>
    </thead>
  );

  const row = (s: SetupEntry, idx: number) => {
    const isMulti = (tickerTotal[s.ticker] ?? 1) > 1;
    const id = `${s.ticker}-${s.entry_date}`;
    const isOpen = expanded === id;
    return (
      <React.Fragment key={`${id}-${idx}`}>
        <tr
          onClick={() => setExpanded(p => (p === id ? null : id))}
          className={`border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors cursor-pointer ${isOpen ? 'bg-white/[0.04]' : ''} ${isMulti ? 'border-l-2 border-l-[#378ADD]/50' : ''}`}
        >
          <Td>
            <Link href={`/stock/${s.ticker}`} onClick={e => e.stopPropagation()} className="font-bold text-white hover:text-emerald-400 transition-colors inline-flex items-center gap-1.5">
              <span>{s.ticker}</span>
              {isMulti && (
                <span className={`${TS.caption} text-[#378ADD] font-medium bg-[#378ADD]/10 px-1 rounded border border-[#378ADD]/20`} title="ไม้ครั้งที่เท่าไหร่ของหุ้นตัวนี้ในสแกนนี้">
                  #{seqOf.get(s) ?? 1}
                </span>
              )}
            </Link>
          </Td>
          <Td mono>
            <span className="text-white/80 whitespace-nowrap" title={s.entry_date}>{fmtShortDate(s.entry_date)}</span>
            <span className="text-white/35 ml-1.5">@{s.entry_price.toFixed(2)}</span>
          </Td>
          <Td mono>
            <span className="text-white/80 whitespace-nowrap" title={s.exit_date}>{fmtShortDate(s.exit_date)}</span>
            <span className="text-white/35 ml-1.5">@{s.exit_price.toFixed(2)}</span>
          </Td>
          <Td right mono>{s.holding_days}</Td>
          <Td right mono className="font-semibold">
            <span style={{ color: returnColor(s.return_pct) }}>{fmtPct(s.return_pct)}</span>
          </Td>
          <Td right mono className="text-white/55">{fmtPct(s.mfe_pct)}</Td>
          <Td right mono className="text-white/55">{fmtPct(s.mae_pct)}</Td>
          {showStage && (
            <Td>
              {s.stage_at_entry ? (
                <span className={`px-1.5 py-0.5 rounded ${TS.caption} whitespace-nowrap ${stageCls(s.stage_at_entry === 'ไม่มีข้อมูล' ? null : s.stage_at_entry)}`}>{s.stage_at_entry}</span>
              ) : (
                <span className="text-white/20">—</span>
              )}
            </Td>
          )}
          <Td><ExitTag s={s} /></Td>
        </tr>
        {isOpen && (
          <tr className="bg-black/20 border-b border-white/[0.04]">
            <td colSpan={nCols} className="p-3 md:p-4">
              <div className={`${CARD} p-4 m-1`}>
                <SetupStatStrip s={s} />
                {s.holding_days === 0 ? (
                  <div className={`${TS.body} text-white/50 py-6 text-center`}>เพิ่งซื้อวันล่าสุด — ยังไม่มีช่วงราคาให้แสดง</div>
                ) : (
                  <ReportCardChart
                    ticker={s.ticker}
                    entryDate={s.entry_date}
                    entryPrice={s.entry_price}
                    exitDate={s.exit_date}
                    exitPrice={s.exit_price}
                    returnPct={s.return_pct}
                    isOpen={s.status === 'open'}
                  />
                )}
              </div>
            </td>
          </tr>
        )}
      </React.Fragment>
    );
  };

  const block = (title: string, list: SetupEntry[], page: number, setPage: (p: number) => void, exitLabel: string, pagerLabel: string, empty: string) => {
    const total = Math.max(1, Math.ceil(list.length / PER_PAGE));
    const cur = Math.min(page, total);
    const rows = list.slice((cur - 1) * PER_PAGE, cur * PER_PAGE);
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className={`${TS.sectionTitle} text-white`}>{title} ({fmtInt(list.length)})</h3>
          <span className={`${TS.caption} text-white/40`}>หน้า {cur} / {total}</span>
        </div>
        <TableWrap>
          {head(exitLabel)}
          <tbody>
            {list.length === 0 ? (
              <tr><td colSpan={nCols} className={`px-4 py-8 text-center text-white/35 ${TS.body}`}>{empty}</td></tr>
            ) : (
              rows.map((s, i) => row(s, i))
            )}
          </tbody>
        </TableWrap>
        <Pager page={cur} total={total} count={list.length} label={pagerLabel} onPage={setPage} />
      </div>
    );
  };

  const preset = presetFor(sort);
  const sel = `bg-[#13161e] border border-white/[0.1] rounded-lg px-2 py-1.5 ${TS.body} text-white/85`;
  return (
    <div className="space-y-4">
      <div className={`flex items-center gap-3 flex-wrap ${TS.body} text-white/55`}>
        <label className="inline-flex items-center gap-2">
          เรียงตาม
          <select
            className={sel}
            value={preset ? preset.value : 'column'}
            onChange={e => {
              const p = PRESETS.find(x => x.value === e.target.value);
              if (p) setSort(p.sort);
            }}
          >
            {!preset && <option value="column">{`ตามคอลัมน์: ${SORT_LABELS[sort.key]} (${dirLabel(sort)})`}</option>}
            {PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </label>
        <label className="inline-flex items-center gap-2">
          แสดง
          <select className={sel} value={status} onChange={e => setStatus(e.target.value)}>
            {(Object.keys(STATUSES) as StatusKey[]).map(k => <option key={k} value={k}>{STATUSES[k]}</option>)}
          </select>
        </label>
      </div>
      <p className={`${TS.caption} text-white/45 px-1 -mt-1`} aria-live="polite">
        เรียงตาม <b className="text-white/75 font-semibold">{SORT_LABELS[sort.key]}</b> {dirLabel(sort)}
      </p>
      {status !== 'closed' && openList.length > 0 &&
        block('ยังถืออยู่', openList, openPage, setOpenPage, 'ล่าสุด', 'ยังถือ', 'ไม่มีไม้ที่ยังถือ')}
      {status !== 'open' &&
        block('ปิดแล้ว', closedList, closedPage, setClosedPage, 'ขาย', 'ปิดแล้ว', 'ยังไม่มีไม้ที่ปิดแล้วในสแกนนี้')}
      {status === 'open' && openList.length === 0 && (
        <p className={`${TS.body} text-white/40 px-1`}>ตอนนี้ไม่มีไม้ที่ยังถือ</p>
      )}
      <Note>
        ขึ้นสูงสุด (MFE) / ลงต่ำสุด (MAE) = ราคาสูงสุด/ต่ำสุดระหว่างถือ เทียบราคาซื้อ นับตั้งแต่วันหลังวันซื้อถึงวันขาย (ไม่นับระหว่างวันของวันซื้อ)
        · กดแถวเพื่อดูกราฟราคาช่วงถือของไม้นั้น
      </Note>
    </div>
  );
}

/* ---------- page ---------- */

export default function ReportCardDetailClient({
  scanKey,
  scanLabel,
  scanColor,
  scanDesc,
  scanData,
  meta,
}: {
  scanKey: string;
  scanLabel: string;
  scanColor: string;
  scanDesc?: string;
  scanData: ScanReport;
  meta: ReportMeta;
}) {
  const setups = scanData.setups ?? [];
  const sum: SetupSummary = scanData.setup_summary ?? {
    n_closed: 0, n_open: 0, avg_return_pct: null, win_rate_pct: null,
    avg_holding_days: null, avg_mfe_pct: null, avg_mae_pct: null,
  };
  const a = meta.assumptions ?? {};
  const firstDate = scanData.scan_range?.first_date ?? meta.scan_range?.first_date ?? meta.price_range?.first_signal_date ?? meta.history_range.first_date;
  const lastDate = scanData.scan_range?.last_date ?? meta.scan_range?.last_date ?? meta.history_range.last_date;
  const hasHist = Array.isArray(sum.hist) && Array.isArray(sum.hist_labels) && sum.hist.length === sum.hist_labels.length && sum.hist.some(c => c > 0);
  const hasScatter = Array.isArray(sum.scatter) && sum.scatter.length > 0;
  const hasMonthly = Array.isArray(sum.monthly) && sum.monthly.length > 0;
  const hasStage = Array.isArray(sum.by_stage) && sum.by_stage.length > 0;

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center gap-4 flex-wrap">
        <Link href="/report-card" className={`inline-flex items-center gap-1 ${TS.body} text-white/45 hover:text-white/75 transition-colors`}>
          <ChevronLeft size={14} />
          กลับ Report Card
        </Link>
        {SCAN_ROUTE_MAP[scanKey] && (
          <Link href={SCAN_ROUTE_MAP[scanKey]} className={`inline-flex items-center gap-1 ${TS.body} text-white/45 hover:text-white/75 transition-colors`}>
            <ChevronLeft size={14} />
            ไปหน้าสแกน {scanLabel}
          </Link>
        )}
      </div>

      {/* 1. หัว */}
      <div className="flex items-stretch gap-3">
        <div className="w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: scanColor }} />
        <div>
          <h1 className={`${TS.pageTitle} text-white`}>{scanLabel}</h1>
          {scanDesc && <p className={`${TS.tableCell} text-white/75 mt-1 ${READABLE}`}>{scanDesc}</p>}
          <p className={`${TS.body} text-white/45 mt-1`}>
            ข้อมูลสแกน {fmtShortDate(firstDate)}
            {beYear(firstDate) !== beYear(lastDate) ? ` ${beYear(firstDate)}` : ''} – {fmtShortDate(lastDate)} {beYear(lastDate)}
            {' · '}{fmtInt(sum.n_closed)} ไม้ที่ปิดแล้ว · ยังถือ {fmtInt(sum.n_open)}
            {meta.generated_at && <> · คำนวณล่าสุด {formatGenerated(meta.generated_at)}</>}
          </p>
        </div>
      </div>

      {/* 2-6. สรุปผล · 3 คำถาม · ถืออะไรอยู่ / ปิดแล้ว · ถ้าเปลี่ยนวิธีขาย · วิธีวัด */}
      <ReportCardTop scan={scanData} sum={sum} setups={setups} color={scanColor} />

      {/* 7. กราฟจุด + การกระจาย */}
      {(hasScatter || hasHist) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {hasScatter && (
            <div className={`${CARD} p-5 min-w-0`}>
              <SectionTitle kind="setup">ขึ้นไปสูงสุดเท่าไหร่ เทียบกับตอนขาย</SectionTitle>
              <p className={`${TS.body} text-white/45 mt-0.5 mb-2`}>
                แต่ละจุด = 1 ไม้ที่ปิดแล้ว{sum.scatter_sampled ? ` (สุ่มมา ${fmtInt(sum.scatter!.length)} ไม้)` : ''}
              </p>
              <MfeScatter points={sum.scatter!} color={CHART_MARK} mfeLine={sum.giveback_mfe_pct ?? GIVEBACK_MFE_DEFAULT} />
              <Note>จุดที่อยู่ขวาล่าง = เคยกำไรดีแต่ขายขาดทุน ถ้าจุดกองตรงนี้มาก แปลว่าควรแก้ที่จังหวะขาย ไม่ใช่ที่การเลือกหุ้น</Note>
            </div>
          )}
          {hasHist && (
            <div className={`${CARD} p-5 min-w-0`}>
              <SectionTitle kind="setup">ผลตอบแทนกระจายตัวยังไง</SectionTitle>
              <p className={`${TS.body} text-white/45 mt-0.5 mb-2`}>จำนวนไม้ในแต่ละช่วงผลตอบแทน (%)</p>
              <ReturnHistogram counts={sum.hist!} labels={sum.hist_labels!} />
              <Note>ค่าเฉลี่ยถูกไม้ใหญ่ไม้เดียวดึงได้ กราฟนี้ให้เห็นว่าไม้ส่วนใหญ่จบตรงไหน</Note>
            </div>
          )}
        </div>
      )}

      {/* 8. stage + รายเดือน */}
      {(hasStage || hasMonthly) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {hasStage && <StageTable sum={sum} />}
          {hasMonthly && (
            <div className={`${CARD} p-5 min-w-0`}>
              <SectionTitle kind="setup">ผลรายเดือน</SectionTitle>
              <p className={`${TS.body} text-white/45 mt-0.5 mb-2`}>แท่ง = ผลเฉลี่ยต่อไม้ของไม้ที่เข้าในเดือนนั้น · เส้น = ผลรวมสะสม (% ต่อไม้ รวมกัน)</p>
              <MonthlyChart months={sum.monthly!} color={CHART_MARK} />
              <Note>ผลรวมสะสม = เอาผล % ของทุกไม้มาบวกกัน (ไม่ทบต้น ไม่คิดขนาดไม้) ใช้ดูทิศทางว่าสแกนดีขึ้นหรือแย่ลงตามเวลา · เดือนที่มีไม้น้อยยังเชื่อถือไม่ได้</Note>
            </div>
          )}
        </div>
      )}

      {/* 9. D+5/10/20 */}
      <HorizonTable data={scanData} />

      {/* 10. รายการไม้ */}
      <div className="pt-1">
        <div className="mb-3 px-1">
          <SectionTitle kind="setup">รายการไม้</SectionTitle>
        </div>
        <Suspense fallback={null}>
          <SetupTables setups={setups} />
        </Suspense>
      </div>

      {/* 11. คำศัพท์ */}
      <details className={`${CARD} p-5`}>
        <summary className={`cursor-pointer ${TS.sectionTitle} text-white/80`}>คำศัพท์และวิธีคำนวณ</summary>
        <dl className={`grid grid-cols-1 md:grid-cols-[max-content_1fr] gap-x-5 gap-y-2 mt-4 ${TS.body}`}>
          {(
            [
              ['ไม้ (setup)', 'ช่วงที่หุ้นอยู่ในสแกนต่อเนื่อง หลุดไม่ถึง 5 วันทำการยังนับเป็นไม้เดิม หลุดครบ 5 วันจึงปิดไม้และขายที่ราคาปิดวันนั้น'],
              ['ครั้งที่ติดสแกน (pick)', a.dedup],
              ['ราคาซื้อ', a.entry_price],
              ['D+N', a.horizons_measured_from],
              ['ชนะ SET', a.excess_return],
              ['ไม่ครบ D+N', a.horizons_excluded_if_incomplete],
              ['เสมอ / win rate', a.win_flat_loss],
              ['ได้ ÷ เสีย', 'กำไรเฉลี่ยของไม้ที่ชนะ ÷ ขาดทุนเฉลี่ยของไม้ที่แพ้ (ไม่คิดไม้เสมอ) ถ้ามากกว่า 1 แปลว่าชนะทีได้มากกว่าแพ้ทีเสีย'],
              ['ตัดตัวผิดปกติ', a.outlier_guard ? `${a.outlier_guard} ตัวที่ผลเกิน 40% แต่ยังซื้อขายทุกวัน ไม่ถูกตัด` : undefined],
              ['วันทำการ', a.trading_days],
              ['stage ตอนเข้า', 'Market Stage ของหุ้นตัวนั้นในวันซื้อ ถ้าวันนั้นยังไม่มีประวัติ stage จะแสดง "ไม่มีข้อมูล"'],
              ['#2 #3 หลังชื่อหุ้น', 'ไม้ครั้งที่เท่าไหร่ของหุ้นตัวนั้นในสแกนนี้'],
            ] as [string, string | undefined][]
          )
            .filter(([, v]) => !!v)
            .map(([k, v]) => (
              <React.Fragment key={k}>
                <dt className="text-white font-medium">{k}</dt>
                <dd className={`text-white/60 leading-relaxed ${READABLE}`}>{v}</dd>
              </React.Fragment>
            ))}
        </dl>
        <p className={`${TS.body} text-white/50 font-medium pt-3 mt-4 border-t border-white/[0.06] ${READABLE}`}>
          ผลตอบแทนย้อนหลังไม่ได้การันตีผลลัพธ์ในอนาคต ใช้เพื่อประกอบการตัดสินใจเท่านั้น ไม่ใช่คำแนะนำการลงทุน
        </p>
      </details>
    </div>
  );
}
