'use client';

import { useState, useEffect } from 'react';
import type { SectorFlowItem } from '@/app/api/sector-flow/route';

type Period = '1D' | '1W' | '1M' | '3M';

const PERIODS: { key: Period; label: string }[] = [
  { key: '1D', label: 'วันนี้' },
  { key: '1W', label: '1W' },
  { key: '1M', label: '1M' },
  { key: '3M', label: '3M' },
];

const SECTOR_COLORS: Record<string, string> = {
  'Financials': '#378ADD',
  'Energy & Utilities': '#EF9F27',
  'Technology': '#1D9E75',
  'Materials': '#9B59B6',
  'Industrials': '#E67E22',
  'Consumer Products': '#E24B4A',
  'Property': '#27AE60',
  'Services': '#7F77DD',
};

export interface SectorBreadthInfo {
  total: number;      // Y — scan-matched count for this sector
  above: number;       // count above EMA50
  pct: number;         // % above EMA50
  bullishPct: number;
  accumPct: number;
  warnPct: number;
}

interface Props {
  breadthBySector: Record<string, SectorBreadthInfo>;
  scanDateLabel: string;
}

function SectorCard({
  s,
  breadth,
  scanDateLabel,
  maxAbs,
  expanded,
  onToggle,
}: {
  s: SectorFlowItem;
  breadth: SectorBreadthInfo | undefined;
  scanDateLabel: string;
  maxAbs: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isPos = s.pct_change >= 0;
  const accent = isPos ? '#1D9E75' : '#E24B4A';
  const barWidth = maxAbs > 0 ? Math.min(100, (Math.abs(s.pct_change) / maxAbs) * 100) : 0;
  const sectorColor = SECTOR_COLORS[s.sector] ?? '#6b7280';
  const hasBreadth = !!breadth && breadth.total > 0;

  return (
    <div
      className="rounded-xl p-4 cursor-pointer transition-all hover:bg-white/[0.025] select-none"
      style={{
        background: 'rgba(255,255,255,0.018)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderLeft: `3px solid ${sectorColor}`,
      }}
      onClick={onToggle}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <span className="text-[13px] font-semibold text-white/85 leading-tight">{s.sector}</span>
        <span className="text-[10px] text-white/30 flex-shrink-0 tabular-nums text-right">
          {s.count} หุ้น · ในสแกน {breadth?.total ?? 0}
        </span>
      </div>

      {/* % change */}
      <div className="flex items-center gap-3 mb-3">
        <span
          className="text-[22px] font-bold tabular-nums leading-none"
          style={{ color: accent }}
        >
          {s.pct_change >= 0 ? '+' : ''}
          {s.pct_change.toFixed(2)}%
        </span>
        <div className="flex-1 h-1.5 bg-white/[0.07] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{ width: `${barWidth}%`, background: accent, transition: 'width 0.5s ease' }}
          />
        </div>
      </div>

      {/* Breadth / stage distribution — denominator is ALWAYS the scan count (Y), never universe (X) */}
      {!hasBreadth ? (
        <div className="text-[11px] text-white/25 italic py-1">ไม่มีข้อมูลสแกน</div>
      ) : (
        <>
          <div className="flex items-center gap-3 mb-2.5">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-white/30">เหนือ EMA50</span>
                <span className="text-[11px] font-semibold text-white/60 tabular-nums">
                  {breadth!.above}/{breadth!.total} · {breadth!.pct.toFixed(0)}%
                </span>
              </div>
              <div className="h-1.5 bg-white/[0.07] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${breadth!.pct}%`, background: '#EF9F27' }}
                />
              </div>
            </div>
          </div>

          <div>
            <div
              className="text-[10px] text-white/20 mb-1.5 w-fit cursor-help"
              title="Bull = S.Bull + Bull · Accum = Accumulation + Recovery · Warn = Warning + Distribution + Bear"
            >
              Stage distribution
            </div>
            <div className="flex h-2 rounded-full overflow-hidden gap-px">
              {breadth!.bullishPct > 0 && (
                <div
                  className="h-full rounded-l-full"
                  style={{ width: `${breadth!.bullishPct}%`, background: '#1D9E75' }}
                  title={`Bull/S.Bull: ${breadth!.bullishPct.toFixed(0)}%`}
                />
              )}
              {breadth!.accumPct > 0 && (
                <div
                  className="h-full"
                  style={{ width: `${breadth!.accumPct}%`, background: '#378ADD' }}
                  title={`Accum/Recovery: ${breadth!.accumPct.toFixed(0)}%`}
                />
              )}
              {breadth!.warnPct > 0 && (
                <div
                  className="h-full rounded-r-full"
                  style={{ width: `${breadth!.warnPct}%`, background: '#E24B4A' }}
                  title={`Warning/Bear: ${breadth!.warnPct.toFixed(0)}%`}
                />
              )}
            </div>
            <div className="flex gap-3 mt-1.5">
              <span className="text-[10px] tabular-nums" style={{ color: '#1D9E75' }}>
                {breadth!.bullishPct.toFixed(0)}% Bull
              </span>
              <span className="text-[10px] tabular-nums" style={{ color: '#378ADD' }}>
                {breadth!.accumPct.toFixed(0)}% Accum
              </span>
              <span className="text-[10px] tabular-nums" style={{ color: '#E24B4A' }}>
                {breadth!.warnPct.toFixed(0)}% Warn
              </span>
            </div>
          </div>
        </>
      )}

      {/* Expand chevron hint */}
      <div className="flex items-center justify-end mt-2.5">
        <span className="text-[9px] text-white/20 uppercase tracking-wider">
          {expanded ? '▲ ปิด' : '▼ subsector'}
        </span>
      </div>

      {/* Subsector breakdown */}
      {expanded && s.subsectors.length > 0 && (
        <div className="mt-2 pt-2.5 border-t border-white/[0.06] space-y-1.5">
          {s.subsectors.map(sub => (
            <div key={sub.name} className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-white/35 truncate leading-tight">{sub.name}</span>
              <span
                className="text-[11px] font-semibold tabular-nums flex-shrink-0"
                style={{ color: sub.pct >= 0 ? '#1D9E75' : '#E24B4A' }}
              >
                {sub.pct >= 0 ? '+' : ''}
                {sub.pct.toFixed(2)}%
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="mt-2.5 pt-2 border-t border-white/[0.05] text-[9.5px] text-white/20">
        %เปลี่ยน = realtime · breadth/stage ณ สแกน {scanDateLabel}
      </div>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {Array.from({ length: 8 }, (_, i) => (
        <div
          key={i}
          className="rounded-xl p-4 animate-pulse"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div className="h-3 bg-white/[0.06] rounded w-3/4 mb-3" />
          <div className="h-6 bg-white/[0.06] rounded w-1/2 mb-3" />
          <div className="h-1.5 bg-white/[0.06] rounded-full mb-3" />
          <div className="h-2 bg-white/[0.06] rounded-full" />
        </div>
      ))}
    </div>
  );
}

export default function SectorOverview({ breadthBySector, scanDateLabel }: Props) {
  const [period, setPeriod] = useState<Period>('1D');
  const [data, setData] = useState<SectorFlowItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);
    setData(null);
    fetch(`/api/sector-flow?period=${period}`)
      .then(r => r.json())
      .then((json: SectorFlowItem[]) => setData(json))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [period]);

  function toggle(sector: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(sector)) next.delete(sector);
      else next.add(sector);
      return next;
    });
  }

  const maxAbs = data && data.length > 0
    ? Math.max(...data.map(s => Math.abs(s.pct_change)), 0.01)
    : 1;

  return (
    <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-[13px] font-semibold text-white">Sector</h2>
          <p className="text-[11px] text-white/30 mt-0.5">
            % เปลี่ยนแปลง realtime + breadth/stage ต่อ sector · กด card เพื่อดู subsector
          </p>
        </div>

        {/* Period switcher */}
        <div className="flex items-center gap-0.5 bg-white/[0.04] rounded-lg p-1 flex-shrink-0">
          {PERIODS.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                period === p.key
                  ? p.key === '1D'
                    ? 'bg-[#1D9E75]/20 text-[#1D9E75]'
                    : 'bg-white/[0.12] text-white'
                  : 'text-white/35 hover:text-white/60'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <SkeletonGrid />
      ) : !data || data.length === 0 ? (
        <div className="py-12 text-center text-[13px] text-white/25">
          ไม่สามารถโหลดข้อมูลได้
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {data.map(s => (
            <SectorCard
              key={s.sector}
              s={s}
              breadth={breadthBySector[s.sector]}
              scanDateLabel={scanDateLabel}
              maxAbs={maxAbs}
              expanded={expanded.has(s.sector)}
              onToggle={() => toggle(s.sector)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
