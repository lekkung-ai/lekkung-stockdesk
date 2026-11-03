'use client';

import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import Link from 'next/link';
import { RefreshCw, Search, ChevronDown, ChevronUp } from 'lucide-react';
import { bangkokParts, bangkokHHMM, bangkokDateKey } from '@/lib/utils';
import { TS } from '@/lib/typeScale';
import TableSkeleton from '@/components/TableSkeleton';
import { BUCKET_ORDER, BUCKET_LABEL, BUCKET_COLOR, type EarningsBucket } from '@/lib/earningsBucket';
import { classifyQoQ } from '@/lib/qoqBucket';
import {
  fixSaraAm, reasonPreview, meaningfulYoY, isTurnaround, isAccelerating, isPead, peadRanked,
  isImproved, isWorsened, priorQuarterImproved, pricePath,
} from '@/lib/earningsMetrics';
import type { EarningsFeed, EarningsAnnouncement } from '@/app/api/earnings/route';

// ── Formatting ───────────────────────────────────────────────────────────────

const UP = '#1D9E75';
const DOWN = '#E24B4A';

const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const WEEKDAY_SHORT = ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.'];

// The page's own wording for the 6 buckets - loss_worse reads "ขาดทุนหนักขึ้น" here
// (the shared BUCKET_LABEL used by /calendar and /stock stays as it is).
const TAB_LABEL: Record<EarningsBucket, string> = { ...BUCKET_LABEL, loss_worse: 'ขาดทุนหนักขึ้น' };

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

function fmtMoney(n: number | null | undefined): string {
  if (n == null) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)} พันล.`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)} ล.`;
  return `${sign}${abs.toLocaleString('th-TH')}`;
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

/** เทียบปีก่อน: a % only off a profit base; otherwise the bucket's own words. */
function YoYCell({ a }: { a: EarningsAnnouncement }) {
  if (isTurnaround(a)) return <Tag cls={TAG_TURN} title="ปีก่อนขาดทุน ไตรมาสนี้กำไร (ไม่คิด % เพราะฐานติดลบ)">พลิกกำไร</Tag>;
  const yoy = meaningfulYoY(a.netProfit, a.netProfitPrior);
  if (yoy != null && a.netProfit != null && a.netProfit < 0) return <Tag cls={TAG_LOSS} title="ปีก่อนกำไร ไตรมาสนี้ขาดทุน">พลิกขาดทุน</Tag>;
  if (yoy != null) return <Pct v={yoy} />;
  if (a.bucket === 'loss_worse') return <Tag cls={TAG_LOSS}>ขาดทุนหนักขึ้น</Tag>;
  if (a.bucket === 'loss_shrink') return <span className="text-[13px]" style={{ color: BUCKET_COLOR.loss_shrink }}>ขาดทุนลดลง</span>;
  return <span className="text-meta">—</span>;
}

/** เทียบไตรมาสก่อน: % off a profit base, else the QoQ state in words. */
function QoQCell({ a }: { a: EarningsAnnouncement }) {
  if (a.netProfitPriorQ != null && a.netProfitPriorQ > 0 && a.netProfit != null && a.netProfit > 0) {
    return <Pct v={a.netProfitQoQ ?? ((a.netProfit - a.netProfitPriorQ) / a.netProfitPriorQ) * 100} />;
  }
  const q = classifyQoQ(a.netProfit, a.netProfitPriorQ, a.netProfitQoQ);
  if (q.category === 'no_base') return <span className="text-meta">—</span>;
  return <span className="text-[13px]" style={{ color: q.color }}>{q.label}</span>;
}

function reasonOf(a: EarningsAnnouncement): string {
  return a.reason ? fixSaraAm(a.reason) : '';
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

function Stat({ k, children, color }: { k: string; children: React.ReactNode; color?: string }) {
  return (
    <div>
      <div className="text-[12px] md:text-[13px] text-meta mb-0.5 whitespace-nowrap">{k}</div>
      <div className="text-[26px] md:text-[32px] font-bold leading-tight tabular-nums whitespace-nowrap" style={{ color }}>{children}</div>
    </div>
  );
}

function SeasonStats({ rows }: { rows: EarningsAnnouncement[] }) {
  const n = rows.length;
  const up = rows.filter(a => isImproved(a.bucket)).length;
  const dn = rows.filter(a => isWorsened(a.bucket)).length;
  const acc = rows.filter(isAccelerating).length;
  // Last quarter, same companies: of those with back-to-back figures, how many improved then.
  const prev = rows.map(priorQuarterImproved).filter((v): v is boolean => v != null);
  const prevPct = prev.length ? Math.round((prev.filter(Boolean).length / prev.length) * 100) : null;
  const upPct = n ? Math.round((up / n) * 100) : 0;

  return (
    <div>
      <div className="grid grid-cols-4 gap-2 md:flex md:gap-x-12 items-end">
        <Stat k="ประกาศแล้ว">{n}</Stat>
        <Stat k="กำไรดีขึ้น" color={UP}>
          {up}<span className="text-[13px] md:text-[15px] font-medium text-meta ml-1">{upPct}%</span>
        </Stat>
        <Stat k="กำไรแย่ลง" color={DOWN}>{dn}</Stat>
        <Stat k="กำไรเร่งตัว" color="#FBBF24">{acc}</Stat>
      </div>
      <div className="mt-3.5">
        <div className="h-1.5 rounded-full bg-white/[0.06] flex overflow-hidden">
          <i style={{ width: `${n ? (up / n) * 100 : 0}%`, background: UP }} />
          <i style={{ width: `${n ? ((n - up - dn) / n) * 100 : 0}%`, background: BUCKET_COLOR.no_base }} />
          <i style={{ width: `${n ? (dn / n) * 100 : 0}%`, background: DOWN, opacity: 0.8 }} />
        </div>
        <div className="flex justify-between text-[12px] text-meta mt-1">
          <span>สัดส่วนบริษัทที่กำไรดีขึ้น (กำไรโต · พลิกกำไร · ขาดทุนลดลง)</span>
          <span title={prevPct != null ? `บริษัทชุดเดียวกัน ${prev.length} แห่งที่มีงบไตรมาสก่อนให้เทียบ` : 'ยังไม่มีข้อมูลไตรมาสก่อน'}>
            ไตรมาสก่อน {prevPct != null ? `${prevPct}%` : '—'}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Week line (one line, expands to 5 days) ─────────────────────────────────

function WeekLine({ feed }: { feed: EarningsFeed }) {
  const [open, setOpen] = useState(false);
  const today = bangkokDateKey();
  const monday = mondayOf(today);
  const week = [0, 1, 2, 3, 4].map(i => addDaysISO(monday, i));
  const friday = week[4];

  // ~900 calendar rows - cheap enough to rebuild each render (only re-renders on open/close)
  const byDate = (() => {
    const map = new Map<string, { confirmed: string[]; predicted: string[] }>();
    const confirmed = new Set<string>();
    const slot = (d: string) => {
      if (!map.has(d)) map.set(d, { confirmed: [], predicted: [] });
      return map.get(d)!;
    };
    for (const a of feed.announcements) {
      if (!a.announceDate || confirmed.has(a.ticker)) continue;
      slot(a.announceDate.slice(0, 10)).confirmed.push(a.ticker);
      confirmed.add(a.ticker);
    }
    for (const c of feed.calendar) {
      if (c.status === 'confirmed' && !confirmed.has(c.ticker)) {
        slot(c.date.slice(0, 10)).confirmed.push(c.ticker);
        confirmed.add(c.ticker);
      }
    }
    for (const c of feed.calendar) {
      if (c.status !== 'predicted' || confirmed.has(c.ticker)) continue;
      const raw = c.date.slice(0, 10);
      if (raw < today) continue;
      slot(rollToWeekday(raw)).predicted.push(c.ticker);
    }
    return map;
  })();

  const todayTickers = byDate.get(today)?.confirmed ?? [];
  const waiting = week
    .filter(d => d >= today && d <= friday)
    .reduce((s, d) => s + (byDate.get(d)?.predicted.length ?? 0), 0);

  return (
    <div className="border-y border-white/[0.07] py-3.5 text-[14px] text-meta">
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
        <span>วันนี้ประกาศ <b className="text-ink font-semibold">{todayTickers.length}</b></span>
        {todayTickers.length > 0 && <span className="text-[13px] text-emerald-300">{todayTickers.join(' · ')}</span>}
        <span>·</span>
        <span>รออีก <b className="text-ink font-semibold">{waiting}</b> บริษัทในสัปดาห์นี้</span>
        <span className="ml-auto flex items-center gap-4">
          <button onClick={() => setOpen(o => !o)} className="text-[#5B93FF] hover:text-blue-300">
            {open ? 'ซ่อน ▴' : 'ดูรายวัน ▾'}
          </button>
          <Link href="/calendar" className="text-[#5B93FF] hover:text-blue-300 whitespace-nowrap">ดูปฏิทินเต็ม →</Link>
        </span>
      </div>
      {open && (
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 mt-3">
          {week.map((d, i) => {
            const s = byDate.get(d);
            const names = [...(s?.confirmed ?? []).map(t => `✓ ${t}`), ...(s?.predicted ?? [])];
            const p = d.split('-');
            return (
              <div key={d} className={d === today ? 'text-ink' : ''}>
                <div className="text-[13px] mb-1">
                  <b className="text-ink font-semibold">{WEEKDAY_SHORT[i]} {parseInt(p[2])} {MONTHS[parseInt(p[1]) - 1]}</b> · {names.length}
                </div>
                <div className="text-[13px] leading-7 text-white/70">
                  {names.length ? names.join(' · ') : '—'}
                </div>
              </div>
            );
          })}
          <div className="sm:col-span-5 text-[12px] text-meta">✓ = ประกาศแล้ว · ที่เหลือคาดการณ์จากวันประกาศงวดเดียวกันปีก่อน</div>
        </div>
      )}
    </div>
  );
}

// ── PEAD: "ราคาวิ่งต่อหลังงบ" top 5 ─────────────────────────────────────────

const PEAD_VIEW_KEY = 'earnings.peadView';
type PeadView = 'table' | 'card';

function D({ v, bold }: { v: number | null | undefined; bold?: boolean }) {
  if (v == null) return <Wait />;
  return <span className={bold ? 'font-bold' : ''}><Pct v={v} /></span>;
}

function PeadSection({ rows, onPick, onShowAll }: {
  rows: EarningsAnnouncement[];
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

  const top = useMemo(() => peadRanked(rows).slice(0, 5), [rows]);
  const total = useMemo(() => rows.filter(isPead).length, [rows]);

  const yoyOf = (a: EarningsAnnouncement) => isTurnaround(a)
    ? <Tag cls={TAG_TURN}>พลิกกำไร</Tag>
    : <Pct v={meaningfulYoY(a.netProfit, a.netProfitPrior)} />;

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1.5 text-[14px] text-meta">
        <span>🔥 <b className="text-ink text-[16px] font-semibold">ราคาวิ่งต่อหลังงบ</b> · งบดีและราคายังขึ้นต่อ</span>
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
            <button onClick={onShowAll} className="text-[#5B93FF] hover:text-blue-300">ดูทั้งหมดในตาราง ({total}) →</button>
          )}
        </span>
      </div>

      {top.length === 0 ? (
        <div className="py-5 text-[14px] text-meta border-b border-white/[0.07]">
          ยังไม่มีหุ้นเข้าเกณฑ์ (งบโต ≥ 20% หรือพลิกกำไร และราคาหลังงบ 2 วันยังเป็นบวก)
        </div>
      ) : view === 'table' ? (
        <div className={TS.tableCell}>
          <div className="grid grid-cols-[1fr_84px_70px] md:grid-cols-[minmax(170px,1.4fr)_96px_250px_64px_64px_70px_64px] gap-3 items-center py-1.5 text-[12px] text-meta border-b border-white/[0.07]">
            <span />
            <span className="text-right">เทียบปีก่อน</span>
            <span className="hidden md:block">ราคา 5 วันก่อน → 5 วันหลังงบ</span>
            <span className="hidden md:block text-right">วันแรก</span>
            <span className="hidden md:block text-right">+1 วัน</span>
            <span className="text-right">+2 วัน</span>
            <span className="hidden md:block text-right">+5 วัน</span>
          </div>
          {top.map(a => (
            <button key={rowKey(a)} onClick={() => onPick(a)}
              className="w-full text-left grid grid-cols-[1fr_84px_70px] md:grid-cols-[minmax(170px,1.4fr)_96px_250px_64px_64px_70px_64px] gap-3 items-center py-2.5 border-b border-white/[0.07] hover:bg-white/[0.025]">
              <span className="min-w-0">
                <b className="text-ink text-[16px]">{a.ticker}</b>
                {reasonPreview(a.reason) && <span className="block text-[13px] text-meta truncate">{reasonPreview(a.reason)}</span>}
              </span>
              <span className="text-right">{yoyOf(a)}</span>
              <span className="hidden md:block"><PriceChart a={a} w={250} h={40} /></span>
              <span className="hidden md:block text-right"><D v={a.gap_pct} /></span>
              <span className="hidden md:block text-right"><D v={a.drift_d1_pct} /></span>
              <span className="text-right"><D v={a.drift_d2_pct} bold /></span>
              <span className="hidden md:block text-right"><D v={a.drift_d5_pct} /></span>
            </button>
          ))}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1 mt-2.5 [scrollbar-width:thin]">
          {top.map(a => (
            <button key={rowKey(a)} onClick={() => onPick(a)}
              className="text-left flex-1 min-w-[200px] border border-white/[0.07] hover:border-[#33507f] rounded-xl p-3.5 bg-[#13161e]">
              <div className="min-h-[96px]">
                <b className="text-ink text-[17px]">{a.ticker}</b>
                {reasonPreview(a.reason) && <div className="text-[13px] text-meta truncate">{reasonPreview(a.reason)}</div>}
                <div className="flex flex-wrap gap-x-3 gap-y-1 items-center text-[13px] mt-2">
                  <span><i className="not-italic text-meta text-[11px] mr-1">ปีก่อน</i>{yoyOf(a)}</span>
                  <span><i className="not-italic text-meta text-[11px] mr-1">ไตรมาสก่อน</i><QoQCell a={a} /></span>
                  {isAccelerating(a) && <Tag cls={TAG_ACC}>⚡ เร่งตัว</Tag>}
                </div>
              </div>
              <div className="my-2.5"><PriceChart a={a} w={220} h={60} /></div>
              <div className="grid grid-cols-4 gap-0.5 bg-black/25 rounded-lg py-2 text-center text-[12.5px] whitespace-nowrap">
                {([['วันแรก', a.gap_pct], ['+1', a.drift_d1_pct], ['+2', a.drift_d2_pct], ['+5', a.drift_d5_pct]] as const).map(([k, v]) => (
                  <div key={k} className={k === '+2' ? 'font-bold' : ''}>
                    <i className="not-italic block text-meta text-[11px] mb-0.5">{k}</i>
                    {v == null ? <Wait /> : <Pct v={v} />}
                  </div>
                ))}
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

// ── Main table ───────────────────────────────────────────────────────────────

type ChipKey = 'acc' | 'pead' | 'mda' | 'today';
type SortKey = 'ticker' | 'netProfit' | 'yoy' | 'qoq' | 'price' | 'announceDate';

const CHIPS: { key: ChipKey; label: string }[] = [
  { key: 'acc', label: '⚡ เร่งตัว' },
  { key: 'pead', label: '🔥 PEAD' },
  { key: 'mda', label: 'มีสรุป MD&A' },
  { key: 'today', label: 'ประกาศวันนี้' },
];

const PAGE_SIZE = 50;
const ALL_QUARTERS = 'ทุกไตรมาส';

function chipPass(a: EarningsAnnouncement, k: ChipKey, today: string): boolean {
  if (k === 'acc') return isAccelerating(a);
  if (k === 'pead') return isPead(a);
  if (k === 'mda') return !!a.reason;
  return !!a.announceDate?.startsWith(today);
}

// Sort value tiers: real values first, then (yoy only) turnarounds, then
// nothing - a turnaround never outranks a real % in either direction.
function sortValue(a: EarningsAnnouncement, k: SortKey): [number, number | string] {
  switch (k) {
    case 'ticker': return [0, a.ticker];
    case 'netProfit': return a.netProfit == null ? [2, 0] : [0, a.netProfit];
    case 'yoy': {
      const y = meaningfulYoY(a.netProfit, a.netProfitPrior);
      if (y != null) return [0, y];
      return isTurnaround(a) ? [1, a.netProfit ?? 0] : [2, 0];
    }
    case 'qoq': return a.netProfitQoQ == null ? [2, 0] : [0, a.netProfitQoQ];
    case 'price': return a.drift_d2_pct == null ? [2, 0] : [0, a.drift_d2_pct];
    default: return [0, a.announceDate || ''];
  }
}

function K({ children }: { children: React.ReactNode }) {
  return <span className="text-meta">{children}</span>;
}

function DetailRow({ a }: { a: EarningsAnnouncement }) {
  const reason = reasonOf(a);
  return (
    <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-x-6 gap-y-1.5 text-[14px] whitespace-normal">
      <K>กำไรปีก่อน</K><span className="tabular-nums">{fmtMoney(a.netProfitPrior)} <span className="text-meta">(งวดเดียวกันปีก่อน)</span></span>
      <K>EPS</K><span className="tabular-nums">{a.eps != null ? a.eps.toFixed(2) : '—'} <span className="text-meta">ปีก่อน {a.epsPrior != null ? a.epsPrior.toFixed(2) : '—'}</span></span>
      {a.priorQuarter && a.netProfitPriorQ != null && (
        <><K>ไตรมาสก่อน</K><span className="tabular-nums">{fmtMoney(a.netProfitPriorQ)} <span className="text-meta">({a.priorQuarter})</span></span></>
      )}
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
      <K>ประกาศ</K><span>{fullDateTime(a.announceDate)}{a.isCorrection && <span className="ml-2 text-[12px] text-[#EF9F27]">(ฉบับแก้ไข)</span>}</span>
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

function SortTh({ k, sort, onSort, children, className = '', title }: {
  k: SortKey; sort: { key: SortKey; asc: boolean }; onSort: (k: SortKey) => void;
  children: React.ReactNode; className?: string; title?: string;
}) {
  const on = sort.key === k;
  return (
    <th onClick={() => onSort(k)} title={title}
      className={`px-1.5 md:px-3 py-2.5 text-[13px] font-medium text-meta whitespace-nowrap cursor-pointer select-none hover:text-white/80 ${className}`}>
      <span className="inline-flex items-center gap-0.5">
        {children}
        {on && (sort.asc ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
      </span>
    </th>
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

  const fetchFeed = () =>
    fetch('/api/earnings')
      .then(res => { if (!res.ok) throw new Error(); return res.json(); })
      .then((data: EarningsFeed) => { setFeed(data); setError(false); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  const loadData = () => { setLoading(true); fetchFeed(); };
  useEffect(() => { fetchFeed(); }, []);

  const today = bangkokDateKey();

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
  const quarterRows = useMemo(
    () => feed.announcements.filter(a => activeQuarter === ALL_QUARTERS || a.quarter === activeQuarter),
    [feed.announcements, activeQuarter]
  );
  const searched = useMemo(() => {
    const q = query.trim().toUpperCase();
    return q ? quarterRows.filter(a => a.ticker.includes(q)) : quarterRows;
  }, [quarterRows, query]);

  const passChips = (a: EarningsAnnouncement, skip?: ChipKey) =>
    [...chips].every(k => k === skip || chipPass(a, k, today));

  const filtered = useMemo(() => {
    const list = searched.filter(a => (!tab || a.bucket === tab) && passChips(a));
    const dir = sort.asc ? 1 : -1;
    return list.sort((x, y) => {
      const [tx, vx] = sortValue(x, sort.key);
      const [ty, vy] = sortValue(y, sort.key);
      if (tx !== ty) return tx - ty;
      if (vx === vy) return (y.announceDate || '').localeCompare(x.announceDate || '');
      return (vx > vy ? 1 : -1) * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searched, tab, chips, sort, today]);

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
    scrollTarget.current = key;
  };
  const showAllPead = () => {
    setTab(null);
    setQuarter(null);
    setChips(new Set(['pead']));
    resetPage();
    tableRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  const filterLabel = [tab && TAB_LABEL[tab], ...[...chips].map(k => CHIPS.find(c => c.key === k)!.label)].filter(Boolean).join(' + ');

  return (
    <div className="p-4 md:p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2 mb-5">
        <h1 className={`${TS.pageTitle} text-ink`}>ประกาศงบ{seasonQuarter ? ` · ${seasonQuarter}` : ''}</h1>
        <div className="flex items-center gap-2 text-[13px] text-meta">
          {!loading && (
            <span title={`ข้อมูล ณ ${fullDateTime(feed.generatedAt || null)}\nอัปเดตจากรอบ batch 09:45 / 17:30 / 18:00 น. (ไม่ใช่ real-time)\nF45 / งบการเงิน / MD&A ทั้งตลาด (SET + mai) · ย้อนหลัง ${feed.windowDays} วัน`}
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
        <div className="space-y-7">
          <SeasonStats rows={seasonRows} />
          <WeekLine feed={feed} />
          <PeadSection rows={seasonRows} onPick={pick} onShowAll={showAllPead} />

          <div ref={tableRef} className="scroll-mt-20">
            {/* Tabs - one at a time, never wrap (scroll sideways on a narrow screen) */}
            <div className="flex flex-nowrap overflow-x-auto [scrollbar-width:none] gap-1 border-b border-white/[0.07] mb-4">
              {[null, ...BUCKET_ORDER].map(k => {
                const n = k ? searched.filter(a => a.bucket === k).length : searched.length;
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
                const n = searched.filter(a => (!tab || a.bucket === tab) && passChips(a, c.key) && chipPass(a, c.key, today)).length;
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

            <div className="overflow-x-auto">
              <table className={`w-full ${TS.tableCell}`}>
                <thead className="border-b border-white/[0.07]">
                  <tr className="text-left">
                    <SortTh k="ticker" sort={sort} onSort={onSort}>หุ้น</SortTh>
                    <SortTh k="netProfit" sort={sort} onSort={onSort} className="text-right">กำไรสุทธิ</SortTh>
                    <SortTh k="yoy" sort={sort} onSort={onSort} className="text-right">เทียบปีก่อน</SortTh>
                    <SortTh k="qoq" sort={sort} onSort={onSort} className="text-right hidden md:table-cell">เทียบไตรมาสก่อน</SortTh>
                    <SortTh k="price" sort={sort} onSort={onSort} className="text-right" title="ราคาวันแรกหลังงบ → หลัง 2 วันทำการ (เทียบราคาปิดก่อนประกาศ)">
                      <span className="border-b border-dotted border-white/30"><span className="md:hidden">หลังงบ</span><span className="hidden md:inline">ราคาหลังงบ (วันแรก → 2 วัน)</span></span>
                    </SortTh>
                    <SortTh k="announceDate" sort={sort} onSort={onSort} className="hidden md:table-cell">ประกาศ</SortTh>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map(a => {
                    const key = rowKey(a);
                    const open = openKey === key;
                    const reason = reasonPreview(a.reason);
                    const isToday = a.announceDate?.startsWith(today);
                    return (
                      <Fragment key={key}>
                        <tr id={`row-${key}`} onClick={() => setOpenKey(open ? null : key)}
                          className={`cursor-pointer border-b border-white/[0.07] ${open ? 'bg-white/[0.03]' : 'hover:bg-white/[0.025]'}`}>
                          <td className="px-1.5 md:px-3 py-3 max-w-[118px] md:max-w-[360px]">
                            <div className="flex flex-wrap md:flex-nowrap items-center gap-x-2 gap-y-0.5 whitespace-nowrap">
                              <b className="text-ink text-[16px]">{a.ticker}</b>
                              {isToday && <span className="w-[7px] h-[7px] rounded-full bg-[#5B93FF]" title="ประกาศวันนี้" />}
                              {isAccelerating(a) && <Tag cls={TAG_ACC} title="% เทียบปีก่อนของไตรมาสนี้ สูงกว่าของไตรมาสที่แล้ว">⚡ เร่งตัว</Tag>}
                              {a.isCorrection && <span className="text-[12px] text-[#EF9F27]">แก้ไข</span>}
                            </div>
                            {reason && <div className="text-[13px] text-meta truncate mt-0.5" title={reason}>{reason}</div>}
                          </td>
                          <td className="px-1.5 md:px-3 py-3 text-right tabular-nums whitespace-nowrap" style={{ color: a.netProfit != null && a.netProfit < 0 ? DOWN : undefined }}>
                            {fmtMoney(a.netProfit)}
                          </td>
                          <td className="px-1.5 md:px-3 py-3 text-right whitespace-nowrap"><YoYCell a={a} /></td>
                          <td className="px-1.5 md:px-3 py-3 text-right whitespace-nowrap hidden md:table-cell"><QoQCell a={a} /></td>
                          <td className="px-1.5 md:px-3 py-3 text-right whitespace-nowrap">
                            {a.gap_pct == null ? <Wait title="รอครบวันทำการ" /> : (
                              <>
                                <span className="text-[13px] text-meta tabular-nums hidden md:inline">{a.gap_pct >= 0 ? '+' : ''}{a.gap_pct.toFixed(1)} → </span>
                                {a.drift_d2_pct == null ? <Wait title="รอครบ 2 วันทำการ" /> : <Pct v={a.drift_d2_pct} />}
                              </>
                            )}
                          </td>
                          <td className="px-1.5 md:px-3 py-3 text-[13px] text-meta whitespace-nowrap hidden md:table-cell">{shortDateTime(a.announceDate)}</td>
                        </tr>
                        {open && (
                          <tr className="border-b border-white/[0.07] bg-[#13161e]">
                            <td colSpan={6} className="px-3 md:px-5 pt-4 pb-5"><DetailRow a={a} /></td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  {pageRows.length === 0 && (
                    <tr><td colSpan={6} className="py-7 text-center text-meta text-[14px]">ไม่มีหุ้นที่ตรงเงื่อนไข</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-meta px-1 py-3.5">
              <span>
                {filtered.length} บริษัท{filterLabel ? ` · ${filterLabel}` : ''}
                {activeQuarter !== seasonQuarter && ` · ${activeQuarter}`}
              </span>
              {totalPages > 1 ? (
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
              <li><b className="text-ink">กำไรหด</b> ยังกำไรแต่น้อยกว่าปีก่อน · <b className="text-ink">ขาดทุนลดลง / ขาดทุนหนักขึ้น</b> เทียบกับไตรมาสเดียวกันปีก่อน (ปีก่อนกำไรแต่ปีนี้ขาดทุนนับเป็นขาดทุนหนักขึ้น) · <b className="text-ink">ไม่มีฐานเทียบ</b> ไม่มีตัวเลขปีก่อน เช่น หุ้นเข้าตลาดใหม่</li>
              <li><b className="text-ink">⚡ เร่งตัว</b> % เทียบปีก่อนของไตรมาสนี้เป็นบวก และสูงกว่า % เทียบปีก่อนของไตรมาสที่แล้ว (โตเร็วขึ้น ไม่ใช่แค่โต) · ถ้าไม่มีงบไตรมาสที่แล้วให้เทียบ จะไม่ติดป้าย</li>
              <li><b className="text-ink">ราคาหลังงบ</b> เทียบกับราคาปิดก่อนประกาศ: วันแรก = ราคาแรกที่ตลาดรับรู้งบ, +1 / +2 / +5 = ราคาปิดหลังวันแรก 1 / 2 / 5 วันทำการ · <b className="text-ink">🔥 PEAD</b> = งบดี (โต ≥ 20% หรือพลิกกำไร) และราคา +2 วันยังเป็นบวก เรียงจาก +2 วันมากไปน้อย</li>
              <li><b className="text-ink">กำไรดีขึ้น</b> = กำไรโต + พลิกกำไร + ขาดทุนลดลง · <b className="text-ink">กำไรแย่ลง</b> = กำไรหด + ขาดทุนหนักขึ้น · ตัวเลข &quot;ไตรมาสก่อน&quot; ใต้แถบสัดส่วน คิดจากบริษัทชุดเดียวกันที่มีงบไตรมาสก่อนให้เทียบ</li>
              <li><span className="inline-block w-[7px] h-[7px] rounded-full bg-[#5B93FF] mr-1.5 align-middle" />จุดสีฟ้าข้างชื่อ = ประกาศวันนี้ · ข้อมูลอัปเดตเป็นรอบ ไม่ใช่ real-time</li>
            </ul>
          </details>

          <p className="text-[12px] text-meta text-right">
            แหล่งข้อมูล: SET (ผ่าน Settrade) · ราคา: Yahoo Finance · ลิงก์เอกสารเปิดที่ set.or.th โดยตรง · ครอบคลุม {feed.universeSize} หลักทรัพย์
          </p>
        </div>
      )}
    </div>
  );
}

