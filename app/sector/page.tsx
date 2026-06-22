import Link from 'next/link';
import { getSectorsGrouped, sectorToSlug } from '@/lib/sectorData';

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

function sectorColor(sector: string): string {
  return SECTOR_COLORS[sector] ?? '#6b7280';
}

export default function SectorPage() {
  const sectors = getSectorsGrouped();

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-[18px] font-bold text-white">Sector Map</h1>
        <p className="text-[12px] text-white/35 mt-0.5">{sectors.length} sectors · {sectors.reduce((s, g) => s + g.totalCount, 0)} tickers</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {sectors.map(({ sector, subsectors, totalCount }) => {
          const color = sectorColor(sector);
          const slug = sectorToSlug(sector);
          return (
            <Link
              key={sector}
              href={`/sector/${slug}`}
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
