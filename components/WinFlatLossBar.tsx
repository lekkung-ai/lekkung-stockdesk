import type { WinFlatLossPct } from '@/lib/winFlatLoss';

const WIN = '#1D9E75';
const FLAT = 'rgba(255,255,255,0.28)';
const LOSS = '#E24B4A';

// "ชนะ x% · เสมอ y% · แพ้ z%" text line for one report-card horizon.
export function WinFlatLossText({ p, className = '' }: { p: WinFlatLossPct; className?: string }) {
  return (
    <span className={`tabular-nums ${className}`}>
      <span style={{ color: WIN }}>ชนะ {p.win.toFixed(0)}%</span>
      <span className="text-white/20"> · </span>
      <span className="text-white/50">เสมอ {p.flat.toFixed(0)}%</span>
      <span className="text-white/20"> · </span>
      <span style={{ color: LOSS }}>แพ้ {p.loss.toFixed(0)}%</span>
    </span>
  );
}

// 3-part bar: win (green) · flat (grey) · loss (red), widths = share of n.
export function WinFlatLossBar({ p, className = 'h-1.5' }: { p: WinFlatLossPct; className?: string }) {
  return (
    <div
      className={`w-full rounded-full bg-white/[0.06] overflow-hidden flex ${className}`}
      role="img"
      aria-label={`ชนะ ${p.win.toFixed(0)}% เสมอ ${p.flat.toFixed(0)}% แพ้ ${p.loss.toFixed(0)}%`}
    >
      <div style={{ width: `${p.win}%`, backgroundColor: WIN }} />
      <div style={{ width: `${p.flat}%`, backgroundColor: FLAT }} />
      <div style={{ width: `${p.loss}%`, backgroundColor: LOSS }} />
    </div>
  );
}
