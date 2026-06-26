'use client';

import { useState } from 'react';
import Link from 'next/link';
import { getSectorsGrouped, sectorToSlug } from '@/lib/sectorData';

type Market = 'SET' | 'MAI';

const SECTOR_COLORS: Record<string, string> = {
  'Agro':             '#5D9E4A',
  'Consump':          '#E24B4A',
  'Consumer':         '#E24B4A',
  'Financials':       '#378ADD',
  'Industrials':      '#E67E22',
  'Property':         '#27AE60',
  'Resources':        '#EF9F27',
  'Services':         '#7F77DD',
  'Technology':       '#1D9E75',
};

function sectorColor(sector: string): string {
  return SECTOR_COLORS[sector] ?? '#6b7280';
}

export default function SectorPage() {
  const [market, setMarket] = useState<Market>('SET');
  const sectors = getSectorsGrouped(market);
  const totalTickers = sectors.reduce((s, g) => s + g.totalCount, 0);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-[18px] font-bold text-white">Sector Map</h1>
        <p className="text-[12px] text-white/35 mt-0.5">
          {sectors.length} sectors · {totalTickers} tickers
        </p>
      </div>

      {/* Market tab switcher */}
      <div className="flex gap-2">
        {(['SET', 'MAI'] as Market[]).map(m => (
          <button
            key={m}
            onClick={() => setMarket(m)}
            className={[
              'px-4 py-1.5 rounded-lg text-[12px] font-bold uppercase tracking-wider transition-all border',
              market === m
                ? 'bg-white/10 border-white/20 text-white'
                : 'border-white/[0.07] text-white/35 hover:text-white/60',
            ].join(' ')}
          >
            {m}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {sectors.map(({ sector, subsectors, totalCount }) => {
          const color = sectorColor(sector);
          const slug = sectorToSlug(sector);
          return (
            <Link
              key={sector}
              href={`/sector/${slug}?market=${market}`}
              className="group bg-[#13161e] border border-white/[0.07] rounded-xl p-4 hover:border-white/[0.15] hover:bg-white/[0.02] transition-all"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div
                  className="w-1 h-10 rounded-full flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-bold text-white leading-tight">{sector}</p>
                  <p className="text-[11px] text-white/35 mt-0.5">{totalCount} หุ้น</p>
                </div>
                <span className="text-white/20 group-hover:text-white/50 transition-colors text-[16px] leading-none flex-shrink-0">›</span>
              </div>

              <div className="space-y-1.5">
                {subsectors.map(sub => (
                  <div key={sub.subsector} className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-white/40 truncate">{sub.subsector}</span>
                    <span className="text-[11px] text-white/25 tabular-nums flex-shrink-0">{sub.count}</span>
                  </div>
                ))}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
