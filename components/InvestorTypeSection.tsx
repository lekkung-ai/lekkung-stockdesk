'use client';

import { useState, useEffect } from 'react';
import type { InvestorGroup } from '@/app/api/investor-type/route';

function fmt(n: number): string {
  return n.toLocaleString('th-TH', { maximumFractionDigits: 0 });
}

function SkeletonView() {
  return (
    <>
      {/* Mobile 2×2 */}
      <div className="grid grid-cols-2 gap-3 md:hidden">
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            className="rounded-xl p-3.5 animate-pulse"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="h-2.5 w-14 bg-white/[0.07] rounded mb-3" />
            <div className="h-5 w-20 bg-white/[0.07] rounded mb-2" />
            <div className="h-3 w-full bg-white/[0.07] rounded mb-3" />
            <div className="h-1.5 bg-white/[0.06] rounded-full" />
          </div>
        ))}
      </div>
      {/* Desktop rows */}
      <div className="hidden md:block space-y-0.5">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="flex items-center gap-2 py-2.5">
            <div className="h-3 w-20 bg-white/[0.06] rounded animate-pulse flex-shrink-0" />
            <div className="h-3 w-16 bg-white/[0.06] rounded animate-pulse flex-shrink-0" />
            <div className="h-3 w-16 bg-white/[0.06] rounded animate-pulse flex-shrink-0" />
            <div className="flex-1 h-3.5 bg-white/[0.06] rounded animate-pulse" />
            <div className="h-3 w-16 bg-white/[0.06] rounded animate-pulse flex-shrink-0" />
          </div>
        ))}
      </div>
    </>
  );
}

function MobileCard({ group, maxAbsNet }: { group: InvestorGroup; maxAbsNet: number }) {
  const isPos = group.net >= 0;
  const accent = isPos ? '#1D9E75' : '#E24B4A';
  const barPct = maxAbsNet > 0 ? (Math.abs(group.net) / maxAbsNet) * 100 : 0;

  return (
    <div
      className="rounded-xl p-3.5"
      style={{
        background: 'rgba(255,255,255,0.018)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderLeft: `3px solid ${accent}`,
      }}
    >
      <p className="text-[11px] text-white/40 mb-1.5">{group.type}</p>
      <div className="flex items-center gap-1 mb-1.5">
        <span className="text-[11px] text-[#1D9E75]/80 tabular-nums">{fmt(group.buy)}</span>
        <span className="text-[9px] text-white/15">/</span>
        <span className="text-[11px] text-[#E24B4A]/80 tabular-nums">{fmt(group.sell)}</span>
      </div>
      <p className="text-[19px] font-bold tabular-nums leading-none mb-2.5" style={{ color: accent }}>
        {isPos ? '+' : ''}{fmt(group.net)}
      </p>
      <div className="h-1.5 bg-white/[0.07] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${barPct}%`, background: accent, transition: 'width 0.5s ease' }}
        />
      </div>
    </div>
  );
}

function DesktopRow({ group, maxAbsNet }: { group: InvestorGroup; maxAbsNet: number }) {
  const isPos = group.net >= 0;
  const barPct = maxAbsNet > 0 ? (Math.abs(group.net) / maxAbsNet) * 100 : 0;

  return (
    <div className="flex items-center gap-1.5 py-2 border-b border-white/[0.05] last:border-0">
      <span className="text-[13px] font-medium text-white/75 w-20 flex-shrink-0">{group.type}</span>
      <span className="text-[12px] text-[#1D9E75] tabular-nums w-16 text-right flex-shrink-0">
        {fmt(group.buy)}
      </span>
      <span className="text-[12px] text-[#E24B4A] tabular-nums w-16 text-right flex-shrink-0">
        {fmt(group.sell)}
      </span>

      {/* Dual-sided bar */}
      <div className="flex flex-1 items-center min-w-0">
        {/* Left side: sell pressure (negative net → bar grows from center leftward) */}
        <div className="flex-1 flex justify-end items-center h-5">
          {!isPos && barPct > 0 && (
            <div
              style={{
                width: `${barPct}%`,
                height: '12px',
                background: '#E24B4A',
                borderRadius: '3px 0 0 3px',
                maxWidth: '100%',
              }}
            />
          )}
        </div>
        {/* Center divider */}
        <div
          style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.15)', flexShrink: 0 }}
        />
        {/* Right side: buy pressure (positive net → bar grows from center rightward) */}
        <div className="flex-1 flex items-center h-5">
          {isPos && barPct > 0 && (
            <div
              style={{
                width: `${barPct}%`,
                height: '12px',
                background: '#1D9E75',
                borderRadius: '0 3px 3px 0',
                maxWidth: '100%',
              }}
            />
          )}
        </div>
      </div>

      {/* Net value */}
      <span
        className="text-[13.5px] font-semibold tabular-nums w-16 text-right flex-shrink-0"
        style={{ color: isPos ? '#1D9E75' : '#E24B4A' }}
      >
        {isPos ? '+' : ''}{fmt(group.net)}
      </span>
    </div>
  );
}

export default function InvestorTypeSection() {
  const [data, setData] = useState<InvestorGroup[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/investor-type')
      .then(r => r.json())
      .then(json => {
        setData(Array.isArray(json.data) ? json.data : null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const maxAbsNet = data ? Math.max(...data.map(g => Math.abs(g.net)), 1) : 1;

  return (
    <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-4">
      <div className="mb-3">
        <h2 className="text-[14px] font-semibold text-white">แรงซื้อ-ขาย</h2>
        <p className="text-[11px] text-white/30 mt-0.5">มูลค่าซื้อขายสุทธิตามประเภทนักลงทุน · ล้านบาท</p>
      </div>

      {loading || !data || data.length === 0 ? (
        <SkeletonView />
      ) : (
        <>
          {/* Mobile: 2×2 card grid */}
          <div className="grid grid-cols-2 gap-3 md:hidden">
            {data.map(g => (
              <MobileCard key={g.type} group={g} maxAbsNet={maxAbsNet} />
            ))}
          </div>

          {/* Desktop: rows with dual bar */}
          <div className="hidden md:block">
            <div className="flex items-center gap-1.5 pb-2 mb-0.5 border-b border-white/[0.07]">
              <span className="text-[10px] text-white/25 w-20 flex-shrink-0">กลุ่ม</span>
              <span className="text-[10px] text-[#1D9E75]/50 w-16 text-right flex-shrink-0">ซื้อ</span>
              <span className="text-[10px] text-[#E24B4A]/50 w-16 text-right flex-shrink-0">ขาย</span>
              <div className="flex-1 flex text-[10px]">
                <div className="flex-1 flex justify-end pr-1.5">
                  <span className="text-[#E24B4A]/40">← ขาย</span>
                </div>
                <div className="w-px" />
                <div className="flex-1 pl-1.5">
                  <span className="text-[#1D9E75]/40">ซื้อ →</span>
                </div>
              </div>
              <span className="text-[10px] text-white/25 w-16 text-right flex-shrink-0">สุทธิ</span>
            </div>
            {data.map(g => (
              <DesktopRow key={g.type} group={g} maxAbsNet={maxAbsNet} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
