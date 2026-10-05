import type { SectorSummaryRow, StageSplit } from '@/lib/sectorSummary';

// Stage colours as on the home page Stage Distribution (Bull = S.Bull+Bull, Accum = Accumulation+Recovery).
const SEGMENTS: { key: keyof StageSplit; label: string; color: string }[] = [
  { key: 'bull', label: 'Bull', color: '#4caf50' },
  { key: 'accum', label: 'Accum', color: '#00bcd4' },
  { key: 'warning', label: 'Warning', color: '#FFEB3B' },
  { key: 'distribution', label: 'Dist', color: '#ff9800' },
  { key: 'bear', label: 'Bear', color: '#ef5350' },
  { key: 'unknown', label: 'Unknown', color: '#6b7280' },
];

const STAGE_TIP = 'Bull = S.Bull + Bull · Accum = Accumulation + Recovery · Unknown = ไม่มีข้อมูล stage · % ของหุ้นทั้งหมดในกลุ่ม';

// EMA50 + stage split on a Sector Map sector card.
export default function SectorChipBreadth({ row }: { row: SectorSummaryRow | undefined }) {
  if (!row) return null;
  const split = row.stageSplit;
  const segs = split ? SEGMENTS.filter(s => s.key !== 'unknown' || split.unknown > 0) : [];
  return (
    <div className="mt-2 pt-2 border-t border-white/[0.05] space-y-1.5 text-left" data-testid="sector-chip-breadth">
      <div title={`${row.emaAbove}/${row.emaDenom} หุ้นราคาเหนือ EMA50`}>
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-white/35">เหนือ EMA50</span>
          <span className="text-white/70 font-semibold tabular-nums" data-testid="chip-ema">
            {row.emaPct != null ? `${row.emaPct.toFixed(0)}%` : '—'}
          </span>
        </div>
        <div className="h-1 mt-0.5 rounded-full bg-white/[0.06] overflow-hidden">
          <div className="h-full rounded-full bg-[#EF9F27]" style={{ width: `${row.emaPct ?? 0}%` }} />
        </div>
      </div>
      {split && (
        <div title={STAGE_TIP}>
          <div className="text-[10px] text-white/35">Stage</div>
          <div className="flex h-1.5 mt-0.5 rounded-full overflow-hidden gap-px" data-testid="chip-stage-bar">
            {segs.map(s => (
              <div key={s.key} style={{ width: `${split[s.key]}%`, background: s.color }} title={`${s.label} ${split[s.key].toFixed(0)}%`} />
            ))}
          </div>
          <div className="flex flex-wrap justify-between gap-x-1 mt-0.5 text-[9.5px] tabular-nums" data-testid="chip-stage-pcts">
            {segs.map(s => (
              <span key={s.key} style={{ color: s.color }} title={s.label} data-stage={s.key}>
                {split[s.key].toFixed(0)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
