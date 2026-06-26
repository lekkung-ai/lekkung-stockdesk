'use client';

import { useState, useEffect } from 'react';

type IndexData = { price: number; change: number; changePercent: number };

export default function SetIndexCard() {
  const [data, setData] = useState<IndexData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/prices?symbols=%5ESET.BK')
      .then(r => r.json())
      .then(json => {
        const d = json.prices?.['^SET.BK'];
        if (d) setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const isPos = data ? data.changePercent >= 0 : true;

  return (
    <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-4 min-w-[160px] flex-shrink-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-white/35 mb-1.5">SET Index</p>
      {loading ? (
        <>
          <div className="h-7 w-24 bg-white/[0.06] rounded animate-pulse mb-2" />
          <div className="h-3.5 w-20 bg-white/[0.04] rounded animate-pulse" />
        </>
      ) : data ? (
        <>
          <p className="text-[22px] font-bold text-white leading-none tabular-nums">
            {data.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className={`text-[12px] mt-1.5 font-medium tabular-nums ${isPos ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>
            {isPos ? '+' : ''}{data.change.toFixed(2)}{' '}
            <span className="text-[11px]">
              ({isPos ? '+' : ''}{data.changePercent.toFixed(2)}%)
            </span>
          </p>
        </>
      ) : (
        <>
          <p className="text-[22px] font-bold text-white/30 leading-none">—</p>
          <p className="text-[12px] mt-1.5 text-white/20">ไม่มีข้อมูล</p>
        </>
      )}
    </div>
  );
}
