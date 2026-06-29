'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import type { SectorImpact as SectorImpactItem } from '@/app/api/index-impact/route';

interface ImpactData {
  sectorImpacts: SectorImpactItem[];
}

function fmt(n: number, d = 4): string {
  return n.toFixed(d);
}

function SectorRow({ item, positive }: { item: SectorImpactItem; positive: boolean }) {
  const color = positive ? '#1D9E75' : '#E24B4A';
  const sign = item.impact >= 0 ? '+' : '';
  return (
    <div className="flex items-center gap-2 py-[4px] border-b border-white/[0.04] last:border-0">
      <span className="text-[13px] font-bold text-white/75 w-[68px] shrink-0">${item.sector}</span>
      <span className="text-[11px] tabular-nums text-white/25 w-[28px] text-right shrink-0">
        {item.stockCount}
      </span>
      <span className="text-[13px] font-semibold tabular-nums flex-1 text-right" style={{ color }}>
        {sign}{fmt(Math.abs(item.impact), 4)}
        <span className="text-[10px] font-normal text-white/30 ml-0.5">pt</span>
      </span>
    </div>
  );
}

export default function SectorImpact() {
  const [data, setData] = useState<ImpactData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch('/api/index-impact')
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(true); setLoading(false); return; }
        setData({ sectorImpacts: d.sectorImpacts ?? [] });
        setLoading(false);
      })
      .catch(() => { setError(true); setLoading(false); });
  }, []);

  const gainers = (data?.sectorImpacts.filter(x => x.impact > 0) ?? []).slice(0, 8);
  const losers  = [...(data?.sectorImpacts.filter(x => x.impact < 0) ?? [])].reverse().slice(0, 8);
  const totalGain = gainers.reduce((s, x) => s + x.impact, 0);
  const totalLoss = losers.reduce((s, x) => s + x.impact, 0);
  const netImpact = totalGain + totalLoss;

  return (
    <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-2.5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-white/25 mb-0.5">
            Sector Impact
          </p>
          <p className="text-[12px] text-white/30">SET100 · รายกลุ่มอุตสาหกรรม</p>
        </div>
        {data && (gainers.length > 0 || losers.length > 0) && (
          <div
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={
              netImpact >= 0
                ? { background: 'rgba(29,158,117,.12)', color: '#1D9E75', border: '1px solid rgba(29,158,117,.25)' }
                : { background: 'rgba(226,75,74,.12)', color: '#E24B4A', border: '1px solid rgba(226,75,74,.25)' }
            }
          >
            {netImpact >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {netImpact >= 0 ? '+' : ''}{fmt(netImpact, 2)} จุด
          </div>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3">
          {[0, 1].map(i => (
            <div key={i} className="space-y-1.5">
              {Array.from({ length: 6 }).map((_, j) => (
                <div key={j} className="h-6 bg-white/[0.05] rounded animate-pulse" />
              ))}
            </div>
          ))}
        </div>
      ) : error ? (
        <p className="text-[13px] text-white/30 py-4 text-center">โหลดข้อมูลไม่สำเร็จ</p>
      ) : !data || data.sectorImpacts.length === 0 ? (
        <p className="text-[13px] text-white/30 py-4 text-center">ไม่มีข้อมูล</p>
      ) : (
        <div className="grid grid-cols-2 gap-x-4">
          {/* Gainers */}
          <div>
            <div className="flex items-center gap-1 mb-1">
              <TrendingUp size={11} style={{ color: '#1D9E75' }} />
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#1D9E75' }}>
                หนุน SET
              </span>
            </div>
            <div className="flex items-center gap-2 pb-1 border-b border-white/[0.07] mb-0.5">
              <span className="text-[9px] text-white/20 w-[68px] shrink-0">กลุ่ม</span>
              <span className="text-[9px] text-white/20 w-[28px] text-right shrink-0">N</span>
              <span className="text-[9px] text-white/20 flex-1 text-right">impact</span>
            </div>
            {gainers.length === 0 ? (
              <p className="text-[12px] text-white/25 py-3 text-center">ไม่มี</p>
            ) : (
              gainers.map(item => <SectorRow key={item.sector} item={item} positive />)
            )}
            {gainers.length > 0 && (
              <div className="flex items-center justify-between pt-1.5 mt-1 border-t border-white/[0.06]">
                <span className="text-[11px] text-white/30">รวม</span>
                <span className="text-[13px] font-bold tabular-nums" style={{ color: '#1D9E75' }}>
                  +{fmt(totalGain, 2)} pt
                </span>
              </div>
            )}
          </div>

          {/* Losers */}
          <div>
            <div className="flex items-center gap-1 mb-1">
              <TrendingDown size={11} style={{ color: '#E24B4A' }} />
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#E24B4A' }}>
                กด SET
              </span>
            </div>
            <div className="flex items-center gap-2 pb-1 border-b border-white/[0.07] mb-0.5">
              <span className="text-[9px] text-white/20 w-[68px] shrink-0">กลุ่ม</span>
              <span className="text-[9px] text-white/20 w-[28px] text-right shrink-0">N</span>
              <span className="text-[9px] text-white/20 flex-1 text-right">impact</span>
            </div>
            {losers.length === 0 ? (
              <p className="text-[12px] text-white/25 py-3 text-center">ไม่มี</p>
            ) : (
              losers.map(item => <SectorRow key={item.sector} item={item} positive={false} />)
            )}
            {losers.length > 0 && (
              <div className="flex items-center justify-between pt-1.5 mt-1 border-t border-white/[0.06]">
                <span className="text-[11px] text-white/30">รวม</span>
                <span className="text-[13px] font-bold tabular-nums" style={{ color: '#E24B4A' }}>
                  {fmt(totalLoss, 2)} pt
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
