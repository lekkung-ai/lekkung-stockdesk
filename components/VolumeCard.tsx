'use client';

import { useState, useEffect } from 'react';

function formatVolume(v: number): { main: string; unit: string } {
  if (v >= 100_000) return { main: (v / 100_000).toFixed(1), unit: 'แสนล้านบาท' };
  if (v >= 1_000) return { main: (v / 1_000).toFixed(1), unit: 'พันล้านบาท' };
  return { main: v.toLocaleString('th-TH', { maximumFractionDigits: 0 }), unit: 'ล้านบาท' };
}

export default function VolumeCard() {
  const [value, setValue] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/market-volume')
      .then(r => r.json())
      .then(json => {
        setValue(typeof json.value === 'number' ? json.value : null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const fmt = value != null ? formatVolume(value) : null;

  return (
    <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-4 min-w-[160px] flex-shrink-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-white/35 mb-1.5">Volume</p>
      {loading ? (
        <>
          <div className="h-7 w-28 bg-white/[0.06] rounded animate-pulse mb-2" />
          <div className="h-3.5 w-20 bg-white/[0.04] rounded animate-pulse" />
        </>
      ) : fmt ? (
        <>
          <p className="text-[25px] font-bold text-white leading-none tabular-nums">{fmt.main}</p>
          <p className="text-[12px] mt-1.5 text-white/35">{fmt.unit} · วันนี้</p>
        </>
      ) : (
        <>
          <p className="text-[25px] font-bold text-white/30 leading-none">—</p>
          <p className="text-[12px] mt-1.5 text-white/20">ไม่มีข้อมูล</p>
        </>
      )}
    </div>
  );
}
