import Link from 'next/link';
import { notFound } from 'next/navigation';
import { allSectorEntries, slugToSector, sectorToSlug } from '@/lib/sectorData';
import { scanData } from '@/lib/scanData';
import { ChevronLeft } from 'lucide-react';
import SectorTickerGrid from '@/components/SectorTickerGrid';

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

export async function generateStaticParams() {
  const slugs = new Set(allSectorEntries.map(e => sectorToSlug(e.sector)));
  return Array.from(slugs).map(slug => ({ slug }));
}

export default async function SectorDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const sectorName = slugToSector(slug);
  if (!sectorName) notFound();

  const subsectors = allSectorEntries.filter(e => e.sector === sectorName);
  const totalCount = subsectors.reduce((s, e) => s + e.count, 0);
  const color = SECTOR_COLORS[sectorName] ?? '#6b7280';

  const scanMap = new Map(scanData.map(s => [s.ticker, s]));

  const subsectorData = subsectors.map(sub => ({
    subsector: sub.subsector,
    tickers: sub.tickers
      .map(t => ({ ticker: t, scan: scanMap.get(t) ?? null }))
      .sort((a, b) => {
        if (a.scan && b.scan) return b.scan.rs_score - a.scan.rs_score;
        if (a.scan) return -1;
        if (b.scan) return 1;
        return 0;
      }),
  }));

  return (
    <div className="p-4 md:p-6 space-y-6">
      <Link
        href="/sector"
        className="inline-flex items-center gap-1 text-[12px] text-white/40 hover:text-white/70 transition-colors"
      >
        <ChevronLeft size={14} />
        Sector Map
      </Link>

      <div className="flex items-center gap-3">
        <div className="w-1.5 h-10 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        <div>
          <h1 className="text-[20px] font-bold text-white">{sectorName}</h1>
          <p className="text-[12px] text-white/35 mt-0.5">{totalCount} หุ้น · {subsectors.length} subsectors</p>
        </div>
      </div>

      <SectorTickerGrid subsectors={subsectorData} />
    </div>
  );
}
