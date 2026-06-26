'use client';

import { useState, useEffect } from 'react';

interface MarketData {
  gainers: number | null;
  losers: number | null;
}

export default function GainersLosersCard() {
  const [set, setSet] = useState<MarketData>({ gainers: null, losers: null });
  const [mai, setMai] = useState<MarketData>({ gainers: null, losers: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/settrade?type=topGainer&market=set').then(r => r.json()),
      fetch('/api/settrade?type=topLoser&market=set').then(r => r.json()),
      fetch('/api/settrade?type=topGainer&market=mai').then(r => r.json()),
      fetch('/api/settrade?type=topLoser&market=mai').then(r => r.json()),
    ])
      .then(([sg, sl, mg, ml]) => {
        setSet({ gainers: (sg.items as unknown[])?.length ?? null, losers: (sl.items as unknown[])?.length ?? null });
        setMai({ gainers: (mg.items as unknown[])?.length ?? null, losers: (ml.items as unknown[])?.length ?? null });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-4 min-w-[170px] flex-shrink-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-white/35 mb-2.5">Gainers / Losers</p>
      {loading ? (
        <div className="space-y-2">
          <div className="h-5 w-36 bg-white/[0.06] rounded animate-pulse" />
          <div className="h-5 w-36 bg-white/[0.06] rounded animate-pulse" />
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-white/30 w-6">SET</span>
            <span className="text-[18px] font-bold tabular-nums leading-none text-[#1D9E75]">{set.gainers ?? '—'}</span>
            <span className="text-[13px] font-bold text-white/20">/</span>
            <span className="text-[18px] font-bold tabular-nums leading-none text-[#E24B4A]">{set.losers ?? '—'}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-white/30 w-6">MAI</span>
            <span className="text-[18px] font-bold tabular-nums leading-none text-[#1D9E75]">{mai.gainers ?? '—'}</span>
            <span className="text-[13px] font-bold text-white/20">/</span>
            <span className="text-[18px] font-bold tabular-nums leading-none text-[#E24B4A]">{mai.losers ?? '—'}</span>
          </div>
        </div>
      )}
      <p className="text-[11px] text-white/25 mt-2">วันนี้ · Top 20</p>
    </div>
  );
}
