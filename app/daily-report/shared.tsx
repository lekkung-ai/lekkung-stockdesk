'use client';

// ชิ้นส่วนที่ทุกแท็บของ /daily-report ใช้ร่วมกัน — ป้ายสถานะ / ราคาค้าง / อยู่ใน / ข่าว / วัน 2 แบบ / ปุ่มกรอง

import React from 'react';
import Link from 'next/link';
import { STATUS_LABEL, SCAN_LABEL, fmtPct, pctClass, type NewsFlag } from '@/lib/dailyReport';
import type { SignalD10 } from '@/lib/dailyReportTabs';
import { winFlatLoss } from '@/lib/winFlatLoss';
import s from './DailyReport.module.css';

export const Calc = ({ children = 'คำนวณ', title }: { children?: React.ReactNode; title?: string }) => (
  <span className={s.calc} title={title}>{children}</span>
);

export function Pct({ v, digits = 2 }: { v: number | null | undefined; digits?: number }) {
  return <span className={s[pctClass(v)]}>{fmtPct(v, digits)}</span>;
}

export function StatusTag({ status }: { status: 'new' | 'reentry' | 'stay' }) {
  const cls = status === 'new' ? s.tNew : status === 'reentry' ? s.tRe : s.tStay;
  return <span className={`${s.tag} ${cls}`}>{STATUS_LABEL[status]}</span>;
}

export function StaleTag({ stale, barDate }: { stale: boolean; barDate?: string | null }) {
  if (!stale) return null;
  return <span className={`${s.tag} ${s.tWarn}`} title={`แท่งราคาล่าสุด ${barDate ?? '—'} ไม่ใช่วันสแกน`}>⚠️ ราคาค้าง</span>;
}

/** ป้ายข่าว (news_flags) ชุดเดียวกับแท็บ Daytrade */
export function EventTags({ events }: { events: NewsFlag[] }) {
  if (!events.length) return null;
  return (
    <>
      {events.map((e, i) => (
        <span key={e.type + i} className={`${s.tag} ${s.tEvent}`} title={e.title}>{e.label}</span>
      ))}
    </>
  );
}

/** "อยู่ใน: …" — ชุดเดียวกันทุกแท็บ (daytrade / growth / sepa / market_stage 4 stage) */
export function InScans({ scans, exclude }: { scans: string[]; exclude?: string }) {
  const other = scans.filter(k => k !== exclude);
  if (!other.length) return null;
  return <span className={s.ls}>อยู่ใน: {other.map(k => SCAN_LABEL[k] ?? k).join(' · ')}</span>;
}

export const DAYS_TITLE =
  'รอบนี้ = จำนวนวันทำการที่อยู่ในสแกนติดกันถึงวันนี้ (หน้านี้คิดเอง · เข้า/กลับเข้าวันนี้ = 1) · ' +
  'ไม้ = DAYS ของหน้าสแกน (กติกา 5 วัน: หลุด 1–4 วันแล้วกลับมายังนับเป็นไม้เดิม และนับวันที่หลุดรวมด้วย)';

export function DaysCell({ streak, web }: { streak: number; web: number | null }) {
  return (
    <span title={DAYS_TITLE}>
      {streak} <span className={s.flat}>· {web ?? '—'}</span>
    </span>
  );
}

export function NoData() {
  return <div className={`${s.card} ${s.placeholder}`} data-testid="dr-nodata">รอบนี้ไม่มีข้อมูลแท็บนี้</div>;
}

export function Phase2Box({ children }: { children: React.ReactNode }) {
  return <div className={`${s.card} ${s.p2wide}`}>{children}</div>;
}

/** ผลสัญญาณย้อนหลัง (D+10) จาก report_card.json — ไม่ใช่ "สถิติ 10 วัน" */
export function SignalCard({ sig, href }: { sig: SignalD10 | null; href: string }) {
  const wfl = winFlatLoss(sig);
  return (
    <div className={`${s.card} ${s.stat}`}>
      {sig && sig.n > 0 ? (
        <>
          <div className={s.bigSm}>
            {wfl ? <>ชนะ {wfl.win.toFixed(0)}% · เสมอ {wfl.flat.toFixed(0)}%</> : <>win {sig.win_rate_pct?.toFixed(0) ?? '—'}%</>}
            {' · '}<Pct v={sig.avg_return_pct} digits={1} />
          </div>
          <div className={s.lbl}>
            ผลสัญญาณย้อนหลัง (D+10) · {sig.n} สัญญาณ · <Link href={href}>ดูรายละเอียด ↗</Link>
          </div>
        </>
      ) : (
        <>
          <div className={`${s.bigSm} ${s.flat}`}>—</div>
          <div className={s.lbl}>ผลสัญญาณย้อนหลัง (D+10) · ยังไม่มีข้อมูล</div>
        </>
      )}
    </div>
  );
}

export function FilterButton({
  id, label, count, active, onClick, prefix,
}: { id: string; label: string; count: number; active: boolean; onClick: () => void; prefix: string }) {
  return (
    <button
      type="button"
      className={s.f}
      aria-pressed={active}
      disabled={count === 0}
      onClick={onClick}
      data-testid={`${prefix}-filter-${id}`}
      data-count={count}
    >
      {label} <span className={s.n}>{count}</span>
    </button>
  );
}

export function pctText(v: number | null | undefined, digits = 2) {
  return fmtPct(v, digits);
}
