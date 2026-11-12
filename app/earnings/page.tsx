'use client';

import { useState, useEffect, useMemo, useRef, useCallback, Fragment } from 'react';
import Link from 'next/link';
import { RefreshCw, Search } from 'lucide-react';
import { bangkokParts, bangkokHHMM, bangkokDateKey } from '@/lib/utils';
import { TS } from '@/lib/typeScale';
import TableSkeleton from '@/components/TableSkeleton';
import FullWidthPage from '@/components/FullWidthPage';
import { BUCKET_ORDER, BUCKET_LABEL, BUCKET_COLOR, type EarningsBucket } from '@/lib/earningsBucket';
import {
  fixThaiText, reasonPreview, isAccelerating, isPead, peadRanked, PEAD_MIN_YOY, PEAD_MIN_D2_PCT, PEAD_MIN_ADTV_MB,
  priorQuarterImproved, pricePath, compareProfit, type PricePoint,
} from '@/lib/earningsMetrics';
import { fmtMoney, pageBucket, seasonCounts, hasNoProfit } from '@/lib/earningsView';
import {
  SCAN_META, STAGE_COLORS, peadWarnings, type PeadExtra,
} from '@/lib/peadExtras';
import {
  parseView, withView, groupByDay, summarizeDay, announceDay, dayLabel,
  type EarningsView, type DaySummary,
} from '@/lib/earningsDays';
import {
  isLiquid, sectorBoard, SECTOR_MIN, dayHighlights, boardGroup, foldRows, boardComparator, FOLD_NAMES,
  INTEREST_WEIGHTS, INTEREST_YOY_MIN, INTEREST_MAX_SCANS, INTEREST_RS_MIN, INTEREST_UP_STAGES,
  BOARD_SORTS, BOARD_FILTERS, SORT_LABEL, DEFAULT_SORT, ALL_QUARTERS_PARAM,
  type SectorScope, type SectorRow, type BoardSort, type BoardFilter,
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
const TAG_ACC = 'text-emerald-300 bg-emerald-400/10'; // ⚡ เร่งตัว = good news

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

// ── Layer 2: เด่นของวัน + ราคาวิ่งต่อหลังงบ (PEAD) ────────────────────────────

/** The PEAD rule in words - numbers come from the constants in earningsMetrics.ts. */
const PEAD_CRITERIA = `กำไรโต ≥ ${PEAD_MIN_YOY}% หรือพลิกกำไร · ราคา +2 วันหลังงบ ≥ +${PEAD_MIN_D2_PCT}% · ซื้อขาย ≥ ${PEAD_MIN_ADTV_MB} ล./วัน`;
/** Rows shown in each layer-2 box. */
const BOX_TOP = 6;

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

/** Badges after a ticker - one component for every list on the page: ⚡ เร่งตัว · market
 *  stage · RS · scans it sits in · warnings (auditor, Weinstein 3). Liquidity has its own
 *  ล./วัน column, so no "สภาพคล่องต่ำ" badge here. No data → no badge. */
function StockBadges({ a, extra }: { a: EarningsAnnouncement; extra: PeadExtra | undefined }) {
  const warns = peadWarnings(a.auditorOpinion, extra).filter(w => w.key !== 'liquidity');
  return (
    <>
      {isAccelerating(a) && <PTag cls={TAG_ACC} title="% เทียบปีก่อนของไตรมาสนี้ สูงกว่าของไตรมาสที่แล้ว (กำไรโตเร็วขึ้น)">⚡ เร่งตัว</PTag>}
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

/** ADTV, million baht/day: ≥ 100 whole numbers, else 1 decimal. */
function fmtAdtv(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return v >= 100 ? String(Math.round(v)) : v.toFixed(1);
}

/** เทียบปีก่อน (layer 2): "พลิกกำไร" or the %YoY, with "ปีก่อน → ไตรมาสนี้" underneath. */
function YoYBig({ a }: { a: EarningsAnnouncement }) {
  const c = compareProfit(a.netProfit, a.netProfitPrior);
  const sub = <span className="block text-[11.5px] font-normal text-meta tabular-nums whitespace-nowrap">{fmtMoney(a.netProfitPrior)} → {fmtMoney(a.netProfit)}</span>;
  const title = `${quarterShort(a.quarter, 4) ?? 'ปีก่อน'} ${fmtMoney(a.netProfitPrior)} → ${quarterShort(a.quarter) ?? 'ไตรมาสนี้'} ${fmtMoney(a.netProfit)}`;
  if (c?.kind === 'turnaround') return <span className="font-semibold" style={{ color: UP }} title={title}>พลิกกำไร{sub}</span>;
  if (c?.kind === 'pct') return <span className="font-semibold" title={title}><Pct v={c.pct} digits={0} />{sub}</span>;
  return <span className="text-meta" title={title}>—</span>;
}

/** ไตรมาสก่อน (layer 2): % vs last quarter, or a short label. */
function QoQSmall({ a }: { a: EarningsAnnouncement }) {
  const c = compareProfit(a.netProfit, a.netProfitPriorQ);
  const title = a.priorQuarter ? `${a.priorQuarter} ${fmtMoney(a.netProfitPriorQ)}` : 'ยังไม่มีงบไตรมาสก่อน';
  if (!c) return <span className="text-meta" title={title}>—</span>;
  if (c.kind === 'pct') return <span title={title}><Pct v={c.pct} digits={0} /></span>;
  if (c.kind === 'turnaround') return <span title={title}><Tag cls={TAG_TURN}>พลิก</Tag></span>;
  if (c.kind === 'to_loss') return <span title={title}><Tag cls={TAG_LOSS}>พลิกขาดทุน</Tag></span>;
  return <span className="text-[13px]" title={title} style={{ color: c.kind === 'loss_less' ? BUCKET_COLOR.loss_shrink : DOWN }}>{c.kind === 'loss_less' ? 'ขาดทุนลดลง' : 'ขาดทุนเพิ่ม'}</span>;
}

/** 5 days before → 5 days after the announcement: line at the announcement, the days after
 *  it shaded, dashed 0% line. Stretches with its cell (strokes don't scale). */
function PeadPriceChart({ a, height = 34 }: { a: EarningsAnnouncement; height?: number }) {
  const { pre, post } = pricePath(a);
  if (!post.length) return <span className="text-meta text-[12.5px]">ยังไม่มีราคา</span>;
  const W = 160, H = height, PAD = 3;
  const ys = [...pre, ...post].map(p => p.y).concat(0);
  const lo = Math.min(...ys) - 0.5;
  const hi = Math.max(...ys, 1) + 0.5;
  const X = (x: number) => PAD + ((x + 5) / 10) * (W - 2 * PAD);
  const Y = (y: number) => H - PAD - ((y - lo) / (hi - lo)) * (H - 2 * PAD);
  const line = (pts: PricePoint[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)} ${Y(p.y).toFixed(1)}`).join('');
  const base = pre[pre.length - 1];
  const last = post[post.length - 1];
  const col = last.y >= 0 ? UP : DOWN;
  const ann = X(-1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block w-full" style={{ height: H }} role="img"
      aria-label={`${a.ticker} ราคา 5 วันก่อนถึง 5 วันหลังประกาศงบ`}>
      <title>ราคา 5 วันก่อน → 5 วันหลังประกาศ (เทียบราคาปิดก่อนประกาศ)</title>
      <rect x={ann} y={0} width={W - PAD - ann} height={H} fill="rgba(91,147,255,0.06)" />
      <line x1={PAD} x2={W - PAD} y1={Y(0)} y2={Y(0)} stroke="rgba(255,255,255,0.14)" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
      <line x1={ann} x2={ann} y1={0} y2={H} stroke="rgba(91,147,255,0.55)" vectorEffect="non-scaling-stroke" />
      {pre.length > 1 && <path d={line(pre)} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />}
      <path d={line([base, ...post])} fill="none" stroke={col} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** หุ้น cell of the layer-2 boxes: ticker + badges, then group · time / date. */
function StockCell({ a, extra, sub }: { a: EarningsAnnouncement; extra: PeadExtra | undefined; sub: string }) {
  return (
    <span className="block min-w-0">
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <b className="text-ink text-[16px]">{a.ticker}</b>
        <StockBadges a={a} extra={extra} />
      </span>
      <span className="block truncate text-[12.5px] text-meta mt-0.5" title={`${a.subsector || a.sector || ''} · ประกาศ ${fullDateTime(a.announceDate)}`}>{sub}</span>
    </span>
  );
}

function onActivate(fn: () => void) {
  return {
    role: 'button' as const, tabIndex: 0, onClick: fn,
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } },
  };
}

const BOX_ROW = 'border-b border-white/[0.07] last:border-b-0 hover:bg-white/[0.025] cursor-pointer focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#33507f]';
// Tracks per box width (container query on the box): หุ้น | กำไร | เทียบปีก่อน | ไตรมาสก่อน | ล./วัน.
const HL_GRID = [
  'grid gap-x-3 items-center grid-cols-[minmax(0,1fr)_136px_44px]',
  '@min-[400px]:grid-cols-[minmax(0,1fr)_84px_150px_56px]',
  '@min-[600px]:grid-cols-[minmax(0,1fr)_92px_158px_78px_62px]',
].join(' ');
const HL_N = 'hidden @min-[400px]:block';
const HL_Q = 'hidden @min-[600px]:block';
// หุ้น | เทียบปีก่อน | กราฟราคา | วันแรก | +2 | +5.
const PD_GRID = [
  'grid gap-x-3 items-center grid-cols-[minmax(0,1fr)_132px_54px]',
  '@min-[400px]:grid-cols-[minmax(0,1fr)_150px_60px]',
  '@min-[640px]:grid-cols-[minmax(0,1fr)_140px_minmax(100px,140px)_58px_58px_58px]',
].join(' ');
const PD_X = 'hidden @min-[640px]:block';
const BOX_HEAD = 'py-2 text-[12px] text-meta border-b border-white/[0.07] [&>span:not(:first-child)]:text-right';

function HighlightsBox({ rows, day, extras, onPick }: {
  rows: EarningsAnnouncement[]; day: string; extras: Record<string, PeadExtra> | undefined; onPick: (a: EarningsAnnouncement) => void;
}) {
  const { passed, total } = useMemo(() => dayHighlights(rows, day, a => extras?.[a.ticker]), [rows, day, extras]);
  return (
    <section className={`${PANEL} @container`} aria-label="เด่นของวัน">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[16px] font-semibold text-ink">เด่นของวัน <span className="text-[13px] font-normal text-meta">{day ? dayLabel(day) : ''}</span></h2>
        <span className="text-[12.5px] text-meta">ผ่านเกณฑ์ <b className="text-ink font-semibold tabular-nums">{passed.length}</b> จาก {total} บริษัท</span>
      </div>
      <p className="text-[12.5px] text-meta mt-1">
        กำไรโต หรือพลิกกำไร + ซื้อขาย ≥ {PEAD_MIN_ADTV_MB} ล./วัน · เรียงตามคะแนนน่าสนใจ (เร่งตัว · ติดสแกน · stage · RS) · ตัวที่ควรจับตาวันถัดไป ยังไม่ใช่ PEAD เพราะต้องรอราคา 2 วัน
      </p>
      {passed.length === 0 ? (
        <p className="py-5 text-[13.5px] text-meta">ไม่มีตัวที่ผ่านเกณฑ์ในวันนี้</p>
      ) : (
        <div className="text-[15px]">
          <div className={`${HL_GRID} ${BOX_HEAD}`}>
            <span>หุ้น</span><span className={HL_N}>กำไร</span><span>เทียบปีก่อน</span><span className={HL_Q}>ไตรมาสก่อน</span><span>ล./วัน</span>
          </div>
          {passed.slice(0, BOX_TOP).map(a => (
            <div key={rowKey(a)} {...onActivate(() => onPick(a))} className={`${HL_GRID} py-2.5 ${BOX_ROW}`}>
              <StockCell a={a} extra={extras?.[a.ticker]} sub={`${boardGroup(a)} · ${bangkokHHMM(new Date(a.announceDate))} น.`} />
              <span className={`${HL_N} text-right tabular-nums font-semibold`} style={{ color: a.netProfit != null && a.netProfit < 0 ? DOWN : undefined }}>{fmtMoney(a.netProfit)}</span>
              <span className="text-right"><YoYBig a={a} /></span>
              <span className={`${HL_Q} text-right font-semibold`}><QoQSmall a={a} /></span>
              <span className="text-right tabular-nums font-medium">{fmtAdtv(extras?.[a.ticker]?.adtv)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function PeadBox({ rows, extras, onPick, onShowAll }: {
  rows: EarningsAnnouncement[]; extras: Record<string, PeadExtra> | undefined;
  onPick: (a: EarningsAnnouncement) => void; onShowAll: () => void;
}) {
  const ranked = useMemo(() => peadRanked(rows, a => extras?.[a.ticker]?.adtv), [rows, extras]);
  return (
    <section className={`${PANEL} @container`} aria-label="ราคาวิ่งต่อหลังงบ">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[16px] font-semibold text-ink">ราคาวิ่งต่อหลังงบ <span className="text-[13px] font-normal text-meta">(PEAD)</span></h2>
        {ranked.length > 0 && (
          <button type="button" onClick={onShowAll} className="text-[13px] text-[#5B93FF] hover:text-blue-300">ดูทั้ง {ranked.length} ตัวในตาราง →</button>
        )}
      </div>
      <p className="text-[12.5px] text-meta mt-1">{PEAD_CRITERIA} · เรียงตาม +2 วัน</p>
      {ranked.length === 0 ? (
        <p className="py-5 text-[13.5px] text-meta">ยังไม่มีหุ้นเข้าเกณฑ์</p>
      ) : (
        <div className="text-[15px]">
          <div className={`${PD_GRID} ${BOX_HEAD}`}>
            <span>หุ้น</span><span>เทียบปีก่อน</span><span className={`${PD_X} text-center!`}>5 วันก่อน → 5 วันหลัง</span>
            <span className={PD_X}>วันแรก</span><span className="font-semibold text-white/80">+2 วัน</span><span className={PD_X}>+5 วัน</span>
          </div>
          {ranked.slice(0, BOX_TOP).map(a => (
            <div key={rowKey(a)} {...onActivate(() => onPick(a))} className={`${PD_GRID} py-2.5 ${BOX_ROW}`}>
              <StockCell a={a} extra={extras?.[a.ticker]} sub={`${boardGroup(a)} · ประกาศ ${dayLabel(announceDay(a))}`} />
              <span className="text-right"><YoYBig a={a} /></span>
              <span className={`${PD_X} min-w-0`}><PeadPriceChart a={a} /></span>
              <span className={`${PD_X} text-right`}><D v={a.gap_pct} /></span>
              <span className="text-right"><D v={a.drift_d2_pct} bold /></span>
              <span className={`${PD_X} text-right`}><D v={a.drift_d5_pct} /></span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── Main table ───────────────────────────────────────────────────────────────

const FILTER_LABEL: Record<BoardFilter, string> = { acc: '⚡ เร่งตัว', scan: 'ติดสแกน', pead: 'PEAD' };
const ALL_QUARTERS_LABEL = 'ทุกไตรมาส';

function filterPass(a: EarningsAnnouncement, k: BoardFilter, extra: PeadExtra | undefined): boolean {
  if (k === 'acc') return isAccelerating(a);
  if (k === 'scan') return (extra?.scans?.length ?? 0) > 0;
  return isPead(a, extra?.adtv);
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

/** Above this % the year-ago / last-quarter base was tiny - "ฐานต่ำ" next to the %. */
const LOW_BASE_PCT = 300;

/** บรรทัดล่างของช่องเทียบ: % (+ "ฐานต่ำ" when asked) or the label for a sign flip / loss-vs-loss. */
function ChangeLine({ cur, base, lowBase }: { cur: number | null | undefined; base: number | null | undefined; lowBase?: boolean }) {
  const c = compareProfit(cur, base);
  if (!c) return <span className="text-meta">—</span>;
  if (c.kind === 'pct') return (
    <span className="whitespace-nowrap"><Pct v={c.pct} />
      {lowBase && c.pct > LOW_BASE_PCT && <> <Tag cls={TAG_LOWBASE} title="กำไรโตเกิน 300% เพราะฐานกำไรเดิมน้อยมาก ดูจำนวนเงินประกอบ">ฐานต่ำ</Tag></>}
    </span>
  );
  if (c.kind === 'turnaround') return <Tag cls={TAG_TURN} title="ฐานขาดทุน ตอนนี้กำไร (ไม่คิด %)">พลิกกำไร</Tag>;
  if (c.kind === 'to_loss') return <Tag cls={TAG_LOSS} title="ฐานกำไร ตอนนี้ขาดทุน">พลิกขาดทุน</Tag>;
  if (c.kind === 'loss_more') return <span style={{ color: DOWN }}>ขาดทุนเพิ่มขึ้น</span>;
  return <span style={{ color: BUCKET_COLOR.loss_shrink }}>ขาดทุนลดลง</span>;
}

const TAG_LOWBASE = 'text-white/55 bg-white/[0.07]';
const TAG_FIX = 'text-amber-200 bg-amber-400/10';

/** ช่องเทียบ: amount on top (dim), change underneath. */
function CompareCell({ cur, base, title, lowBase }: { cur: number | null | undefined; base: number | null | undefined; title?: string; lowBase?: boolean }) {
  return (
    <div title={title}>
      <div className="tabular-nums text-white/60">{fmtMoney(base)}</div>
      <div className="text-[12.5px] leading-5"><ChangeLine cur={cur} base={base} lowBase={lowBase} /></div>
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
function ProfitBars({ history, w = 84, h = 30 }: { history: { q: string; np: number | null }[]; w?: number; h?: number }) {
  const vals = history.map(x => x.np).filter((v): v is number => v != null);
  if (!vals.length) return <span className="text-meta text-[13px]">—</span>;
  const max = Math.max(...vals.map(Math.abs)) || 1;
  const hasNeg = vals.some(v => v < 0);
  const zero = hasNeg ? h / 2 : h - 2;
  const scale = (hasNeg ? h / 2 - 2 : h - 4) / max;
  const slot = w / history.length;
  const bw = Math.min(12, slot - 5);
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
  return <i className="inline-block w-2.5 h-2.5 rounded-[2px] mr-1 align-[-1px]" style={style} />;
}

/** "วิธีอ่าน": every legend of the page in one popover - badges, the 5-quarter bars, the
 *  "น่าสนใจ" score (read from INTEREST_WEIGHTS), buckets and PEAD. */
function HowToRead() {
  const W = INTEREST_WEIGHTS;
  const sign = (n: number) => (n > 0 ? `+${n}` : String(n));
  return (
    <details className="group">
      <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer text-[13px] text-[#5B93FF] hover:text-blue-300 border border-white/[0.12] rounded-full px-3 py-1 select-none">วิธีอ่าน</summary>
      <div className="absolute z-20 right-0 left-0 @min-[560px]:left-auto @min-[560px]:w-[480px] top-full mt-2 bg-[#1a1f2b] border border-white/[0.14] rounded-xl px-4 py-3.5 shadow-[0_12px_40px_rgba(0,0,0,0.5)] text-[13px] leading-7 text-white/75">
        <div className="text-white/90 font-medium">ป้ายหลังชื่อหุ้น</div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span><PTag cls={TAG_ACC}>⚡ เร่งตัว</PTag> กำไรโตเร็วขึ้นกว่าไตรมาสก่อน</span>
          <span className="inline-flex items-center gap-1"><i className="inline-block w-2 h-2 rounded-full" style={{ background: STAGE_COLORS['Bull'] }} />Market Stage</span>
          <span>RS = RS Rating</span>
          <span><PTag cls={TAG_SCAN}>SEPA</PTag> ติดสแกนนี้อยู่ตอนนี้</span>
          <span><PTag cls={TAG_AMBER}>Weinstein 3 ทำยอด</PTag></span>
          <span><PTag cls={TAG_AMBER}>ผู้สอบบัญชีมีข้อสังเกต</PTag></span>
          <span><PTag cls={TAG_WARN_RED}>ผู้สอบบัญชี: มีเงื่อนไข</PTag></span>
          <span><Tag cls={TAG_LOWBASE}>ฐานต่ำ</Tag> โตเกิน {LOW_BASE_PCT}% เพราะฐานเดิมน้อยมาก ดูจำนวนเงินประกอบ</span>
          <span><Tag cls={TAG_FIX}>แก้ไข</Tag> งบฉบับแก้ไข</span>
        </div>
        <div className="text-white/90 font-medium mt-2">กราฟกำไร 5 ไตรมาส</div>
        <div className="flex flex-wrap gap-x-3">
          <span><Sw style={{ border: `1.5px solid ${BAR_YEAR_AGO}` }} />ไตรมาสเดียวกันปีก่อน</span>
          <span><Sw style={{ background: BAR_NOW }} />ไตรมาสนี้</span>
          <span><Sw style={{ background: BAR_OTHER }} />ไตรมาสอื่น</span>
          <span><Sw style={{ background: BAR_LOSS }} />ขาดทุน (ชี้ลง)</span>
          <span>ช่องว่าง = ไม่มีข้อมูล</span>
        </div>
        <div className="text-white/90 font-medium mt-2">เรียง &quot;น่าสนใจก่อน&quot; <span className="text-meta font-normal">(ค่าทดลอง)</span></div>
        <div>
          กำไรโต / พลิกกำไร {sign(W.growth)} · ขาดทุนลดลง {sign(W.lossShrink)} · โต ≥ {INTEREST_YOY_MIN}% {sign(W.bigYoY)} · ⚡ เร่งตัว {sign(W.accel)} ·
          ติดสแกน {sign(W.perScan)} ต่อสแกน (สูงสุด {INTEREST_MAX_SCANS}) · Stage {INTEREST_UP_STAGES.join(' / ')} {sign(W.stageUp)} · RS ≥ {INTEREST_RS_MIN} {sign(W.rs)} ·
          ซื้อขาย &lt; {PEAD_MIN_ADTV_MB} ล./วัน หรือไม่มีข้อมูล {sign(W.illiquid)} · ผู้สอบบัญชีมีเงื่อนไข / ไม่แสดงความเห็น {sign(W.auditorRed)} · Weinstein 3 {sign(W.weinstein3)}
        </div>
        <div className="text-white/90 font-medium mt-2">ผลงบ</div>
        <div>
          กำไรดีขึ้น = กำไรโต + พลิกกำไร + ขาดทุนลดลง · กำไรแย่ลง = กำไรหด + ขาดทุนหนักขึ้น · พลิกกำไร = ปีก่อนขาดทุน (หรือ 0) ไม่คิด % ·
          ไม่มีฐานเทียบ = ไม่มีตัวเลขปีก่อน (ไม่นับในสัดส่วน) · ⚡ เร่งตัว = % เทียบปีก่อนเป็นบวกและสูงกว่าของไตรมาสที่แล้ว
        </div>
        <div className="text-white/90 font-medium mt-2">ราคาหลังงบ · ซื้อขาย</div>
        <div>
          เทียบราคาปิดก่อนประกาศ: วันแรก → หลัง 2 วันทำการ · PEAD = {PEAD_CRITERIA} · ล./วัน = มูลค่าซื้อขายเฉลี่ยต่อวัน
          (<span className="text-orange-300">สีส้ม</span> = ต่ำกว่า {PEAD_MIN_ADTV_MB} ล./วัน) · ข้อมูลอัปเดตเป็นรอบ ไม่ใช่ real-time
        </div>
      </div>
    </details>
  );
}

function K({ children }: { children: React.ReactNode }) {
  return <span className="text-meta">{children}</span>;
}

// Expanded row: only what the row doesn't already show. Columns that drop out on
// narrower boxes (ไตรมาสก่อน / 5 ไตรมาส / 9 เดือน / ล./วัน) come back here at exactly
// those container widths (same breakpoints as T_GRID).
function DetailRow({ a, extra }: { a: EarningsAnnouncement; extra: PeadExtra | undefined }) {
  const reason = reasonOf(a);
  return (
    <div className="grid grid-cols-1 @min-[520px]:grid-cols-[160px_1fr] gap-x-6 gap-y-1.5 text-[14px] whitespace-normal">
      <div className="contents @min-[520px]:hidden">
        <K>ซื้อขาย</K><span className="tabular-nums">{fmtAdtv(extra?.adtv)} ล./วัน</span>
      </div>
      <div className="contents @min-[772px]:hidden">
        <K>ไตรมาสก่อน{a.priorQuarter ? ` (${quarterShort(a.priorQuarter)})` : ''}</K>
        <span className="tabular-nums">{fmtMoney(a.netProfitPriorQ)} · <ChangeLine cur={a.netProfit} base={a.netProfitPriorQ} lowBase /></span>
      </div>
      {a.profitHistory?.length ? (
        <div className="contents @min-[1332px]:hidden">
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
        <div className="contents @min-[1332px]:hidden">
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
        {a.gap_pct != null && <span className="block mt-1.5 max-w-full overflow-hidden"><PriceChart a={a} w={300} h={60} /></span>}
      </span>
      <K>ข้อความจาก MD&amp;A</K>
      <span className="text-white/75 leading-relaxed break-words">{reason || <span className="text-meta">ยังไม่มีข้อความสรุปจาก MD&amp;A</span>}</span>
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

// Table tracks per container width (the layer-3 section is the container):
// ≥1332: หุ้น | กำไรสุทธิ | ปีก่อน | ไตรมาสก่อน | 5 ไตรมาส | 9 เดือน | ล./วัน | ราคาหลังงบ
// 772-1331: no 5 ไตรมาส / 9 เดือน · 520-771: no ไตรมาสก่อน / ราคาหลังงบ · <520: no ล./วัน
const T_GRID = [
  'grid items-center gap-x-2.5 @min-[520px]:gap-x-3.5',
  'grid-cols-[minmax(0,1fr)_78px_96px]',
  '@min-[520px]:grid-cols-[minmax(180px,1fr)_88px_104px_58px]',
  '@min-[772px]:grid-cols-[minmax(280px,1fr)_100px_112px_112px_74px_90px]',
  '@min-[1332px]:grid-cols-[minmax(330px,1fr)_104px_118px_118px_86px_118px_78px_96px]',
].join(' ');
const C_Q = 'hidden @min-[772px]:block';
const C_5 = 'hidden @min-[1332px]:block';
const C_L = 'hidden @min-[520px]:block';
const C_X = 'hidden @min-[772px]:block';
const ROW_PAD = 'px-2.5 @min-[520px]:px-3.5';

/** หัววัน: วัน · N บริษัท · แสดง X · bar · กำไรดีขึ้น Y% · เปิดดู / พับ. */
function DayHeader({ day, s, shown, hiding, open, onToggle }: {
  day: string; s: DaySummary; shown: number; hiding: boolean; open: boolean; onToggle: () => void;
}) {
  return (
    <button type="button" onClick={onToggle} aria-expanded={open}
      className={`w-full flex flex-wrap items-center gap-x-4 gap-y-1.5 ${ROW_PAD} py-2.5 text-left bg-[#13161e] hover:bg-[#171b25]`}>
      <span className={`text-white/40 text-[11px] transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
      <span className="text-[15px] font-semibold text-ink whitespace-nowrap min-w-[88px]">{dayLabel(day)}</span>
      <span className="text-[13px] text-meta whitespace-nowrap">
        <b className="text-ink font-semibold tabular-nums">{s.n}</b> บริษัท{hiding && <> · แสดง <b className="text-ink font-semibold tabular-nums">{shown}</b></>}
      </span>
      <CountsBar counts={s.counts} n={s.n} className="h-[5px] w-[90px] md:w-[150px]" />
      {s.improvedPct != null && (
        <span className="text-[13px] text-meta whitespace-nowrap">กำไรดีขึ้น <b className="font-semibold tabular-nums" style={{ color: s.improvedPct >= 50 ? UP : DOWN }}>{s.improvedPct}%</b></span>
      )}
      <span className="ml-auto text-[13px] text-meta">{open ? 'พับ' : 'เปิดดู'}</span>
    </button>
  );
}

/** Folded line at the end of a day / the list: "<label> N · names … [แสดง]". */
function FoldLine({ label, unit, rows, open, onToggle }: {
  label: string; unit: string; rows: EarningsAnnouncement[]; open: boolean; onToggle: () => void;
}) {
  return (
    <div className={`${ROW_PAD} py-2.5 border-t border-white/[0.07] bg-white/[0.015] text-[13px] text-meta`}>
      {label} <b className="text-white/80 font-medium tabular-nums">{rows.length}</b> {unit}
      {!open && <> · {rows.slice(0, FOLD_NAMES).map(a => a.ticker).join(' · ')}{rows.length > FOLD_NAMES ? ' …' : ''}</>}
      <button type="button" onClick={onToggle} className="ml-2 text-[#5B93FF] hover:text-blue-300">{open ? 'ซ่อน' : 'แสดง'}</button>
    </div>
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
  const [filters, setFilters] = useState<BoardFilter[]>([]);
  const [quarter, setQuarter] = useState<string | null>(null); // null = season quarter, ALL_QUARTERS_PARAM = every quarter
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<BoardSort>(DEFAULT_SORT);
  const [hideIlliquid, setHideIlliquid] = useState(true);
  // รายวัน / รายการเดียว, bound to ?view=. Read from the URL in the initializer: the table
  // only renders after the feed loads (never on the server), so this can't mismatch.
  const [view, setViewState] = useState<EarningsView>(() =>
    typeof window === 'undefined' ? 'day' : parseView(new URLSearchParams(window.location.search).get('view')));
  const [daySel, setDaySel] = useState<string | null>(null); // null = newest day with a filing
  const [scope, setScope] = useState<SectorScope>('day');
  const [openKey, setOpenKey] = useState<string | null>(null);
  // Day groups the user opened / closed; the others follow the selected day (only it is open).
  const [dayToggled, setDayToggled] = useState<Map<string, boolean>>(new Map());
  // Folds the user opened: "ill:<day|all>" / "fund:<day|all>".
  const [unfolded, setUnfolded] = useState<Set<string>>(new Set());
  const scrollTarget = useRef<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

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
  const extraOf = useCallback((a: EarningsAnnouncement) => extras?.[a.ticker], [extras]);
  const adtvOf = useCallback((a: EarningsAnnouncement) => extras?.[a.ticker]?.adtv, [extras]);

  const quarters = useMemo(() => {
    const s = new Set(feed.announcements.map(a => a.quarter?.trim()).filter((q): q is string => !!q));
    return [...s].sort((x, y) => parseQuarterScore(y) - parseQuarterScore(x));
  }, [feed.announcements]);
  // The season = the newest quarterly filing (an annual filing never names the season).
  const seasonQuarter = useMemo(() => quarters.find(q => q.startsWith('ไตรมาส')) ?? quarters[0] ?? null, [quarters]);
  // A quarter the data doesn't have (old link, typo) → the season.
  const activeQuarter = quarter === ALL_QUARTERS_PARAM ? ALL_QUARTERS_PARAM
    : quarter && quarters.includes(quarter) ? quarter : seasonQuarter ?? ALL_QUARTERS_PARAM;

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
    () => feed.announcements.filter(a => activeQuarter === ALL_QUARTERS_PARAM || a.quarter === activeQuarter),
    [feed.announcements, activeQuarter]
  );
  const searched = useMemo(() => {
    const q = query.trim().toUpperCase();
    return q ? quarterRows.filter(a => a.ticker.includes(q)) : quarterRows;
  }, [quarterRows, query]);

  const passFilters = useCallback((a: EarningsAnnouncement, skip?: BoardFilter) =>
    filters.every(k => k === skip || filterPass(a, k, extraOf(a))), [filters, extraOf]);

  const filtered = useMemo(
    () => searched.filter(a => (!tab || pageBucket(a) === tab) && passFilters(a)).sort(boardComparator(sort, extraOf)),
    [searched, tab, passFilters, sort, extraOf]
  );
  const folded = useMemo(() => foldRows(filtered, hideIlliquid, adtvOf), [filtered, hideIlliquid, adtvOf]);

  // Column sub-labels name the real quarters (from the selected quarter) - never hard-coded.
  const hdr = useMemo(() => {
    const label = activeQuarter !== ALL_QUARTERS_PARAM ? activeQuarter : null;
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

  // Scroll the row a layer-2 box asked for into view once it has rendered open.
  useEffect(() => {
    if (!scrollTarget.current) return;
    const el = document.getElementById(`row-${scrollTarget.current}`);
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    scrollTarget.current = null;
  }, [openKey, dayToggled]);

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
  const toggleFold = (key: string) => setUnfolded(s => {
    const next = new Set(s);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const toggleFilter = (k: BoardFilter) =>
    setFilters(prev => (prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]));

  // A row in a layer-2 box: show it in the table (season, no filters), its day open, expanded.
  const pick = (a: EarningsAnnouncement) => {
    const key = rowKey(a);
    setTab(null);
    setFilters([]);
    setQuery('');
    setQuarter(a.quarter === seasonQuarter ? null : a.quarter ?? ALL_QUARTERS_PARAM);
    if (view !== 'day') setView('day');
    setDayToggled(m => new Map(m).set(announceDay(a), true));
    if (!isLiquid(adtvOf(a))) setUnfolded(s => new Set(s).add(`ill:${announceDay(a)}`));
    setOpenKey(key);
    scrollTarget.current = key;
  };
  const showAllPead = () => {
    setTab(null);
    setQuarter(null);
    setQuery('');
    setFilters(['pead']);
    setView('list');
    tableRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  // One table row (+ its expanded detail) - used by both รายการเดียว and รายวัน.
  const renderRow = (a: EarningsAnnouncement) => {
    const key = rowKey(a);
    const open = openKey === key;
    const extra = extraOf(a);
    const reason = reasonPreview(a.reason);
    const when = `${view === 'list' ? `${dayLabel(announceDay(a))} ` : ''}${a.announceDate ? bangkokHHMM(new Date(a.announceDate)) : '—'} น.`;
    const adtv = extra?.adtv;
    return (
      <Fragment key={key}>
        <div id={`row-${key}`} {...onActivate(() => setOpenKey(open ? null : key))} aria-expanded={open}
          className={`${T_GRID} ${ROW_PAD} py-2 border-t border-white/[0.07] cursor-pointer scroll-mt-24 ${open ? 'bg-white/[0.03]' : 'hover:bg-white/[0.02]'}`}>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <b className="text-ink text-[16px]">{a.ticker}</b>
              {a.isCorrection && <Tag cls={TAG_FIX} title="งบฉบับแก้ไข">แก้ไข</Tag>}
              <StockBadges a={a} extra={extra} />
            </div>
            <div className="text-[12.5px] text-meta truncate mt-0.5" title={reason || `${a.subsector || a.sector || ''} · ประกาศ ${fullDateTime(a.announceDate)}`}>
              {boardGroup(a)} · {when}
              {activeQuarter === ALL_QUARTERS_PARAM && a.quarter && <> · {quarterShort(a.quarter) ?? a.quarter}</>}
              {reason && <> · <span className="text-white/55">{reason}</span></>}
            </div>
          </div>
          <div className="text-right tabular-nums whitespace-nowrap font-semibold" style={{ color: a.netProfit != null && a.netProfit < 0 ? DOWN : undefined }}>
            {fmtMoney(a.netProfit)}
          </div>
          <div className="text-right whitespace-nowrap">
            <CompareCell cur={a.netProfit} base={a.netProfitPrior} lowBase title={quarterShort(a.quarter, 4) ?? 'งวดเดียวกันปีก่อน'} />
          </div>
          <div className={`${C_Q} text-right whitespace-nowrap`}>
            <CompareCell cur={a.netProfit} base={a.netProfitPriorQ} lowBase title={a.priorQuarter ?? undefined} />
          </div>
          <div className={`${C_5} text-right`}>
            {a.profitHistory?.length ? <ProfitBars history={a.profitHistory} /> : <span className="text-meta">—</span>}
          </div>
          <div className={`${C_5} text-right whitespace-nowrap`}>
            {a.netProfitCum != null ? (
              <div title={`${a.cumMonths} เดือน ปีนี้ ${fmtMoney(a.netProfitCum)} · ปีก่อน ${fmtMoney(a.netProfitCumPrior)}`}>
                <div className="tabular-nums text-white/60">{fmtMoney(a.netProfitCum)}</div>
                <div className="text-[12.5px] leading-5"><ChangeLine cur={a.netProfitCum} base={a.netProfitCumPrior} /></div>
              </div>
            ) : <span className="text-meta">—</span>}
          </div>
          <div className={`${C_L} text-right tabular-nums font-medium ${adtv == null ? 'text-meta' : isLiquid(adtv) ? '' : 'text-orange-300'}`}
            title={adtv == null ? 'ไม่มีข้อมูลมูลค่าซื้อขาย' : `มูลค่าซื้อขายเฉลี่ย ${adtv.toFixed(2)} ล้านบาท/วัน`}>
            {fmtAdtv(adtv)}
          </div>
          <div className={`${C_X} text-right whitespace-nowrap`}>
            {a.gap_pct == null ? <Wait title="รอครบวันทำการ" /> : (
              <>
                <div className="font-medium"><Pct v={a.gap_pct} /></div>
                <div className="text-[12.5px] leading-5 text-meta">→ {a.drift_d2_pct == null ? <Wait title="รอครบ 2 วันทำการ" /> : <Pct v={a.drift_d2_pct} />}</div>
              </>
            )}
          </div>
        </div>
        {open && (
          <div className="border-t border-white/[0.07] bg-[#13161e] px-3 md:px-5 pt-4 pb-5"><DetailRow a={a} extra={extra} /></div>
        )}
      </Fragment>
    );
  };

  // Rows of one day (or the whole list): shown rows, then the low-liquidity fold, then funds.
  const renderBody = (rows: EarningsAnnouncement[], key: string) => {
    const f = foldRows(rows, hideIlliquid, adtvOf);
    const illOpen = unfolded.has(`ill:${key}`);
    const fundOpen = unfolded.has(`fund:${key}`);
    return (
      <>
        {f.shown.map(renderRow)}
        {!f.shown.length && (
          <div className={`${ROW_PAD} py-4 border-t border-white/[0.07] text-[13.5px] text-meta`}>
            {f.illiquid.length ? `ไม่มีหุ้นที่ซื้อขาย ≥ ${PEAD_MIN_ADTV_MB} ล./วัน ในกลุ่มนี้` : f.funds.length ? 'มีแต่กองทุน / REIT' : 'ไม่มีหุ้นที่ตรงเงื่อนไข'}
          </div>
        )}
        {f.illiquid.length > 0 && (
          <>
            <FoldLine label="สภาพคล่องต่ำ" unit="บริษัท" rows={f.illiquid} open={illOpen} onToggle={() => toggleFold(`ill:${key}`)} />
            {illOpen && f.illiquid.map(renderRow)}
          </>
        )}
        {f.funds.length > 0 && (
          <>
            <FoldLine label="กองทุน / REIT (ไม่มีข้อมูลกำไร)" unit="รายการ" rows={f.funds} open={fundOpen} onToggle={() => toggleFold(`fund:${key}`)} />
            {fundOpen && f.funds.map(renderRow)}
          </>
        )}
      </>
    );
  };

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
        <div className="@container">
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

          <div className="grid grid-cols-1 @min-[1400px]:grid-cols-2 gap-3.5 mt-3.5">
            <HighlightsBox rows={seasonRows} day={selDay} extras={extras} onPick={pick} />
            <PeadBox rows={seasonRows} extras={extras} onPick={pick} onShowAll={showAllPead} />
          </div>

          <section ref={tableRef} className="@container mt-7 scroll-mt-20" aria-label="ทุกบริษัทที่ประกาศ">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[16px] font-semibold text-ink">
                ทุกบริษัทที่ประกาศ{' '}
                <span className="text-[13px] font-normal text-meta">
                  · แสดง {folded.shown.length} จาก {filtered.length} บริษัท{hideIlliquid && folded.illiquid.length ? ` (ซ่อนสภาพคล่องต่ำ ${folded.illiquid.length})` : ''}
                </span>
              </h2>
              <span className="inline-flex border border-white/[0.12] rounded-lg overflow-hidden" role="group" aria-label="มุมมองตาราง">
                {(['day', 'list'] as const).map(v => (
                  <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v} className={SEG_BTN(view === v)}>
                    {v === 'day' ? 'รายวัน' : 'รายการเดียว'}
                  </button>
                ))}
              </span>
            </div>

            {/* Tabs - one at a time, never wrap (scroll sideways on a narrow screen) */}
            <div className="flex flex-nowrap overflow-x-auto [scrollbar-width:none] gap-1 border-b border-white/[0.07] mt-2" role="tablist">
              {[null, ...BUCKET_ORDER].map(k => {
                const n = k ? searched.filter(a => pageBucket(a) === k).length : searched.length;
                const on = tab === k;
                return (
                  <button key={k ?? 'all'} role="tab" aria-selected={on} onClick={() => setTab(k)}
                    className={`flex-none flex items-center gap-2 whitespace-nowrap text-[14px] px-3 pt-2 pb-2.5 border-b-2 -mb-px ${
                      on ? 'text-ink border-[#5B93FF]' : 'text-meta border-transparent hover:text-white/80'
                    } ${n === 0 && !on ? 'opacity-45' : ''}`}>
                    {k && <span className="w-2 h-2 rounded-full" style={{ background: BUCKET_COLOR[k] }} />}
                    {k ? TAB_LABEL[k] : 'ทั้งหมด'}
                    <span className="text-[13px] text-meta tabular-nums">{n}</span>
                  </button>
                );
              })}
            </div>

            {/* Liquidity switch · sort · filters (AND with the tab) · search · quarter · วิธีอ่าน */}
            <div className="relative flex flex-wrap items-center gap-2 my-3">
              <button type="button" onClick={() => setHideIlliquid(h => !h)} aria-pressed={hideIlliquid}
                className="inline-flex items-center gap-2 text-[13px] text-ink bg-[#181c26] border border-white/[0.12] rounded-full pl-1.5 pr-3 py-1">
                <span className={`relative w-[30px] h-4 rounded-full transition-colors ${hideIlliquid ? 'bg-[#5B93FF]' : 'bg-[#39415a]'}`}>
                  <span className={`absolute top-0.5 w-3 h-3 rounded-full transition-all ${hideIlliquid ? 'left-4 bg-white' : 'left-0.5 bg-[#cfd6e4]'}`} />
                </span>
                ซ่อนสภาพคล่องต่ำ <span className="text-meta">(&lt; {PEAD_MIN_ADTV_MB} ล./วัน)</span>
              </button>
              <label className="inline-flex items-center gap-1.5 text-[13px] text-meta">
                เรียง
                <select value={sort} onChange={e => setSort(e.target.value as BoardSort)}
                  className="px-2 py-1 bg-[#181c26] border border-white/[0.12] rounded-lg text-[13px] text-ink outline-none focus:border-white/25">
                  {BOARD_SORTS.map(k => <option key={k} value={k}>{SORT_LABEL[k]}</option>)}
                </select>
              </label>
              {BOARD_FILTERS.map(k => {
                const on = filters.includes(k);
                const n = searched.filter(a => (!tab || pageBucket(a) === tab) && passFilters(a, k) && filterPass(a, k, extraOf(a))).length;
                return (
                  <button key={k} type="button" onClick={() => toggleFilter(k)} aria-pressed={on}
                    className={`px-3 py-1 rounded-full border text-[13px] ${
                      on ? 'bg-[#1b2640] border-[#5B93FF] text-[#dbe7ff]' : 'bg-[#181c26] border-white/[0.12] text-white/75 hover:border-white/25'
                    } ${n === 0 && !on ? 'opacity-45' : ''}`}>
                    {FILTER_LABEL[k]} <span className="text-[12px] text-meta ml-0.5 tabular-nums">{n}</span>
                  </button>
                );
              })}
              <span className="flex-1" />
              <label className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-meta" />
                <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="ค้นหาหุ้น" aria-label="ค้นหาหุ้น"
                  className="w-32 pl-7 pr-2 py-1 bg-[#181c26] border border-white/[0.12] rounded-lg text-[13px] text-ink outline-none focus:border-white/25" />
              </label>
              <select value={activeQuarter} onChange={e => setQuarter(e.target.value === seasonQuarter ? null : e.target.value)} aria-label="ไตรมาส"
                className="px-2 py-1 bg-[#181c26] border border-white/[0.12] rounded-lg text-[13px] text-ink outline-none focus:border-white/25">
                {quarters.map(q => <option key={q} value={q}>{q}</option>)}
                <option value={ALL_QUARTERS_PARAM}>{ALL_QUARTERS_LABEL}</option>
              </select>
              <HowToRead />
            </div>

            <div className={`${TS.tableCell}`}>
              <div className={`${T_GRID} ${ROW_PAD} py-2 text-[12px] text-meta border-b border-white/[0.07] [&>span:not(:first-child)]:text-right`}>
                <span>หุ้น</span>
                <span>กำไรสุทธิ<small className="block text-[11px] text-white/40">{hdr.now ?? 'งวดนี้'}</small></span>
                <span>ปีก่อน<small className="block text-[11px] text-white/40">{hdr.yearAgo ?? 'งวดเดียวกัน'} · เปลี่ยน</small></span>
                <span className={C_Q}>ไตรมาสก่อน<small className="block text-[11px] text-white/40">{hdr.prevQ ? `${hdr.prevQ} · ` : ''}เปลี่ยน</small></span>
                <span className={C_5}>5 ไตรมาส<small className="block text-[11px] text-white/40">{hdr.yearAgo && hdr.now ? `${hdr.yearAgo} → ${hdr.now}` : 'ย้อนหลัง'}</small></span>
                <span className={C_5}>{hdr.cumMonths ? `${hdr.cumMonths} เดือน` : 'กำไรสะสม'}<small className="block text-[11px] text-white/40">เทียบปีก่อน</small></span>
                <span className={C_L}>ซื้อขาย<small className="block text-[11px] text-white/40">ล./วัน</small></span>
                <span className={C_X}>ราคาหลังงบ<small className="block text-[11px] text-white/40">วันแรก → 2 วัน</small></span>
              </div>
              {view === 'list' ? (
                <div className="mt-2.5 border border-white/[0.07] rounded-xl overflow-hidden [&>:first-child]:border-t-0">
                  {renderBody(filtered, 'all')}
                </div>
              ) : dayGroups.length === 0 ? (
                <div className="py-7 text-center text-meta text-[14px]">ไม่มีหุ้นที่ตรงเงื่อนไข</div>
              ) : dayGroups.map(({ day, rows, s }) => {
                const open = isDayOpen(day);
                return (
                  <div key={day} id={`day-${day}`} className="mt-2.5 border border-white/[0.07] rounded-xl overflow-hidden scroll-mt-20">
                    <DayHeader day={day} s={s} open={open} onToggle={() => toggleDay(day, open)}
                      hiding={hideIlliquid} shown={rows.filter(a => !hasNoProfit(a) && (!hideIlliquid || isLiquid(adtvOf(a)))).length} />
                    {open && renderBody(rows, day)}
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-meta px-1 py-3.5">
              <span>
                {filtered.length} บริษัท{view === 'day' ? ` · ${dayGroups.length} วัน` : ''}
                {activeQuarter !== seasonQuarter && ` · ${activeQuarter === ALL_QUARTERS_PARAM ? ALL_QUARTERS_LABEL : activeQuarter}`}
              </span>
              <span>กดที่แถวเพื่อดูรายละเอียด</span>
            </div>
          </section>

          <p className="text-[12px] text-meta text-right mt-4">
            แหล่งข้อมูล: SET (ผ่าน Settrade) · ราคา: Yahoo Finance · ลิงก์เอกสารเปิดที่ set.or.th โดยตรง · ครอบคลุม {feed.universeSize} หลักทรัพย์
          </p>
        </div>
      )}
    </FullWidthPage>
  );
}
