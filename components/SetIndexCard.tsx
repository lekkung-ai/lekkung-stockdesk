'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

type IndexData = { price: number; change: number; changePercent: number };

export default function SetIndexCard({
  label = 'SET Index',
  symbol = '^SET.BK',
  href,
  large = false,
}: { label?: string; symbol?: string; href?: string; large?: boolean } = {}) {
  const [data, setData] = useState<IndexData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/prices?symbols=${encodeURIComponent(symbol)}`)
      .then(r => r.json())
      .then(json => {
        const d = json.prices?.[symbol];
        if (d) setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [symbol]);

  const isPos = data ? data.changePercent >= 0 : true;

  const cardCls = `bg-[#13161e] border border-white/[0.07] rounded-xl ${large ? 'p-6' : 'p-4 min-w-[160px]'} flex-shrink-0`;
  const valueCls = large ? 'text-[36px]' : 'text-[25px]';
  const subCls = large ? 'text-[14px]' : 'text-[12px]';
  const body = (
    <>
      <p className={`font-semibold uppercase tracking-wider text-white/35 mb-1.5 ${large ? 'text-[11px]' : 'text-[10px]'}`}>{label}</p>
      {loading ? (
        <>
          <div className={`${large ? 'h-9 w-32' : 'h-7 w-24'} bg-white/[0.06] rounded animate-pulse mb-2`} />
          <div className="h-3.5 w-20 bg-white/[0.04] rounded animate-pulse" />
        </>
      ) : data ? (
        <>
          <p className={`${valueCls} font-bold text-white leading-none tabular-nums`}>
            {data.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className={`${subCls} mt-1.5 font-medium tabular-nums ${isPos ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>
            {isPos ? '+' : ''}{data.change.toFixed(2)}{' '}
            <span className={large ? 'text-[13px]' : 'text-[11px]'}>
              ({isPos ? '+' : ''}{data.changePercent.toFixed(2)}%)
            </span>
          </p>
        </>
      ) : (
        <>
          <p className={`${valueCls} font-bold text-white/30 leading-none`}>—</p>
          <p className={`${subCls} mt-1.5 text-white/20`}>ไม่มีข้อมูล</p>
        </>
      )}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={`${cardCls} block hover:border-white/20 hover:bg-white/[0.025] transition-colors`}
      >
        {body}
      </Link>
    );
  }
  return <div className={cardCls}>{body}</div>;
}
