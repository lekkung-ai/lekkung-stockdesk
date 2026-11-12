'use client';

import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import Link from 'next/link';
import { RefreshCw, Search, ChevronDown, ChevronUp } from 'lucide-react';
import { bangkokParts, bangkokHHMM, bangkokDateKey } from '@/lib/utils';
import { TS } from '@/lib/typeScale';
import TableSkeleton from '@/components/TableSkeleton';
import FullWidthPage from '@/components/FullWidthPage';
import { BUCKET_ORDER, BUCKET_LABEL, BUCKET_COLOR, type EarningsBucket } from '@/lib/earningsBucket';
import {
  fixThaiText, reasonPreview, isAccelerating, isPead, peadRanked, PEAD_MIN_YOY, PEAD_MIN_D2_PCT, PEAD_MIN_ADTV_MB,
  priorQuarterImproved, pricePath, compareProfit, type ProfitChange, type PricePoint,
} from '@/lib/earningsMetrics';
import { fmtMoney, pageBucket, seasonCounts } from '@/lib/earningsView';
import {
  SCAN_META, STAGE_COLORS, LOW_LIQUIDITY_ADTV, peadWarnings, groupLabel, type PeadExtra,
} from '@/lib/peadExtras';
import {
  parseView, withView, groupByDay, summarizeDay, announceDay, dayLabel,
  type EarningsView, type DaySummary,
} from '@/lib/earningsDays';
import {
  isLiquid, sectorBoard, SECTOR_MIN, type SectorScope, type SectorRow,
} from '@/lib/earningsBoard';
import type { EarningsFeed, EarningsAnnouncement } from '@/app/api/earnings/route';

// ── Formatting ───────────────────────────────────────────────────────────────

const UP = '#1D9E75';
const ACC_GREEN = '#6ee7b7'; // ⚡ เร่งตัว = good news (emerald-300, same as its badge)
const DOWN = '#E24B4A';

const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

// The page's own wording for the 6 buckets - loss_worse reads "ขาดทุนหนักขึ้น" here
// (the shared BUCKET_LABEL used by /calendar and /stock stays as it is).
const TAB_LABEL: Record<EarningsBucket, string> = { ...BUCKET_LABEL, loss_worse: 'ขาดทุนหนักขึ้น' };
/** Day cards in layer 1: the newest 14 days that have a filing. */
const DAY_STRIP = 14;

function addDaysISO(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function mondayOf(iso: string): string {
  const day = new Date(iso + 'T00:00:00Z').getUTCDay(); // 0=Sun..6=Sat
  return addDaysISO(iso, day === 0 ? -6 : 1 - day);
}
// Predicted dates land on whatever weekday the filing did last year - a
// weekend one rolls forward to Monday for display.
function rollToWeekday(iso: string): string {
  const day = new Date(iso + 'T00:00:00Z').getUTCDay();
  if (day === 6) return addDaysISO(iso, 2);
  if (day === 0) return addDaysISO(iso, 1);
  return iso;
}
function shortDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const p = bangkokParts(d);
  return `${p.day} ${MONTHS[p.month - 1]} ${bangkokHHMM(d)}`;
}
function fullDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const p = bangkokParts(d);
  return `${p.day} ${MONTHS[p.month - 1]} ${p.year + 543} ${bangkokHHMM(d)} น.`;
}

function Pct({ v, digits = 1, cap = true }: { v: number | null | undefined; digits?: number; cap?: boolean }) {
  if (v == null || !Number.isFinite(v)) return <span className="text-meta">—</span>;
  const real = `${v >= 0 ? '+' : ''}${v.toFixed(digits)}%`;
  // cap at ±1000 - a tiny base blows the % up; the real figure stays in the tooltip
  const text = cap && v > 1000 ? '>+1000%' : cap && v < -1000 ? '<-1000%' : real;
  return <span className="tabular-nums" style={{ color: v >= 0 ? UP : DOWN }} title={real}>{text}</span>;
}

function Wait({ title }: { title?: string }) {
  return <span className="text-meta" title={title ?? 'ยังไม่ครบวันทำการ'}>รอ</span>;
}

function Tag({ children, cls, title }: { children: React.ReactNode; cls: string; title?: string }) {
  return <span title={title} className={`inline-block text-[12px] leading-5 px-2 rounded-full font-medium whitespace-nowrap ${cls}`}>{children}</span>;
}
const TAG_TURN = 'text-sky-300 bg-sky-400/10';
const TAG_LOSS = 'text-rose-300 bg-rose-500/10';
const TAG_ACC = 'text-amber-300 bg-amber-400/10';

function reasonOf(a: EarningsAnnouncement): string {
  return a.reason ? fixThaiText(a.reason) : '';
}
function rowKey(a: EarningsAnnouncement): string {
  return a.f45Url || `${a.ticker}|${a.announceDate}`;
}

function parseQuarterScore(q: string): number {
  const year = parseInt(q.match(/\d{4}/)?.[0] ?? '0', 10);
  const qm = q.match(/ไตรมาส\s*(\d)/);
  const w = qm ? parseInt(qm[1], 10) : (q.includes('ประจำปี') || q.includes('12 เดือน')) ? 0.5 : 0;
  return year * 10 + w;
}

// ── Price chart (5 days before → 5 days after) ─────────────────────────────

function PriceChart({ a, w, h, label = true }: { a: EarningsAnnouncement; w: number; h: number; label?: boolean }) {
  const { pre, post } = pricePath(a);
  if (!post.length) return <span className="text-meta text-[13px]">ยังไม่มีราคาหลังงบ</span>;
  const ys = [...pre, ...post].map(p => p.y).concat(0);
  const lo = Math.min(...ys) - 1;
  const hi = Math.max(...ys) + 1;
  const X = (x: number) => 4 + ((x + 5) / 10) * (w - 8);
  const Y = (y: number) => h - 4 - ((y - lo) / (hi - lo)) * (h - 8);
  const line = (pts: { x: number; y: number }[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)} ${Y(p.y).toFixed(1)}`).join('');
  const last = post[post.length - 1];
  const col = last.y >= 0 ? UP : DOWN;
  const lastPre = pre[pre.length - 1];
  const hasD5 = post.some(p => p.x === 5);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="block max-w-full" role="img"
      aria-label={`${a.ticker} ราคาก่อนและหลังประกาศงบ`}>
      <line x1={4} x2={w - 4} y1={Y(0)} y2={Y(0)} stroke="rgba(255,255,255,0.14)" strokeDasharray="2 3" />
      <line x1={X(-0.5)} x2={X(-0.5)} y1={2} y2={h - 2} stroke="rgba(91,147,255,0.45)" />
      {pre.length > 1 && <path d={line(pre)} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={1.5} />}
      <path d={line([lastPre, ...post])} fill="none" stroke={col} strokeWidth={2} />
      {post.filter(p => [0, 1, 2, 5].includes(p.x)).map(p => (
        <circle key={p.x} cx={X(p.x)} cy={Y(p.y)} r={2.5} fill={col} />
      ))}
      {label && !hasD5 && w >= 200 && (
        <text x={Math.min(X(last.x) + 6, w - 44)} y={Math.min(Y(last.y) + 4, h - 3)} fontSize={11} fill="rgba(255,255,255,0.45)">รอ D+5</text>
      )}
    </svg>
  );
}

// ── Header stats ─────────────────────────────────────────────────────────────

function Stat({ k, children, color, note }: { k: string; children: React.ReactNode; color?: string; note?: string }) {
  return (
    <div>
      <div className="text-[12px] md:text-[13px] text-meta mb-0.5 whitespace-nowrap">{k}</div>
      <div className="text-[26px] md:text-[32px] font-bold leading-tight tabular-nums whitespace-nowrap" style={{ color }}>{children}</div>
      {note && <div className="text-[12px] text-meta whitespace-nowrap">{note}</div>}
    </div>
  );
}

function SeasonStats({ rows, extras }: { rows: EarningsAnnouncement[]; extras: Record<string, PeadExtra> | undefined }) {
  // "ประกาศแล้ว" = every filing; the improved/worse split and its % leave out the
  // filings with no profit figure at all (funds / REITs) - they have nothing to compare.
  const { n, noProfit, base, up, down: dn, upPct } = seasonCounts(rows);
  const acc = rows.filter(isAccelerating).length;
  const liquid = rows.filter(a => isLiquid(extras?.[a.ticker]?.adtv)).length;
  // Last quarter, same companies: of those with back-to-back figures, how many improved then.
  const prev = rows.map(priorQuarterImproved).filter((v): v is boolean => v != null);
  const prevPct = prev.length ? Math.round((prev.filter(Boolean).length / prev.length) * 100) : null;

  return (
    <div>
      <div className="flex flex-wrap gap-x-8 md:gap-x-10 gap-y-3 items-end">
        <Stat k="ประกาศแล้ว" note={noProfit ? `ไม่มีข้อมูลกำไร ${noProfit}` : undefined}>{n}</Stat>
        <Stat k="กำไรดีขึ้น" color={UP}>
          {up}<span className="text-[13px] md:text-[15px] font-medium text-meta ml-1">{upPct}%</span>
        </Stat>
        <Stat k="กำไรแย่ลง" color={DOWN}>{dn}</Stat>
        <Stat k="กำไรเร่งตัว" color={ACC_GREEN}>{acc}</Stat>
        <Stat k={`ซื้อขาย ≥ ${PEAD_MIN_ADTV_MB} ล./วัน`}>
          {liquid}<span className="text-[13px] md:text-[15px] font-medium text-meta ml-1">จาก {n}</span>
        </Stat>
      </div>
      <div className="mt-3.5">
        <div className="h-1.5 rounded-full bg-white/[0.06] flex overflow-hidden">
          <i style={{ width: `${base ? (up / base) * 100 : 0}%`, background: UP }} />
          <i style={{ width: `${base ? ((base - up - dn) / base) * 100 : 0}%`, background: BUCKET_COLOR.no_base }} />
          <i style={{ width: `${base ? (dn / base) * 100 : 0}%`, background: DOWN, opacity: 0.8 }} />
        </div>
        <div className="flex justify-between text-[12px] text-meta mt-1">
          <span>สัดส่วนบริษัทที่กำไรดีขึ้น (กำไรโต · พลิกกำไร · ขาดทุนลดลง){noProfit ? ` · จาก ${base} บริษัทที่มีข้อมูลกำไร` : ''}</span>
          <span title={prevPct != null ? `บริษัทชุดเดียวกัน ${prev.length} แห่งที่มีงบไตรมาสก่อนให้เทียบ` : 'ยังไม่มีข้อมูลไตรมาสก่อน'}>
            ไตรมาสก่อน {prevPct != null ? `${prevPct}%` : '—'}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Layer 1: day cards + "รออีก N บริษัท" + sector box ──────────────────────

/** Companies still expected this week (Mon-Fri): predicted dates from today on, minus
 *  every ticker already filed or confirmed. */
function waitingThisWeek(feed: EarningsFeed, today: string): number {
  const friday = addDaysISO(mondayOf(today), 4);
  const known = new Set(feed.announcements.map(a => a.ticker));
  for (const c of feed.calendar) if (c.status === 'confirmed') known.add(c.ticker);
  const seen = new Set<string>();
  for (const c of feed.calendar) {
    if (c.status !== 'predicted' || known.has(c.ticker) || seen.has(c.ticker)) continue;
    const raw = c.date.slice(0, 10);
    if (raw < today) continue;
    if (rollToWeekday(raw) <= friday) seen.add(c.ticker);
  }
  return seen.size;
}

const PANEL = 'bg-[#13161e] border border-white/[0.07] rounded-xl p-3.5 md:px-[18px] md:py-4 min-w-0';
const SEG_BTN = (on: boolean) => `text-[13px] px-3 py-1 whitespace-nowrap ${on ? 'bg-[#1b2640] text-[#dbe7ff]' : 'text-meta hover:text-white/80'}`;

/** Thin bar split by bucket (BUCKET_ORDER), widths = share of `n`. */
function CountsBar({ counts, n, className }: { counts: Partial<Record<EarningsBucket, number>>; n: number; className: string }) {
  return (
    <span className={`flex overflow-hidden rounded-full bg-white/[0.06] ${className}`}>
      {BUCKET_ORDER.map(k => counts[k] ? (
        <i key={k} className="block h-full" style={{ width: `${(counts[k]! / n) * 100}%`, background: BUCKET_COLOR[k] }} />
      ) : null)}
    </span>
  );
}

/** The newest DAY_STRIP days with a filing - the page's "วันที่กำลังดู" picker. */
function DayStrip({ groups, selected, onPick }: { groups: { day: string; s: DaySummary }[]; selected: string; onPick: (day: string) => void }) {
  if (!groups.length) return null;
  return (
    <div className="flex gap-2 overflow-x-auto pb-1.5 [scrollbar-width:thin]" role="group" aria-label="เลือกวันประกาศ">
      {groups.slice(0, DAY_STRIP).map(({ day, s }) => {
        const on = day === selected;
        return (
          <button key={day} type="button" onClick={() => onPick(day)} aria-pressed={on}
            title={BUCKET_ORDER.filter(k => s.counts[k]).map(k => `${TAB_LABEL[k]} ${s.counts[k]}`).join(' · ')}
            className={`flex-none min-w-[92px] text-left border rounded-[10px] px-2.5 py-1.5 ${
              on ? 'border-[#5B93FF] bg-[#172038]' : 'bg-[#181c26] border-white/[0.07] hover:border-white/20'}`}>
            <span className="block text-[12px] text-meta whitespace-nowrap">{dayLabel(day)}</span>
            <span className="block text-[16px] font-semibold text-ink tabular-nums">{s.n} <span className="text-[12px] font-normal text-meta">บริษัท</span></span>
            <CountsBar counts={s.counts} n={s.n} className="h-1 mt-1" />
          </button>
        );
      })}
    </div>
  );
}

function SectorList({ title, rows }: { title: string; rows: SectorRow[] }) {
  return (
    <div className="min-w-0">
      <h3 className="text-[12.5px] font-medium text-meta mb-1">{title}</h3>
      {rows.length ? rows.map(x => (
        <div key={x.group} className="py-1">
          <div className="grid grid-cols-[minmax(0,1fr)_34px_46px] gap-2 items-center text-[13.5px]">
            <span className="truncate text-white/85" title={x.group}>{x.group}</span>
            <span className="text-right text-[12px] text-meta tabular-nums" title={`${x.n} บริษัทที่มีฐานเทียบ`}>{x.n}</span>
            <span className="text-right font-semibold tabular-nums" style={{ color: x.pct >= 50 ? UP : DOWN }}>{x.pct}%</span>
          </div>
          <CountsBar counts={x.counts} n={x.n} className="h-[3px] mt-0.5" />
        </div>
      )) : <span className="text-[13px] text-meta">—</span>}
    </div>
  );
}

/** กลุ่มไหนงบดี / แย่: subsector (mai → "<sector> (mai)"), % improved of the companies
 *  with a base, for the selected day or the whole quarter. */
function SectorBox({ rows, day, scope, onScope }: {
  rows: EarningsAnnouncement[]; day: string; scope: SectorScope; onScope: (s: SectorScope) => void;
}) {
  const minN = SECTOR_MIN[scope];
  const { best, worst } = useMemo(
    () => sectorBoard(scope === 'day' ? rows.filter(a => announceDay(a) === day) : rows, minN),
    [rows, day, scope, minN]);
  return (
    <section className={PANEL} aria-label="กลุ่มไหนงบดี / แย่">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[16px] font-semibold text-ink">กลุ่มไหนงบดี / แย่</h2>
        <span className="inline-flex border border-white/[0.12] rounded-lg overflow-hidden" role="group" aria-label="ช่วงที่สรุป">
          <button type="button" aria-pressed={scope === 'day'} onClick={() => onScope('day')} className={SEG_BTN(scope === 'day')}>{day ? dayLabel(day) : 'วันนี้'}</button>
          <button type="button" aria-pressed={scope === 'q'} onClick={() => onScope('q')} className={SEG_BTN(scope === 'q')}>ทั้งไตรมาส</button>
        </span>
      </div>
      <p className="text-[12.5px] text-meta mt-1">% บริษัทที่กำไรดีขึ้นเทียบปีก่อน · ไม่นับบริษัทที่ไม่มีฐานเทียบ · เฉพาะกลุ่มที่มี {minN} บริษัทขึ้นไป</p>
      {best.length ? (
        <div className="grid grid-cols-1 min-[480px]:grid-cols-2 gap-x-5 gap-y-3 mt-2.5">
          <SectorList title="งบดีสุด" rows={best} />
          <SectorList title="งบแย่สุด" rows={worst} />
        </div>
      ) : (
        <p className="text-[13.5px] text-meta mt-3">
          วันนี้มีบริษัทไม่พอจะสรุปเป็นกลุ่ม ลองดู{' '}
          <button type="button" onClick={() => onScope('q')} className="text-[#5B93FF] hover:text-blue-300">ทั้งไตรมาส</button>
        </p>
      )}
    </section>
  );
}

// ── PEAD: "ราคาวิ่งต่อหลังงบ" top 5 ─────────────────────────────────────────

const PEAD_VIEW_KEY = 'earnings.peadView';

/** The PEAD rule in words - numbers come from the constants in earningsMetrics.ts. */
const PEAD_CRITERIA = `กำไรโต ≥ ${PEAD_MIN_YOY}% หรือพลิกกำไร และราคา +2 วันหลังงบ ≥ +${PEAD_MIN_D2_PCT}% และสภาพคล่อง ≥ ${PEAD_MIN_ADTV_MB} ล./วัน`;
type PeadView = 'table' | 'card';

function D({ v, bold }: { v: number | null | undefined; bold?: boolean }) {
  if (v == null) return <Wait />;
  return <span className={bold ? 'font-bold' : 'font-semibold'}><Pct v={v} /></span>;
}

const TAG_AMBER = 'text-orange-200 bg-orange-300/10';
const TAG_WARN_RED = 'text-rose-300 bg-rose-500/15';
const TAG_SCAN = 'text-[#8fb4ff] bg-[#5B93FF]/10 hover:bg-[#5B93FF]/20';

/** Pill that may wrap onto its own line but never grows past its cell. */
function PTag({ children, cls, title }: { children: React.ReactNode; cls: string; title?: string }) {
  return <span title={title} className={`inline-block max-w-full truncate align-middle text-[12px] leading-5 px-2 rounded-full font-medium ${cls}`}>{children}</span>;
}

/** "วันนี้" / "N วันก่อน" counted in calendar days (Bangkok date of the filing vs today). */
function daysBeforeLabel(announceDate: string | null | undefined, today: string): string {
  const d = (announceDate ?? '').slice(0, 10);
  const n = d && today ? Math.round((Date.parse(today) - Date.parse(d)) / 86400000) : NaN;
  if (!Number.isFinite(n) || n < 0) return '';
  return n === 0 ? 'วันนี้' : `${n} วันก่อน`;
}

/** Badges after a ticker - one component for the PEAD section and every row of the
 *  main table: ⚡ เร่งตัว · market stage · RS · scans it sits in · warnings.
 *  Every badge has a title with the real value; no data → no badge. */
function StockBadges({ a, extra }: { a: EarningsAnnouncement; extra: PeadExtra | undefined }) {
  const warns = peadWarnings(a.auditorOpinion, extra);
  return (
    <>
      {isAccelerating(a) && <PTag cls={TAG_ACC} title="% เทียบปีก่อนของไตรมาสนี้ สูงกว่าของไตรมาสที่แล้ว">⚡ เร่งตัว</PTag>}
      {extra?.stage && (
        <span title={`Market Stage: ${extra.stage}`} className="inline-flex items-center gap-1 text-[12px] leading-5 text-white/75 whitespace-nowrap">
          <i className="inline-block w-2 h-2 rounded-full" style={{ background: STAGE_COLORS[extra.stage] ?? '#424242' }} />{extra.stage}
        </span>
      )}
      {extra?.rs != null && (
        <span title={`RS Rating ${extra.rs}`} className="text-[12px] leading-5 text-white/75 whitespace-nowrap tabular-nums">RS {extra.rs}</span>
      )}
      {extra?.scans?.map(k => (
        <Link key={k} href={SCAN_META[k].href} onClick={e => e.stopPropagation()}
          title={`ติดสแกน ${SCAN_META[k].label} อยู่ตอนนี้ — เปิดหน้าสแกน`} className="max-w-full">
          <PTag cls={TAG_SCAN}>{SCAN_META[k].label}</PTag>
        </Link>
      ))}
      {warns.map(w => <PTag key={w.key} cls={w.level === 'red' ? TAG_WARN_RED : TAG_AMBER} title={w.title}>{w.text}</PTag>)}
    </>
  );
}

/** แถบคำอธิบายป้าย above the PEAD table / cards and the main table. */
function BadgeLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-meta mb-2">
      <span className="text-white/70">ป้ายหลังชื่อหุ้น:</span>
      <span className="inline-flex items-center gap-1"><i className="inline-block w-2 h-2 rounded-full bg-[#4caf50]" />Market Stage</span>
      <span>RS = RS Rating</span>
      <span className="inline-flex items-center gap-1.5"><PTag cls={TAG_SCAN}>SEPA</PTag>สแกนที่ติดอยู่ตอนนี้</span>
      <span className="inline-flex items-center gap-1.5"><PTag cls={TAG_ACC}>⚡ เร่งตัว</PTag>โตเร็วขึ้นกว่าไตรมาสก่อน</span>
      <span className="inline-flex items-center gap-1.5"><PTag cls={TAG_AMBER}>สภาพคล่องต่ำ</PTag>ซื้อขายเฉลี่ย &lt; {LOW_LIQUIDITY_ADTV} ล./วัน</span>
      <span className="inline-flex items-center gap-1.5"><PTag cls={TAG_AMBER}>Weinstein 3 ทำยอด</PTag></span>
      <span className="inline-flex items-center gap-1.5"><PTag cls={TAG_WARN_RED}>ผู้สอบบัญชี</PTag>แดง = มีเงื่อนไข / ไม่แสดงความเห็น · ส้ม = มีข้อสังเกต</span>
    </div>
  );
}

// Column tracks per width: หุ้น | กำไรเทียบปีก่อน | กราฟราคา | วันแรก | +1 | +2 | +5.
// < md: หุ้น · เทียบปีก่อน · +2 only; md-1023 adds วันแรก / +1 / +5; 1024+ adds the chart.
// Each tier has its own max-/min- pair so the md: rule can never win over a wider one.
const PEAD_GRID = [
  'grid-cols-[minmax(0,1fr)_76px_64px]',
  'md:max-[1023px]:grid-cols-[minmax(200px,1fr)_84px_60px_60px_60px_60px]',
  'min-[1024px]:max-[1279px]:grid-cols-[minmax(200px,1fr)_80px_minmax(140px,240px)_60px_60px_60px_60px] min-[1024px]:max-[1279px]:gap-x-2',
  'min-[1280px]:grid-cols-[minmax(300px,1fr)_92px_minmax(260px,360px)_70px_70px_70px_70px]',
  'gap-x-3 items-center',
].join(' ');

/** กำไรเทียบปีก่อน: "พลิกกำไร" (never a %) or the %YoY, whole numbers. */
function PeadYoY({ a }: { a: EarningsAnnouncement }) {
  const c = compareProfit(a.netProfit, a.netProfitPrior);
  const title = `${quarterShort(a.quarter) ?? 'ไตรมาสนี้'} กำไร ${fmtMoney(a.netProfit)} · ${quarterShort(a.quarter, 4) ?? 'ปีก่อน'} ${fmtMoney(a.netProfitPrior)}`;
  if (c?.kind === 'turnaround') return <span className="font-semibold whitespace-nowrap" style={{ color: UP }} title={title}>พลิกกำไร</span>;
  if (c?.kind === 'pct') return <span className="font-semibold" title={title}><Pct v={c.pct} digits={0} /></span>;
  return <span className="text-meta" title={title}>—</span>;
}

/** 5 days before → 5 days after: dashed 0% line, a line at the announcement with the
 *  days after it shaded, labels −5 / ประกาศ / +5 underneath. Stretches with its cell
 *  (strokes don't scale; the labels are HTML so they never stretch). */
function PeadPriceChart({ a }: { a: EarningsAnnouncement }) {
  const { pre, post } = pricePath(a);
  if (!post.length) return <span className="text-meta text-[13px]">ยังไม่มีราคาหลังงบ</span>;
  const W = 340, H = 44, PAD = 4;
  const ys = [...pre, ...post].map(p => p.y).concat(0);
  const lo = Math.min(...ys) - 0.5;
  const hi = Math.max(...ys, 1) + 0.5;
  // x: -5..-1 = closes before (the last one is the base, 0%), 0 = วันแรก, 1..5 = D+1..D+5
  const fx = (x: number) => (x + 5) / 10;
  const X = (x: number) => PAD + fx(x) * (W - 2 * PAD);
  const Y = (y: number) => H - PAD - ((y - lo) / (hi - lo)) * (H - 2 * PAD);
  const line = (pts: PricePoint[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)} ${Y(p.y).toFixed(1)}`).join('');
  const base = pre[pre.length - 1];
  const last = post[post.length - 1];
  const col = last.y >= 0 ? UP : DOWN;
  const ann = X(-1);
  const hasD5 = post.some(p => p.x === 5);
  return (
    <div className="relative w-full" role="img" aria-label={`${a.ticker} ราคา 5 วันก่อนถึง 5 วันหลังประกาศงบ`}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block w-full" style={{ height: H }}>
        <rect x={ann} y={0} width={W - PAD - ann} height={H} fill="rgba(91,147,255,0.06)" />
        <line x1={PAD} x2={W - PAD} y1={Y(0)} y2={Y(0)} stroke="rgba(255,255,255,0.14)" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
        <line x1={ann} x2={ann} y1={0} y2={H} stroke="rgba(91,147,255,0.6)" vectorEffect="non-scaling-stroke" />
        {pre.length > 1 && <path d={line(pre)} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />}
        <path d={line([base, ...post])} fill="none" stroke={col} strokeWidth={2} vectorEffect="non-scaling-stroke" />
        {post.map(p => (
          <line key={p.x} x1={X(p.x)} x2={X(p.x)} y1={Y(p.y)} y2={Y(p.y)} stroke={col} strokeWidth={5} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <div className="relative h-4 text-[11px] leading-4 text-white/40">
        <span className="absolute left-0">−5</span>
        <span className="absolute -translate-x-1/2 text-meta" style={{ left: `${(ann / W) * 100}%` }}>ประกาศ</span>
        <span className="absolute right-0">+5</span>
      </div>
      {!hasD5 && <span className="absolute right-0 top-0 text-[11px] text-white/45">รอ D+5</span>}
    </div>
  );
}

/** หุ้น cell: ticker + badges, then group · ประกาศ date time (N วันก่อน). No reason line here. */
function PeadStockCell({ a, extra, today }: { a: EarningsAnnouncement; extra: PeadExtra | undefined; today: string }) {
  const group = groupLabel(a);
  const ago = daysBeforeLabel(a.announceDate, today);
  return (
    <span className="block min-w-0">
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <b className="text-ink text-[16px]">{a.ticker}</b>
        <StockBadges a={a} extra={extra} />
      </span>
      <span className="block text-[12.5px] text-meta mt-0.5" title={`${a.subsector || a.sector || ''} · ประกาศ ${fullDateTime(a.announceDate)}`}>
        {group && <>{group} · </>}ประกาศ {shortDateTime(a.announceDate)}{ago && <> ({ago})</>}
      </span>
    </span>
  );
}

function onActivate(fn: () => void) {
  return {
    role: 'button' as const, tabIndex: 0, onClick: fn,
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } },
  };
}

function PeadSection({ rows, extras, today, onPick, onShowAll }: {
  rows: EarningsAnnouncement[];
  extras: Record<string, PeadExtra> | undefined;
  today: string;
  onPick: (a: EarningsAnnouncement) => void;
  onShowAll: () => void;
}) {
  // Only mounted on the client after the feed has loaded (never server-rendered),
  // so reading storage in the initializer can't cause a hydration mismatch.
  const [view, setView] = useState<PeadView>(() => {
    try {
      const v = localStorage.getItem(PEAD_VIEW_KEY);
      return v === 'card' ? 'card' : 'table';
    } catch {
      return 'table'; // storage blocked - default
    }
  });
  const choose = (v: PeadView) => {
    setView(v);
    try { localStorage.setItem(PEAD_VIEW_KEY, v); } catch { /* ignore */ }
  };

  const top = useMemo(() => peadRanked(rows, a => extras?.[a.ticker]?.adtv).slice(0, 5), [rows, extras]);
  const total = useMemo(() => rows.filter(a => isPead(a, extras?.[a.ticker]?.adtv)).length, [rows, extras]);
  const yearAgo = quarterShort(top[0]?.quarter, 4);

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-[14px] text-meta">
        <span>🔥 <b className="text-ink text-[16px] font-semibold">ราคาวิ่งต่อหลังงบ</b> · หุ้นที่งบดี และราคายังขึ้นต่อหลังประกาศ</span>
        <span className="flex items-center gap-4">
          <span className="inline-flex border border-white/[0.08] rounded-lg overflow-hidden">
            {(['table', 'card'] as const).map(v => (
              <button key={v} onClick={() => choose(v)}
                className={`text-[13px] px-2.5 py-1 ${view === v ? 'bg-[#1b2640] text-[#dbe7ff]' : 'text-meta hover:text-white/80'}`}>
                {v === 'table' ? '☰ ตาราง' : '⊞ การ์ด'}
              </button>
            ))}
          </span>
          {total > 0 && (
            <button onClick={onShowAll} className="text-[#5B93FF] hover:text-blue-300">ดูทั้ง {total} ตัวในตาราง →</button>
          )}
        </span>
      </div>
      <p className="text-[12.5px] text-meta mt-1 mb-2">
        เกณฑ์: {PEAD_CRITERIA} · เรียงตาม +2 วัน · ส่วนนี้ดู<b className="text-white/80 font-medium">จังหวะราคา</b> ตัวเลขงบละเอียดอยู่ในตารางข้างล่าง
      </p>

      {top.length === 0 ? (
        <div className="py-5 text-[14px] text-meta border-b border-white/[0.07]">ยังไม่มีหุ้นเข้าเกณฑ์</div>
      ) : view === 'table' ? (
        <>
          <BadgeLegend />
          {/* Tracks above: the page never scrolls sideways - the box scrolls on its own if a row is still too wide. */}
          <div className={`${TS.tableCell} overflow-x-auto [scrollbar-width:thin]`}>
            <div className={`grid ${PEAD_GRID} py-1.5 text-[12px] text-meta border-b border-white/[0.07]`}>
              <span>หุ้น</span>
              <span className="text-right">เทียบปีก่อน{yearAgo && <span className="block text-[11px] text-white/40">กำไร vs {yearAgo}</span>}</span>
              <span className="hidden min-[1024px]:block text-center">ราคา 5 วันก่อน → 5 วันหลังงบ</span>
              <span className="hidden md:block text-right">วันแรก</span>
              <span className="hidden md:block text-right">+1 วัน</span>
              <span className="text-right font-semibold text-white/80">+2 วัน</span>
              <span className="hidden md:block text-right">+5 วัน</span>
            </div>
            {top.map(a => (
              <div key={rowKey(a)} {...onActivate(() => onPick(a))}
                className={`grid ${PEAD_GRID} text-[16px] py-2.5 border-b border-white/[0.07] hover:bg-white/[0.025] cursor-pointer focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#33507f]`}>
                <PeadStockCell a={a} extra={extras?.[a.ticker]} today={today} />
                <span className="text-right"><PeadYoY a={a} /></span>
                <span className="hidden min-[1024px]:block min-w-0"><PeadPriceChart a={a} /></span>
                <span className="hidden md:block text-right"><D v={a.gap_pct} /></span>
                <span className="hidden md:block text-right"><D v={a.drift_d1_pct} /></span>
                <span className="text-right"><D v={a.drift_d2_pct} bold /></span>
                <span className="hidden md:block text-right"><D v={a.drift_d5_pct} /></span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <BadgeLegend />
          <div className="flex gap-3 overflow-x-auto pb-1 mt-2.5 [scrollbar-width:thin]">
            {top.map(a => {
              const extra = extras?.[a.ticker];
              const group = groupLabel(a);
              const ago = daysBeforeLabel(a.announceDate, today);
              return (
                <div key={rowKey(a)} {...onActivate(() => onPick(a))}
                  className="cursor-pointer flex-1 min-w-[300px] border border-white/[0.07] hover:border-[#33507f] rounded-xl p-3.5 bg-[#13161e] flex flex-col gap-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <b className="text-ink text-[17px]">{a.ticker}</b>
                      <div className="text-[12.5px] text-meta mt-0.5" title={`${a.subsector || a.sector || ''} · ประกาศ ${fullDateTime(a.announceDate)}`}>
                        {group && <>{group} · </>}ประกาศ {shortDateTime(a.announceDate)}{ago && <> ({ago})</>}
                      </div>
                    </div>
                    <div className="flex-none text-right">
                      <i className="not-italic block text-[11px] text-meta">กำไรเทียบปีก่อน</i>
                      <span className="text-[16px]"><PeadYoY a={a} /></span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 empty:hidden"><StockBadges a={a} extra={extra} /></div>
                  <div className="grid grid-cols-4 gap-0.5 bg-black/25 rounded-lg py-2 text-center text-[15px] whitespace-nowrap mt-auto">
                    {([['วันแรก', a.gap_pct], ['+1', a.drift_d1_pct], ['+2', a.drift_d2_pct], ['+5', a.drift_d5_pct]] as const).map(([k, v]) => (
                      <div key={k} className={k === '+2' ? 'font-bold' : 'font-semibold'}>
                        <i className="not-italic block text-meta text-[11px] mb-0.5">{k}</i>
                        {v == null ? <Wait /> : <Pct v={v} />}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

// ── Main table ───────────────────────────────────────────────────────────────

type ChipKey = 'acc' | 'pead' | 'mda' | 'today';
type SortKey = 'ticker' | 'netProfit' | 'yoy' | 'qoq' | 'cum' | 'price' | 'announceDate';

const CHIPS: { key: ChipKey; label: string }[] = [
  { key: 'acc', label: '⚡ เร่งตัว' },
  { key: 'pead', label: '🔥 PEAD' },
  { key: 'mda', label: 'มีสรุป MD&A' },
  { key: 'today', label: 'ประกาศวันนี้' },
];

const PAGE_SIZE = 50;
const ALL_QUARTERS = 'ทุกไตรมาส';

function chipPass(a: EarningsAnnouncement, k: ChipKey, today: string, extras: EarningsFeed['extras']): boolean {
  if (k === 'acc') return isAccelerating(a);
  if (k === 'pead') return isPead(a, extras?.[a.ticker]?.adtv);
  if (k === 'mda') return !!a.reason;
  return !!a.announceDate?.startsWith(today);
}

// Sort value tiers: real % first, then the labelled cases (พลิกกำไร, ขาดทุนลดลง,
// then the bad ones), then nothing - a label never outranks a real % in
// either direction.
const CHANGE_TIER: Record<ProfitChange['kind'], number> = { pct: 0, turnaround: 1, loss_less: 2, to_loss: 3, loss_more: 3 };
function changeSortValue(cur: number | null | undefined, base: number | null | undefined): [number, number] {
  const c = compareProfit(cur, base);
  if (!c) return [4, 0];
  return [CHANGE_TIER[c.kind], c.kind === 'pct' ? c.pct : cur ?? 0];
}
function sortValue(a: EarningsAnnouncement, k: SortKey): [number, number | string] {
  switch (k) {
    case 'ticker': return [0, a.ticker];
    case 'netProfit': return a.netProfit == null ? [2, 0] : [0, a.netProfit];
    case 'yoy': return changeSortValue(a.netProfit, a.netProfitPrior);
    case 'qoq': return changeSortValue(a.netProfit, a.netProfitPriorQ);
    case 'cum': return changeSortValue(a.netProfitCum, a.netProfitCumPrior);
    case 'price': return a.drift_d2_pct == null ? [2, 0] : [0, a.drift_d2_pct];
    default: return [0, a.announceDate || ''];
  }
}

/** 'ไตรมาส 3/2569' -> 'Q3/69' (offset = quarters back), annual/unknown -> null. */
function quarterShort(label: string | null | undefined, back = 0): string | null {
  const m = /ไตรมาส\s*(\d)\/(\d{4})/.exec(label ?? '');
  if (!m) return null;
  let q = Number(m[1]);
  let y = Number(m[2]);
  for (let i = 0; i < back; i++) { if (q === 1) { q = 4; y -= 1; } else q -= 1; }
  return `Q${q}/${String(y).slice(-2)}`;
}

/** บรรทัดล่างของช่องเทียบ: % or the label for a sign flip / loss-vs-loss. */
function ChangeLine({ cur, base }: { cur: number | null | undefined; base: number | null | undefined }) {
  const c = compareProfit(cur, base);
  if (!c) return <span className="text-meta">—</span>;
  if (c.kind === 'pct') return <Pct v={c.pct} />;
  if (c.kind === 'turnaround') return <Tag cls={TAG_TURN} title="ฐานขาดทุน ตอนนี้กำไร (ไม่คิด %)">พลิกกำไร</Tag>;
  if (c.kind === 'to_loss') return <Tag cls={TAG_LOSS} title="ฐานกำไร ตอนนี้ขาดทุน">พลิกขาดทุน</Tag>;
  if (c.kind === 'loss_more') return <span style={{ color: DOWN }}>ขาดทุนเพิ่มขึ้น</span>;
  return <span style={{ color: BUCKET_COLOR.loss_shrink }}>ขาดทุนลดลง</span>;
}

/** ช่องเทียบ: amount on top (dim), change underneath. */
function CompareCell({ cur, base, title }: { cur: number | null | undefined; base: number | null | undefined; title?: string }) {
  return (
    <div title={title}>
      <div className="tabular-nums text-white/60">{fmtMoney(base)}</div>
      <div className="text-[13px] leading-5"><ChangeLine cur={cur} base={base} /></div>
    </div>
  );
}

const BAR_NOW = '#5B93FF';
const BAR_OTHER = '#3a4357';
const BAR_YEAR_AGO = '#8a93a6';
const BAR_LOSS = '#ef4444';
const BAR_LOSS_DIM = '#7f2a2a';

/** กำไร 5 ไตรมาส: last bar = this quarter (blue), first = same quarter last year
 *  (outline), others dark grey; losses point down in red. A quarter without a
 *  figure is left empty - never drawn as 0. Hover = quarter + amount. */
function ProfitBars({ history, w = 112, h = 36 }: { history: { q: string; np: number | null }[]; w?: number; h?: number }) {
  const vals = history.map(x => x.np).filter((v): v is number => v != null);
  if (!vals.length) return <span className="text-meta text-[13px]">—</span>;
  const max = Math.max(...vals.map(Math.abs)) || 1;
  const hasNeg = vals.some(v => v < 0);
  const zero = hasNeg ? h / 2 : h - 2;
  const scale = (hasNeg ? h / 2 - 2 : h - 4) / max;
  const slot = w / history.length;
  const bw = Math.min(14, slot - 6);
  const last = history.length - 1;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="inline-block align-middle" role="img"
      aria-label={`กำไร ${history.map(x => `${x.q} ${x.np == null ? 'ไม่มีข้อมูล' : fmtMoney(x.np)}`).join(', ')}`}>
      <line x1={0} x2={w} y1={zero} y2={zero} stroke="rgba(255,255,255,0.14)" />
      {history.map((x, i) => {
        const cx = i * slot + (slot - bw) / 2;
        const role = i === last ? 'ไตรมาสนี้' : i === 0 ? 'ไตรมาสเดียวกันปีก่อน' : '';
        const tip = `${x.q}${role ? ` (${role})` : ''}: ${x.np == null ? 'ไม่มีข้อมูล' : `${fmtMoney(x.np)}บาท`}`;
        let bar = null;
        if (x.np != null) {
          const bh = Math.max(1.5, Math.abs(x.np) * scale);
          const y = x.np >= 0 ? zero - bh : zero;
          const neg = x.np < 0;
          const fill = i === last ? (neg ? BAR_LOSS : BAR_NOW) : i === 0 ? 'transparent' : neg ? BAR_LOSS_DIM : BAR_OTHER;
          const stroke = i === 0 ? (neg ? BAR_LOSS : BAR_YEAR_AGO) : 'none';
          bar = <rect x={cx} y={y} width={bw} height={bh} rx={2} fill={fill} stroke={stroke} strokeWidth={1.5} pointerEvents="none" />;
        }
        return (
          <g key={x.q}>
            <rect x={i * slot} y={0} width={slot} height={h} fill="transparent"><title>{tip}</title></rect>
            {bar}
          </g>
        );
      })}
    </svg>
  );
}

function Sw({ style }: { style: React.CSSProperties }) {
  return <i className="inline-block w-2.5 h-2.5 rounded-[2px] mr-1.5 align-[-1px]" style={style} />;
}

function BarsLegend() {
  return (
    <div className="hidden min-[1440px]:flex flex-wrap gap-4 text-[12px] text-meta mb-2">
      <span className="text-white/70">กำไร 5 ไตรมาส:</span>
      <span><Sw style={{ background: BAR_NOW }} />ไตรมาสนี้</span>
      <span><Sw style={{ border: `1.5px solid ${BAR_YEAR_AGO}` }} />ไตรมาสเดียวกันปีก่อน</span>
      <span><Sw style={{ background: BAR_OTHER }} />ไตรมาสอื่น</span>
      <span><Sw style={{ background: BAR_LOSS }} />ขาดทุน (แท่งชี้ลง)</span>
      <span>ช่องว่าง = ไม่มีข้อมูล · ชี้ที่แท่งเพื่อดูตัวเลข</span>
    </div>
  );
}

function K({ children }: { children: React.ReactNode }) {
  return <span className="text-meta">{children}</span>;
}

// Expanded row: only what the table row doesn't already show. Columns that
// drop out on narrower screens (ไตรมาสก่อน / 5 ไตรมาส / สะสม) come back here
// at exactly those widths, so nothing is ever shown twice or lost.
function DetailRow({ a }: { a: EarningsAnnouncement }) {
  const reason = reasonOf(a);
  return (
    <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-x-6 gap-y-1.5 text-[14px] whitespace-normal">
      <div className="contents md:hidden">
        <K>ไตรมาสก่อน{a.priorQuarter ? ` (${quarterShort(a.priorQuarter)})` : ''}</K>
        <span className="tabular-nums">{fmtMoney(a.netProfitPriorQ)} · <ChangeLine cur={a.netProfit} base={a.netProfitPriorQ} /></span>
      </div>
      {a.profitHistory?.length ? (
        <div className="contents min-[1440px]:hidden">
          <K>กำไร 5 ไตรมาส</K>
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <ProfitBars history={a.profitHistory} w={150} h={40} />
            <span className="text-[13px] text-meta tabular-nums">
              {a.profitHistory.map(x => `${x.q} ${x.np == null ? '—' : fmtMoney(x.np)}`).join(' · ')}
            </span>
          </span>
        </div>
      ) : null}
      {a.netProfitCum != null && (
        <div className="contents min-[1680px]:hidden">
          <K>กำไร {a.cumMonths} เดือน</K>
          <span className="tabular-nums">{fmtMoney(a.netProfitCum)} <span className="text-meta">ปีก่อน {fmtMoney(a.netProfitCumPrior)}</span> · <ChangeLine cur={a.netProfitCum} base={a.netProfitCumPrior} /></span>
        </div>
      )}
      <K>EPS</K><span className="tabular-nums">{a.eps != null ? a.eps.toFixed(2) : '—'} <span className="text-meta">ปีก่อน {a.epsPrior != null ? a.epsPrior.toFixed(2) : '—'}</span></span>
      <K>ราคาหลังงบ</K>
      <span>
        {a.gap_pct == null ? <span className="text-meta">รอครบวันทำการ</span> : (
          <span className="flex flex-wrap gap-x-3">
            <span>วันแรก <Pct v={a.gap_pct} /></span>
            <span>+1 วัน {a.drift_d1_pct == null ? <Wait /> : <Pct v={a.drift_d1_pct} />}</span>
            <span>+2 วัน {a.drift_d2_pct == null ? <Wait /> : <b><Pct v={a.drift_d2_pct} /></b>}</span>
            <span>+5 วัน {a.drift_d5_pct == null ? <Wait /> : <Pct v={a.drift_d5_pct} />}</span>
          </span>
        )}
        {a.gap_pct != null && <span className="block mt-1.5"><PriceChart a={a} w={320} h={60} /></span>}
      </span>
      <K>ข้อความจาก MD&amp;A</K>
      <span className="text-white/75 leading-relaxed">{reason || <span className="text-meta">ยังไม่มีข้อความสรุปจาก MD&amp;A</span>}</span>
      <K>เอกสาร</K>
      <span className="flex flex-wrap gap-x-4 gap-y-1">
        {a.statementUrl && <a href={a.statementUrl} target="_blank" rel="noopener noreferrer" className="text-[#5B93FF] hover:text-blue-300">งบการเงิน ↗</a>}
        {a.mdaUrl && <a href={a.mdaUrl} target="_blank" rel="noopener noreferrer" className="text-[#5B93FF] hover:text-blue-300">MD&amp;A ↗</a>}
        {a.f45Url && <a href={a.f45Url} target="_blank" rel="noopener noreferrer" className="text-[#5B93FF] hover:text-blue-300">F45 ↗</a>}
        <Link href={`/stock/${a.ticker}`} className="text-[#5B93FF] hover:text-blue-300">หน้าหุ้น {a.ticker} →</Link>
      </span>
    </div>
  );
}

function SortTh({ k, sort, onSort, children, sub, className = '', title }: {
  k: SortKey; sort: { key: SortKey; asc: boolean }; onSort: (k: SortKey) => void;
  children: React.ReactNode; sub?: React.ReactNode; className?: string; title?: string;
}) {
  const on = sort.key === k;
  return (
    <th onClick={() => onSort(k)} title={title}
      className={`px-1.5 md:px-3 py-2.5 text-[13px] font-medium text-meta whitespace-nowrap cursor-pointer select-none hover:text-white/80 align-bottom ${className}`}>
      <span className="inline-flex items-center gap-0.5">
        {children}
        {on && (sort.asc ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
      </span>
      {sub && <span className="block text-[11.5px] font-normal text-white/40">{sub}</span>}
    </th>
  );
}

function SortLink({ k, sort, onSort, children }: {
  k: SortKey; sort: { key: SortKey; asc: boolean }; onSort: (k: SortKey) => void; children: React.ReactNode;
}) {
  const on = sort.key === k;
  return (
    <button type="button" onClick={() => onSort(k)}
      className={`inline-flex items-center gap-0.5 hover:text-white/80 ${on ? 'text-white/80' : ''}`}>
      {children}
      {on && (sort.asc ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
    </button>
  );
}

// ── รายวัน view: bucket bar, day cards, day header ─────────────────────────

/** Thin bar split by bucket share (BUCKET_ORDER), widths of the day's rows. */
function BucketBar({ s, className }: { s: DaySummary; className: string }) {
  return (
    <span className={`flex overflow-hidden rounded-full bg-white/[0.06] ${className}`}>
      {BUCKET_ORDER.map(k => s.counts[k] ? (
        <i key={k} className="block h-full" style={{ width: `${(s.counts[k]! / s.n) * 100}%`, background: BUCKET_COLOR[k] }} />
      ) : null)}
    </span>
  );
}

/** หัวกลุ่มของวัน: วัน · N บริษัท · bar · กำไรดีขึ้น X (Y%) · each bucket · โตสุดของวัน. */
function DayHeader({ day, s, open, onToggle }: { day: string; s: DaySummary; open: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} aria-expanded={open}
      className="w-full flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3 md:px-4 py-3 text-left bg-[#13161e] hover:bg-[#171b25]">
      <span className={`text-white/40 text-[12px] transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
      <span className="text-[15px] font-semibold text-ink whitespace-nowrap min-w-[88px] md:min-w-[110px]">{dayLabel(day)}</span>
      <span className="text-[13px] text-meta whitespace-nowrap">{s.n} บริษัท</span>
      <BucketBar s={s} className="h-1.5 w-[120px] md:w-[160px]" />
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-meta">
        {s.improvedPct != null && (
          <span className="whitespace-nowrap">กำไรดีขึ้น <b className="font-semibold" style={{ color: UP }}>{s.improved}</b> ({s.improvedPct}%)</span>
        )}
        {BUCKET_ORDER.filter(k => s.counts[k]).map(k => (
          <span key={k} className="whitespace-nowrap">
            <i className="inline-block w-2 h-2 rounded-[2px] mr-1 align-[0px]" style={{ background: BUCKET_COLOR[k] }} />{TAB_LABEL[k]} {s.counts[k]}
          </span>
        ))}
      </span>
      {s.best && (
        <span className="ml-auto text-[12.5px] text-meta whitespace-nowrap">
          โตสุดของวัน <b className="text-ink font-semibold">{s.best.ticker}</b> <Pct v={s.best.yoy} digits={0} />
        </span>
      )}
    </button>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

const EMPTY_FEED: EarningsFeed = {
  generatedAt: '', windowDays: 45, universeSize: 0,
  buckets: {} as EarningsFeed['buckets'], announcements: [], calendar: [],
};

export default function EarningsPage() {
  const [feed, setFeed] = useState<EarningsFeed>(EMPTY_FEED);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [tab, setTab] = useState<EarningsBucket | null>(null);
  const [chips, setChips] = useState<Set<ChipKey>>(new Set());
  const [quarter, setQuarter] = useState<string | null>(null); // null = season quarter (set once data arrives)
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: 'announceDate', asc: false });
  const [page, setPage] = useState(1);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const scrollTarget = useRef<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  // รายวัน / รายการเดียว, bound to ?view=. Read from the URL in the initializer: the table
  // only renders after the feed loads (never on the server), so this can't mismatch.
  const [view, setViewState] = useState<EarningsView>(() =>
    typeof window === 'undefined' ? 'day' : parseView(new URLSearchParams(window.location.search).get('view')));
  // Day groups the user opened / closed; others follow the default (the newest 2 open).
  const [dayToggled, setDayToggled] = useState<Map<string, boolean>>(new Map());

  const fetchFeed = () =>
    fetch('/api/earnings')
      .then(res => { if (!res.ok) throw new Error(); return res.json(); })
      .then((data: EarningsFeed) => { setFeed(data); setError(false); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  const loadData = () => { setLoading(true); fetchFeed(); };
  useEffect(() => { fetchFeed(); }, []);

  const today = bangkokDateKey();
  const extras = feed.extras;

  const [daySel, setDaySel] = useState<string | null>(null); // null = newest day with a filing
  const [scope, setScope] = useState<SectorScope>('day');

  const quarters = useMemo(() => {
    const s = new Set(feed.announcements.map(a => a.quarter?.trim()).filter((q): q is string => !!q));
    return [...s].sort((x, y) => parseQuarterScore(y) - parseQuarterScore(x));
  }, [feed.announcements]);
  // The season = the newest quarterly filing (an annual filing never names the season).
  const seasonQuarter = useMemo(() => quarters.find(q => q.startsWith('ไตรมาส')) ?? quarters[0] ?? null, [quarters]);
  const activeQuarter = quarter ?? seasonQuarter ?? ALL_QUARTERS;

  const seasonRows = useMemo(
    () => feed.announcements.filter(a => a.quarter === seasonQuarter),
    [feed.announcements, seasonQuarter]
  );
  // Day cards / "วันที่กำลังดู": the season's filing days, newest first.
  const seasonDays = useMemo(
    () => groupByDay(seasonRows).map(g => ({ day: g.day, s: summarizeDay(g.rows) })),
    [seasonRows]
  );
  const selDay = daySel && seasonDays.some(g => g.day === daySel) ? daySel : seasonDays[0]?.day ?? '';
  const quarterRows = useMemo(
    () => feed.announcements.filter(a => activeQuarter === ALL_QUARTERS || a.quarter === activeQuarter),
    [feed.announcements, activeQuarter]
  );
  const searched = useMemo(() => {
    const q = query.trim().toUpperCase();
    return q ? quarterRows.filter(a => a.ticker.includes(q)) : quarterRows;
  }, [quarterRows, query]);

  const passChips = (a: EarningsAnnouncement, skip?: ChipKey) =>
    [...chips].every(k => k === skip || chipPass(a, k, today, feed.extras));

  const filtered = useMemo(() => {
    const list = searched.filter(a => (!tab || pageBucket(a) === tab) && passChips(a));
    const dir = sort.asc ? 1 : -1;
    return list.sort((x, y) => {
      const [tx, vx] = sortValue(x, sort.key);
      const [ty, vy] = sortValue(y, sort.key);
      if (tx !== ty) return tx - ty;
      if (vx === vy) return (y.announceDate || '').localeCompare(x.announceDate || '');
      return (vx > vy ? 1 : -1) * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searched, tab, chips, sort, today, feed.extras]);

  // Column sub-labels name the real quarters (from the selected quarter, else
  // the newest row's) - never hard-coded.
  const hdr = useMemo(() => {
    const label = activeQuarter !== ALL_QUARTERS ? activeQuarter : null;
    const months = filtered.map(a => a.cumMonths).filter((m): m is number => m != null);
    const cumMonths = months.length && months.every(m => m === months[0]) ? months[0] : null;
    return { now: quarterShort(label), yearAgo: quarterShort(label, 4), prevQ: quarterShort(label, 1), cumMonths };
  }, [activeQuarter, filtered]);

  // Filter first, then group - a day the filters empty is not shown, headers count filtered rows.
  const dayGroups = useMemo(
    () => groupByDay(filtered).map(g => ({ ...g, s: summarizeDay(g.rows) })),
    [filtered]
  );
  const isDayOpen = (day: string) => dayToggled.get(day) ?? day === selDay;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Scroll the row the PEAD strip asked for into view once it has rendered open.
  useEffect(() => {
    if (!scrollTarget.current) return;
    const el = document.getElementById(`row-${scrollTarget.current}`);
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    scrollTarget.current = null;
  }, [openKey, pageRows]);

  const setView = (v: EarningsView) => {
    setViewState(v);
    try {
      const { pathname, search, hash } = window.location;
      window.history.replaceState(window.history.state, '', `${pathname}${withView(search, v)}${hash}`);
    } catch { /* ignore */ }
  };
  // Day card: the day the whole page looks at - sector box, เด่นของวัน, and only that
  // day opened in the table (รายวัน).
  const pickDay = (day: string) => {
    setDaySel(day);
    if (view !== 'day') setView('day');
    setDayToggled(new Map());
  };
  const toggleDay = (day: string, open: boolean) => setDayToggled(m => new Map(m).set(day, !open));

  const resetPage = () => setPage(1);
  const onSort = (k: SortKey) => {
    resetPage();
    setSort(s => (s.key === k ? { key: k, asc: !s.asc } : { key: k, asc: k === 'ticker' }));
  };
  const toggleChip = (k: ChipKey) => {
    resetPage();
    setChips(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };
  const pick = (a: EarningsAnnouncement) => {
    const key = rowKey(a);
    setTab(null);
    setChips(new Set());
    setQuery('');
    setQuarter(a.quarter ?? ALL_QUARTERS);
    setSort({ key: 'announceDate', asc: false });
    // find the page the row lands on with those filters
    const list = feed.announcements
      .filter(x => x.quarter === a.quarter)
      .sort((x, y) => (y.announceDate || '').localeCompare(x.announceDate || ''));
    setPage(Math.floor(Math.max(0, list.findIndex(x => rowKey(x) === key)) / PAGE_SIZE) + 1);
    setOpenKey(key);
    setDayToggled(m => new Map(m).set(announceDay(a), true));
    scrollTarget.current = key;
  };
  const showAllPead = () => {
    setTab(null);
    setQuarter(null);
    setChips(new Set(['pead']));
    resetPage();
    // รายวัน: open every day that holds a PEAD stock, so all N show (not just the newest 2 days)
    setDayToggled(m => {
      const next = new Map(m);
      for (const a of seasonRows) if (isPead(a, extras?.[a.ticker]?.adtv)) next.set(announceDay(a), true);
      return next;
    });
    tableRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  // One table row (+ its expanded detail) - used by both รายการเดียว and รายวัน.
  const renderRow = (a: EarningsAnnouncement) => {
    const key = rowKey(a);
    const open = openKey === key;
    const reason = reasonPreview(a.reason);
    const isToday = a.announceDate?.startsWith(today);
    return (
      <Fragment key={key}>
        <tr id={`row-${key}`} onClick={() => setOpenKey(open ? null : key)}
          className={`cursor-pointer border-b border-white/[0.07] ${open ? 'bg-white/[0.03]' : 'hover:bg-white/[0.025]'}`}>
          <td className="px-1.5 md:px-3 py-3 max-w-[112px] md:max-w-[240px] min-[1280px]:max-w-[420px]">
            <div className="flex flex-wrap md:flex-nowrap items-center gap-x-2 gap-y-0.5 whitespace-nowrap">
              <b className="text-ink text-[16px]">{a.ticker}</b>
              {isToday && <span className="w-[7px] h-[7px] rounded-full bg-[#5B93FF]" title="ประกาศวันนี้" />}
              {a.isCorrection && <span className="text-[12px] text-[#EF9F27]">แก้ไข</span>}
            </div>
            <div className="text-[12.5px] text-meta truncate mt-0.5" title={`${a.subsector || a.sector || ''} · ประกาศ ${fullDateTime(a.announceDate)}`}>
              {(a.subsector || a.sector) && <>{a.subsector || a.sector} · </>}ประกาศ {shortDateTime(a.announceDate)}
              {activeQuarter === ALL_QUARTERS && a.quarter && <> · {a.quarter}</>}
            </div>
            {/* same badges as the PEAD section (StockBadges); none at all → no row */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 empty:hidden"><StockBadges a={a} extra={extras?.[a.ticker]} /></div>
            {reason && <div className="text-[13px] text-white/55 truncate" title={reason}>{reason}</div>}
          </td>
          <td className="px-1.5 md:px-3 py-3 text-right tabular-nums whitespace-nowrap md:text-[16px] font-semibold" style={{ color: a.netProfit != null && a.netProfit < 0 ? DOWN : undefined }}>
            {fmtMoney(a.netProfit)}
          </td>
          <td className="px-1.5 md:px-3 py-3 text-right whitespace-nowrap">
            <CompareCell cur={a.netProfit} base={a.netProfitPrior} title={quarterShort(a.quarter, 4) ?? 'งวดเดียวกันปีก่อน'} />
          </td>
          <td className="px-1.5 md:px-3 py-3 text-right whitespace-nowrap hidden md:table-cell">
            <CompareCell cur={a.netProfit} base={a.netProfitPriorQ} title={a.priorQuarter ?? undefined} />
          </td>
          <td className="px-1.5 md:px-3 py-2 text-right whitespace-nowrap hidden min-[1440px]:table-cell">
            {a.profitHistory?.length ? <ProfitBars history={a.profitHistory} /> : <span className="text-meta">—</span>}
          </td>
          <td className="px-1.5 md:px-3 py-3 text-right whitespace-nowrap hidden min-[1680px]:table-cell">
            {a.netProfitCum != null ? (
              <div title={`${a.cumMonths} เดือน ปีนี้ ${fmtMoney(a.netProfitCum)} · ปีก่อน ${fmtMoney(a.netProfitCumPrior)}`}>
                <div className="tabular-nums text-white/60">{fmtMoney(a.netProfitCum)}</div>
                <div className="text-[13px] leading-5"><ChangeLine cur={a.netProfitCum} base={a.netProfitCumPrior} /></div>
              </div>
            ) : <span className="text-meta">—</span>}
          </td>
          <td className="px-1.5 md:px-3 py-3 text-right whitespace-nowrap">
            {a.gap_pct == null ? <Wait title="รอครบวันทำการ" /> : (
              <>
                <span className="text-[13px] text-meta tabular-nums hidden md:inline">{a.gap_pct >= 0 ? '+' : ''}{a.gap_pct.toFixed(1)} → </span>
                {a.drift_d2_pct == null ? <Wait title="รอครบ 2 วันทำการ" /> : <Pct v={a.drift_d2_pct} />}
              </>
            )}
          </td>
        </tr>
        {open && (
          <tr className="border-b border-white/[0.07] bg-[#13161e]">
            <td colSpan={7} className="px-3 md:px-5 pt-4 pb-5"><DetailRow a={a} /></td>
          </tr>
        )}
      </Fragment>
    );
  };

  const filterLabel = [tab && TAB_LABEL[tab], ...[...chips].map(k => CHIPS.find(c => c.key === k)!.label)].filter(Boolean).join(' + ');

  return (
    <FullWidthPage>
      <header className="flex flex-wrap items-baseline justify-between gap-2 mb-5">
        <h1 className={`${TS.pageTitle} text-ink`}>ประกาศงบ{seasonQuarter ? ` · ${seasonQuarter}` : ''}</h1>
        <div className="flex items-center gap-2 text-[13px] text-meta">
          {!loading && (
            <span title={`ข้อมูล ณ ${fullDateTime(feed.generatedAt || null)}\nอัปเดตจากรอบ batch 09:45 / 18:00 / 20:00 น. (ไม่ใช่ real-time)\nF45 / งบการเงิน / MD&A ทั้งตลาด (SET + mai) · ย้อนหลัง ${feed.windowDays} วัน`}
              className="cursor-help border-b border-dotted border-white/25">
              {feed.generatedAt ? `อัปเดต ${shortDateTime(feed.generatedAt)} น.` : 'ยังไม่มีข้อมูล — รอรอบ batch ถัดไป'}
            </span>
          )}
          <button onClick={loadData} title="โหลดใหม่" className="p-1.5 rounded-lg border border-white/[0.07] text-meta hover:text-white/70">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      {loading ? (
        <TableSkeleton rows={10} />
      ) : error ? (
        <div className="py-16 text-center space-y-3">
          <p className="text-label text-meta">ไม่สามารถโหลดข้อมูลได้</p>
          <button onClick={loadData} className="px-4 py-1.5 rounded-lg text-label border border-white/10 text-white/50 hover:text-white/80">
            ลองอีกครั้ง
          </button>
        </div>
      ) : (
        <div className="@container space-y-7">
          <div className="grid grid-cols-1 @min-[1052px]:grid-cols-[minmax(0,1fr)_440px] @min-[1332px]:grid-cols-[minmax(0,1fr)_560px] gap-3.5">
            <section className={PANEL} aria-label="สรุปฤดูงบ">
              <SeasonStats rows={seasonRows} extras={extras} />
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mt-4 mb-1.5">
                <h2 className="text-[13.5px] font-medium text-white/80">ประกาศรายวัน <span className="text-[12.5px] font-normal text-meta">· กดเพื่อเลือกวัน · แถบสี = สัดส่วนผลงบของวันนั้น</span></h2>
                <span className="text-[13px] text-meta">
                  รออีก <b className="text-ink font-semibold">{waitingThisWeek(feed, today)}</b> บริษัทในสัปดาห์นี้ ·{' '}
                  <Link href="/calendar" className="text-[#5B93FF] hover:text-blue-300 whitespace-nowrap">ดูปฏิทินเต็ม →</Link>
                </span>
              </div>
              <DayStrip groups={seasonDays} selected={selDay} onPick={pickDay} />
            </section>
            <SectorBox rows={seasonRows} day={selDay} scope={scope} onScope={setScope} />
          </div>
          <PeadSection rows={seasonRows} extras={feed.extras} today={today} onPick={pick} onShowAll={showAllPead} />

          <div ref={tableRef} className="scroll-mt-20">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-[14px] text-meta">
              <span><b className="text-ink text-[16px] font-semibold">ทุกบริษัทที่ประกาศ</b> · {quarterRows.length} บริษัท</span>
              <span className="inline-flex border border-white/[0.08] rounded-lg overflow-hidden" role="group" aria-label="มุมมองตาราง">
                {(['day', 'list'] as const).map(v => (
                  <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v}
                    className={`text-[13px] px-3 py-1 ${view === v ? 'bg-[#1b2640] text-[#dbe7ff]' : 'text-meta hover:text-white/80'}`}>
                    {v === 'day' ? 'รายวัน' : 'รายการเดียว'}
                  </button>
                ))}
              </span>
            </div>
            <p className="text-[12.5px] text-meta mt-1 mb-2">
              ส่วนนี้ดู<b className="text-white/80 font-medium">ตัวเลขงบ</b>ครบชุด · ป้ายใต้ชื่อหุ้นชุดเดียวกับส่วนบน · มุมมอง &quot;รายวัน&quot; จัดกลุ่มตามวันประกาศ
            </p>
            {/* Tabs - one at a time, never wrap (scroll sideways on a narrow screen) */}
            <div className="flex flex-nowrap overflow-x-auto [scrollbar-width:none] gap-1 border-b border-white/[0.07] mb-4">
              {[null, ...BUCKET_ORDER].map(k => {
                const n = k ? searched.filter(a => pageBucket(a) === k).length : searched.length;
                const on = tab === k;
                return (
                  <button key={k ?? 'all'} onClick={() => { setTab(k); resetPage(); }}
                    className={`flex-none flex items-center gap-2 whitespace-nowrap text-[15px] px-3.5 pt-2.5 pb-3 border-b-2 -mb-px ${
                      on ? 'text-ink border-[#5B93FF]' : 'text-meta border-transparent hover:text-white/80'
                    } ${n === 0 && !on ? 'opacity-45' : ''}`}>
                    {k && <span className="w-2 h-2 rounded-full" style={{ background: BUCKET_COLOR[k] }} />}
                    {k ? TAB_LABEL[k] : 'ทั้งหมด'}
                    <span className="text-[13px] text-meta tabular-nums">{n}</span>
                  </button>
                );
              })}
            </div>

            {/* กรองเพิ่ม (AND with the tab) + search + quarter */}
            <div className="flex flex-wrap items-center gap-2.5 mb-3">
              <span className="text-[13px] text-meta mr-0.5">กรองเพิ่ม</span>
              {CHIPS.map(c => {
                const on = chips.has(c.key);
                const n = searched.filter(a => (!tab || pageBucket(a) === tab) && passChips(a, c.key) && chipPass(a, c.key, today, feed.extras)).length;
                return (
                  <button key={c.key} onClick={() => toggleChip(c.key)}
                    className={`px-3.5 py-1.5 rounded-full border text-[14px] ${
                      on ? 'bg-[#1b2640] border-[#33507f] text-[#dbe7ff]' : 'border-white/[0.08] text-white/75 hover:border-white/20'
                    } ${n === 0 && !on ? 'opacity-40' : ''}`}>
                    {on ? '✓ ' : ''}{c.label} <span className="text-[12px] text-meta ml-0.5 tabular-nums">{n}</span>
                  </button>
                );
              })}
              {chips.size > 0 && (
                <button onClick={() => { setChips(new Set()); resetPage(); }} className="text-[13px] text-[#5B93FF] hover:text-blue-300">ล้าง</button>
              )}
              <span className="flex-1" />
              <label className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-meta" />
                <input value={query} onChange={e => { setQuery(e.target.value); resetPage(); }} placeholder="ค้นหาหุ้น"
                  className="w-32 pl-7 pr-2.5 py-1.5 bg-transparent border border-white/[0.08] rounded-lg text-[14px] text-ink outline-none focus:border-white/25" />
              </label>
              <select value={activeQuarter} onChange={e => { setQuarter(e.target.value); resetPage(); }}
                className="px-2.5 py-1.5 bg-[#13161e] border border-white/[0.08] rounded-lg text-[14px] text-ink outline-none focus:border-white/25">
                {quarters.map(q => <option key={q} value={q}>{q}</option>)}
                <option value={ALL_QUARTERS}>{ALL_QUARTERS}</option>
              </select>
            </div>

            <BadgeLegend />
            <BarsLegend />
            <div className="overflow-x-auto">
              <table className={`w-full ${TS.tableCell}`}>
                <thead className="border-b border-white/[0.07]">
                  <tr className="text-right">
                    <th className="px-1.5 md:px-3 py-2.5 text-[13px] font-medium text-meta whitespace-nowrap text-left align-bottom">
                      <SortLink k="ticker" sort={sort} onSort={onSort}>หุ้น</SortLink>
                      <span className="block text-[11.5px] font-normal text-white/40">
                        <span className="hidden md:inline">เรียง: </span><SortLink k="announceDate" sort={sort} onSort={onSort}>เวลาประกาศ</SortLink>
                      </span>
                    </th>
                    <SortTh k="netProfit" sort={sort} onSort={onSort} sub={hdr.now ? <><span className="hidden md:inline">ไตรมาสนี้ </span>{hdr.now}</> : 'งวดนี้'}>กำไร<span className="hidden md:inline">สุทธิ</span></SortTh>
                    <SortTh k="yoy" sort={sort} onSort={onSort} sub={<>{hdr.yearAgo ?? 'งวดเดียวกัน'}<span className="hidden md:inline"> · เปลี่ยน</span></>}>ปีก่อน</SortTh>
                    <SortTh k="qoq" sort={sort} onSort={onSort} className="hidden md:table-cell" sub={hdr.prevQ ? `${hdr.prevQ} · เปลี่ยน` : 'เปลี่ยน'}>ไตรมาสก่อน</SortTh>
                    <th className="px-1.5 md:px-3 py-2.5 text-[13px] font-medium text-meta whitespace-nowrap align-bottom hidden min-[1440px]:table-cell">
                      กำไร 5 ไตรมาส
                      <span className="block text-[11.5px] font-normal text-white/40">{hdr.yearAgo && hdr.now ? `${hdr.yearAgo} → ${hdr.now}` : 'ย้อนหลัง 5 ไตรมาส'}</span>
                    </th>
                    <SortTh k="cum" sort={sort} onSort={onSort} className="hidden min-[1680px]:table-cell" sub="สะสมต้นปี · เทียบปีก่อน">
                      {hdr.cumMonths ? `กำไร ${hdr.cumMonths} เดือน` : 'กำไรสะสม'}
                    </SortTh>
                    <SortTh k="price" sort={sort} onSort={onSort} title="ราคาวันแรกหลังงบ → หลัง 2 วันทำการ (เทียบราคาปิดก่อนประกาศ)" sub={<span className="hidden md:inline">วันแรก → 2 วัน</span>}>
                      <span className="border-b border-dotted border-white/30"><span className="md:hidden">หลังงบ</span><span className="hidden md:inline">ราคาหลังงบ</span></span>
                    </SortTh>
                  </tr>
                </thead>
                {view === 'list' ? (
                  <tbody>
                    {pageRows.map(a => renderRow(a))}
                    {pageRows.length === 0 && (
                      <tr><td colSpan={7} className="py-7 text-center text-meta text-[14px]">ไม่มีหุ้นที่ตรงเงื่อนไข</td></tr>
                    )}
                  </tbody>
                ) : dayGroups.length === 0 ? (
                  <tbody><tr><td colSpan={7} className="py-7 text-center text-meta text-[14px]">ไม่มีหุ้นที่ตรงเงื่อนไข</td></tr></tbody>
                ) : dayGroups.map(({ day, rows, s }) => {
                  const open = isDayOpen(day);
                  return (
                    <tbody key={day} id={`day-${day}`} className="scroll-mt-20">
                      <tr><td colSpan={7} className="p-0 pt-3">
                        <div className={`border border-white/[0.07] overflow-hidden ${open ? 'rounded-t-xl' : 'rounded-xl'}`}>
                          <DayHeader day={day} s={s} open={open} onToggle={() => toggleDay(day, open)} />
                        </div>
                      </td></tr>
                      {open && rows.map(a => renderRow(a))}
                    </tbody>
                  );
                })}
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-meta px-1 py-3.5">
              <span>
                {filtered.length} บริษัท{view === 'day' ? ` · ${dayGroups.length} วัน` : ''}{filterLabel ? ` · ${filterLabel}` : ''}
                {activeQuarter !== seasonQuarter && ` · ${activeQuarter}`}
              </span>
              {view === 'list' && totalPages > 1 ? (
                <span className="flex items-center gap-2">
                  <button disabled={safePage <= 1} onClick={() => setPage(p => p - 1)} className="px-2.5 py-1 rounded-lg border border-white/[0.08] disabled:opacity-30">‹ ก่อนหน้า</button>
                  <span className="tabular-nums">หน้า {safePage}/{totalPages}</span>
                  <button disabled={safePage >= totalPages} onClick={() => setPage(p => p + 1)} className="px-2.5 py-1 rounded-lg border border-white/[0.08] disabled:opacity-30">ถัดไป ›</button>
                </span>
              ) : (
                <span>กดที่แถวเพื่อดูรายละเอียด</span>
              )}
            </div>
          </div>

          <details className="text-meta group">
            <summary className="cursor-pointer text-[14px] hover:text-white/80">วิธีอ่านหน้านี้</summary>
            <ul className="mt-3 pl-5 list-disc text-[14px] leading-8 text-white/75 max-w-[90ch]">
              <li><b className="text-ink">กำไรโต</b> กำไรเป็นบวกและมากกว่าปีก่อน · <b className="text-ink">พลิกกำไร</b> ปีก่อนขาดทุน (หรือ 0) ไตรมาสนี้กำไร — ไม่คิด % เพราะฐานติดลบ และไม่ถูกนับในอันดับ % โต</li>
              <li><b className="text-ink">กำไรหด</b> ยังกำไรแต่น้อยกว่าปีก่อน · <b className="text-ink">ขาดทุนลดลง / ขาดทุนหนักขึ้น</b> เทียบกับไตรมาสเดียวกันปีก่อน (ปีก่อนกำไรแต่ปีนี้ขาดทุนนับเป็นขาดทุนหนักขึ้น) · <b className="text-ink">ไม่มีฐานเทียบ</b> ไม่มีตัวเลขปีก่อน เช่น หุ้นเข้าตลาดใหม่ หรือไม่มีตัวเลขกำไรเลย เช่น กองทุน / REIT (ไม่นับในสัดส่วนกำไรดีขึ้น)</li>
              <li><b className="text-ink">⚡ เร่งตัว</b> % เทียบปีก่อนของไตรมาสนี้เป็นบวก และสูงกว่า % เทียบปีก่อนของไตรมาสที่แล้ว (โตเร็วขึ้น ไม่ใช่แค่โต) · ถ้าไม่มีงบไตรมาสที่แล้วให้เทียบ จะไม่ติดป้าย</li>
              <li><b className="text-ink">ราคาหลังงบ</b> เทียบกับราคาปิดก่อนประกาศ: วันแรก = ราคาแรกที่ตลาดรับรู้งบ, +1 / +2 / +5 = ราคาปิดหลังวันแรก 1 / 2 / 5 วันทำการ · <b className="text-ink">🔥 PEAD</b> = {PEAD_CRITERIA} · เรียงจาก +2 วันมากไปน้อย</li>
              <li><b className="text-ink">กำไรดีขึ้น</b> = กำไรโต + พลิกกำไร + ขาดทุนลดลง · <b className="text-ink">กำไรแย่ลง</b> = กำไรหด + ขาดทุนหนักขึ้น · ตัวเลข &quot;ไตรมาสก่อน&quot; ใต้แถบสัดส่วน คิดจากบริษัทชุดเดียวกันที่มีงบไตรมาสก่อนให้เทียบ</li>
              <li><span className="inline-block w-[7px] h-[7px] rounded-full bg-[#5B93FF] mr-1.5 align-middle" />จุดสีฟ้าข้างชื่อ = ประกาศวันนี้ · ข้อมูลอัปเดตเป็นรอบ ไม่ใช่ real-time</li>
            </ul>
          </details>

          <p className="text-[12px] text-meta text-right">
            แหล่งข้อมูล: SET (ผ่าน Settrade) · ราคา: Yahoo Finance · ลิงก์เอกสารเปิดที่ set.or.th โดยตรง · ครอบคลุม {feed.universeSize} หลักทรัพย์
          </p>
        </div>
      )}
    </FullWidthPage>
  );
}

