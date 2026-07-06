'use client';

import { useState, useEffect } from 'react';

function formatVolume(v: number): { main: string; unit: string } {
  if (v >= 100_000) return { main: (v / 100_000).toFixed(1), unit: 'แสนล้านบาท' };
  if (v >= 1_000) return { main: (v / 1_000).toFixed(1), unit: 'พันล้านบาท' };
  return { main: v.toLocaleString('th-TH', { maximumFractionDigits: 0 }), unit: 'ล้านบาท' };
}

export default function VolumeCard({ large = false }: { large?: boolean } = {}) {
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
  const valueCls = large ? 'text-[36px]' : 'text-[25px]';
  const subCls = large ? 'text-[14px]' : 'text-[12px]';

  return (
    <div className={`bg-[#13161e] border border-white/[0.07] rounded-xl ${large ? 'p-6' : 'p-4 min-w-[160px]'} flex-shrink-0`}>
      <p className={`font-semibold uppercase tracking-wider text-white/35 mb-1.5 ${large ? 'text-[11px]' : 'text-[10px]'}`}>Volume</p>
      {loading ? (
        <>
          <div className={`${large ? 'h-9 w-32' : 'h-7 w-28'} bg-white/[0.06] rounded animate-pulse mb-2`} />
          <div className="h-3.5 w-20 bg-white/[0.04] rounded animate-pulse" />
        </>
      ) : fmt ? (
        <>
          <p className={`${valueCls} font-bold text-white leading-none tabular-nums`}>{fmt.main}</p>
          <p className={`${subCls} mt-1.5 text-white/35`}>{fmt.unit} · วันนี้</p>
        </>
      ) : (
        <>
          <p className={`${valueCls} font-bold text-white/30 leading-none`}>—</p>
          <p className={`${subCls} mt-1.5 text-white/20`}>ไม่มีข้อมูล</p>
        </>
      )}
    </div>
  );
}
