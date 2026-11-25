'use client';

// ชิ้นส่วนที่ทุกแท็บของ /daily-report ใช้ร่วมกัน (โครงตามแบบ Muse v48)
// ธีมเดียวกับหน้าอื่น: ฟอนต์หลักของแอป + tabular-nums (.num) · ป้าย NEW ใช้คอมโพเนนต์เดียวกับหน้าสแกน

import React from 'react';
import Link from 'next/link';
import NewBadge from '@/components/NewBadge';
import { scanTagLabel, scanKeyOf, fmtPct, fmtNum, pctClass, shortDate, hhmm, type NewsFlag } from '@/lib/dailyReport';
import s from './DailyReport.module.css';

/** ตัวเลขฟอนต์ Mono */
export function N({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <span className={`${s.num} ${className}`}>{children}</span>;
}

export function Pct({ v, digits = 2 }: { v: number | null | undefined; digits?: number }) {
  return <span className={`${s.num} ${s[pctClass(v)]}`}>{fmtPct(v, digits)}</span>;
}

export function Price({ v }: { v: number | null | undefined }) {
  return <span className={`${s.num} ${s.price}`}>{fmtNum(v)}</span>;
}

/** ป้ายสถานะแบบหน้าสแกน: NEW (ตาม _diff.json) · อยู่ต่อไม่มีป้าย · ข้อมูลเสริม "เคยอยู่ล่าสุด" เป็นตัวเล็กสีเทา */
export function StatusTag({ status, seenBefore }: { status: 'new' | 'reentry' | 'stay'; seenBefore?: string | null }) {
  if (status === 'stay') return null;
  return (
    <>
      <NewBadge />
      {seenBefore && <span className={s.small}> เคยอยู่ล่าสุด {shortDate(seenBefore)}</span>}
    </>
  );
}

export const DAYS_TITLE_WEB = 'Days ตามหน้าสแกน (scan_days)';

/** Days ตามหน้าสแกน · ตัวเล็กสีเทา = อยู่ติดกันจริงกี่วัน (แสดงเมื่อไม่เท่ากัน) */
export function DaysCell({ web, streak }: { web: number | null | undefined; streak: number }) {
  return (
    <span className={s.num}>
      {web ?? streak}
      {web != null && web !== streak && <span className={s.ls}>ติดกัน {streak} วัน</span>}
    </span>
  );
}

export function StaleTag({ stale, barDate }: { stale: boolean; barDate?: string | null }) {
  if (!stale) return null;
  return <span className={`${s.tag} ${s.tWarn}`} title={`แท่งราคาล่าสุด ${barDate ?? '—'} ไม่ใช่วันสแกน`}>⚠️ ราคาค้าง</span>;
}

export function EventTags({ events }: { events: NewsFlag[] }) {
  if (!events.length) return null;
  return <>{events.map((e, i) => <span key={e.type + i} className={`${s.tag} ${s.tEvent}`} title={e.title}>{e.label}</span>)}</>;
}

/** "อยู่ใน: …" — ชุดเดียวกันทุกแท็บ */
export function InScans({ scans, exclude, asTag = false }: { scans: string[]; exclude?: string; asTag?: boolean }) {
  const other = scans.filter(k => scanKeyOf(k) !== exclude);
  if (!other.length) return null;
  const text = `อยู่ใน: ${other.map(scanTagLabel).join(' · ')}`;
  return asTag ? <span className={s.tag}>{text}</span> : <span className={s.ls}>{text}</span>;
}

export function NoData() {
  return <div className={`${s.card} ${s.statCard}`} data-testid="dr-nodata">รอบนี้ไม่มีข้อมูลแท็บนี้</div>;
}

export function TabHead({ title, date, ts, compared, href }: { title: string; date: string; ts?: string | null; compared: string | null; href: string }) {
  const t = hhmm(ts);
  return (
    <>
      <h2 className={s.tabTitle}>{title}</h2>
      <p className={s.tabHead}>
        สแกน {shortDate(date)}{t && ` ${t}`} · <b>เทียบกับ: {shortDate(compared)}</b> · <Link href={href}>เปิดหน้าสแกน ↗</Link>
      </p>
    </>
  );
}

/** ประโยคเปิดแท็บ — ชื่อหุ้นในประโยคเป็น Mono */
export function Verdict({ text }: { text?: string | null }) {
  if (!text) return null;
  return <p className={s.verdict} data-testid="dr-verdict">{monoTickers(text)}</p>;
}

/** ประโยคจากสคริปต์ — ฟอนต์หลักทั้งหมด (ไม่แยกฟอนต์ตัวเลขแล้ว) */
export function monoTickers(text: string): React.ReactNode[] {
  return [text];
}

export function StatCard({ big, label, testid, count }: { big: React.ReactNode; label: React.ReactNode; testid?: string; count?: number }) {
  return (
    <div className={`${s.card} ${s.statCard}`} data-testid={testid} data-count={count}>
      <div className={s.scBig}>{big}</div>
      <div className={s.scLabel}>{label}</div>
    </div>
  );
}

export function ChangeBox({ title, hint, chips, note, testid }: {
  title: string; hint?: string; chips: React.ReactNode[]; note?: React.ReactNode; testid?: string;
}) {
  return (
    <div className={`${s.card} ${s.changeBox}`} data-testid={testid}>
      <h3>{title} <span>{chips.length} ตัว{hint && ` · ${hint}`}</span></h3>
      <div className={s.chips}>{chips.length ? chips : <span className={`${s.chip} ${s.chipNone}`}>ไม่มี</span>}</div>
      {note && <div className={s.changeNote}>{note}</div>}
    </div>
  );
}

export function Chip({ ticker, children }: { ticker: string; children?: React.ReactNode }) {
  return <span className={s.chip}><b className={s.num}>{ticker}</b>{children}</span>;
}

export function FilterButton({ id, label, count, active, onClick, prefix }: {
  id: string; label: string; count: number; active: boolean; onClick: () => void; prefix: string;
}) {
  return (
    <button type="button" className={s.filter} aria-pressed={active} disabled={count === 0} onClick={onClick}
      data-testid={`${prefix}-filter-${id}`} data-count={count}>
      {label}<span className={`${s.cnt} ${s.num}`}>{count}</span>
    </button>
  );
}

/** การ์ดรายตัว: หัว (ticker + ป้าย + ราคา) · เนื้อ 1–2 แผง · แถบ "จับตา" */
export function StockCard({ id, ticker, rank, tags, sub, close, chg, left, right, extra, watch, flash, testid }: {
  id: string; ticker: string; rank?: number; tags?: React.ReactNode; sub?: React.ReactNode; close: number | null; chg: number | null;
  left?: { title: string; rows: [React.ReactNode, React.ReactNode][] }; right?: { title: string; rows: [React.ReactNode, React.ReactNode][] };
  extra?: React.ReactNode; watch?: string[] | null; flash?: boolean; testid?: string;
}) {
  const panel = (p: { title: string; rows: [React.ReactNode, React.ReactNode][] }, tech: boolean) => (
    <div className={`${s.panel} ${tech ? s.panelTech : ''}`}>
      <h4>{p.title}</h4>
      <table className={s.mini}><tbody>{p.rows.map((r, i) => <tr key={i}><td>{r[0]}</td><td>{r[1]}</td></tr>)}</tbody></table>
    </div>
  );
  return (
    <article className={`${s.card} ${s.stock} ${flash ? s.stockFlash : ''}`} id={id} data-testid={testid} data-ticker={ticker}>
      <div className={s.stockTop}>
        <div>
          <div className={s.tickerLine}>
            {rank != null && <span className={`${s.rankBadge} ${s.num}`}>{rank}</span>}
            <h3><Link href={`/stock/${ticker}`} className={s.num}>{ticker}</Link></h3>
            {tags}
          </div>
          {sub && <div className={s.company}>{sub}</div>}
        </div>
        <div className={s.priceBox}>
          <span>ราคาปิด</span>
          <strong className={s.num}>{fmtNum(close)}</strong>
          <small><Pct v={chg} /></small>
        </div>
      </div>
      {(left || right) && (
        <div className={s.stockBody} style={left && right ? undefined : { gridTemplateColumns: '1fr' }}>
          {left && panel(left, false)}
          {right && panel(right, !!left)}
        </div>
      )}
      {extra}
      {watch && watch.length > 0 && (
        <div className={s.watch} data-testid="dr-watch"><b>จับตา</b><span>{monoTickers(watch.join(' · '))}</span></div>
      )}
    </article>
  );
}

export function Fold({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className={`${s.card} ${s.fold}`}>
      <summary>{title}</summary>
      <div className={s.foldBody}>{children}</div>
    </details>
  );
}

/** ผลย้อนหลังของสแกน → Report Card (บรรทัดเดียว แทนการ์ด D+10) */
export function ReportCardLink({ href }: { href: string }) {
  return <p className={s.linkLine}>ผลย้อนหลังของสแกนนี้ → <Link href={href}>Report Card</Link></p>;
}

export function pctText(v: number | null | undefined, digits = 2) {
  return fmtPct(v, digits);
}
