// ชิ้นส่วนร่วมของ Report Card แบบเหตุการณ์ (server components ล้วน — หน้า static ไม่ต้องมี JS ฝั่ง client)
import Link from 'next/link';
import type { ReactNode } from 'react';
import { NEG, POS } from '@/lib/reportCard';
import { fmtP, fmtPt, tone } from '@/lib/rcEvents';
import { formatShortThaiDate } from '@/lib/utils';

export const CARD = 'bg-[#13161e] border border-white/[0.07] rounded-xl';
export const TH = 'px-2 py-2 text-[12px] font-medium text-white/45 whitespace-nowrap border-b border-white/[0.07]';
export const THR = `${TH} text-right`;
export const TD = 'px-2 py-2.5 border-b border-white/[0.05] tabular-nums align-top';
export const TDR = `${TD} text-right`;

export const thaiDate = (iso: string | null | undefined): string => (iso ? `${formatShortThaiDate(iso)} ${Number(iso.slice(0, 4)) + 543}` : '—');

const color = (x: number | null | undefined) => (tone(x) === 'pos' ? POS : tone(x) === 'neg' ? NEG : 'rgba(255,255,255,0.75)');

/** ผลตอบแทน (%) สีเขียว/แดง */
export function Ret({ v, digits = 1 }: { v: number | null | undefined; digits?: number }) {
  return <span style={{ color: color(v) }}>{fmtP(v, digits)}</span>;
}

/** ส่วนต่างเทียบ SET (จุด %) */
export function Pt({ v }: { v: number | null | undefined }) {
  return <span style={{ color: color(v) }}>{fmtPt(v)}</span>;
}

export function SmallBadge({ show }: { show: boolean }) {
  if (!show) return null;
  return <span className="ml-1.5 whitespace-nowrap rounded border border-white/15 px-1.5 text-[12px] text-white/50" data-small="1">ตัวอย่างน้อย</span>;
}

/** แท่งคู่ หุ้น vs SET (ตัวเลขบนแท่ง = %) · scale = ค่าสัมบูรณ์มากสุดของทั้งตาราง */
export function BarPair({ label, a, b, scale, small }: { label: ReactNode; a: number | null; b: number | null; scale: number; small: boolean }) {
  const w = (x: number | null) => (x == null || scale <= 0 ? 0 : Math.min(100, (Math.abs(x) / scale) * 100));
  const bar = (x: number | null, fill: string) => (
    <div className="flex items-center gap-2">
      <div className="relative h-3 flex-1 rounded-sm bg-white/[0.04]">
        <div className="absolute inset-y-0 left-0 rounded-sm" style={{ width: `${w(x)}%`, background: fill }} />
      </div>
      <span className="w-[58px] text-right text-[13px] tabular-nums"><Ret v={x} /></span>
    </div>
  );
  return (
    <div className={`grid grid-cols-[150px_1fr] sm:grid-cols-[190px_1fr] items-center gap-3 py-1.5 ${small ? 'opacity-55' : ''}`}>
      <div className="text-[13px] text-white/80">{label}</div>
      <div className="space-y-1">
        {bar(a, a != null && a < 0 ? NEG : POS)}
        {bar(b, 'rgba(255,255,255,0.28)')}
      </div>
    </div>
  );
}

export function Fallback({ text }: { text: string }) {
  return <div className={`${CARD} p-8 text-center text-[15px] text-white/70`} data-testid="rce-empty">{text}</div>;
}

export function Warnings({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return null;
  return (
    <div className="text-[12px] text-white/40 space-y-0.5" data-testid="rce-warnings">
      {warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
    </div>
  );
}

export function BackLink() {
  return <Link href="/report-card" className="text-[13px] text-[#93c5fd] hover:underline">← Report Card ทั้งหมด</Link>;
}

export function Section({ title, sub, children, testid }: { title: string; sub?: ReactNode; children: ReactNode; testid?: string }) {
  return (
    <section className={`${CARD} p-4`} data-testid={testid}>
      <h2 className="text-[15px] font-extrabold text-white">{title}</h2>
      {sub && <div className="mt-0.5 text-[13px] text-white/50">{sub}</div>}
      <div className="mt-3">{children}</div>
    </section>
  );
}
