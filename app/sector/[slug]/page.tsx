import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { allSectorEntries, slugToSector, sectorToSlug } from '@/lib/sectorData';
import { scanData } from '@/lib/scanData';
import { ChevronLeft } from 'lucide-react';
import SectorViewToggle from '@/components/SectorViewToggle';

import marketStageData from '@/data/scans/market_stage.json';

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

export async function generateStaticParams() {
  const slugs = new Set(allSectorEntries.map(e => sectorToSlug(e.sector)));
  return Array.from(slugs).map(slug => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const sector = slugToSector(slug);
  return { title: sector ?? 'Sector' };
}

export default async function SectorDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const market = sp.market === 'MAI' ? 'MAI' : 'SET';

  const sectorName = slugToSector(slug);
  if (!sectorName) notFound();

  const subsectors = allSectorEntries.filter(e => e.sector === sectorName && e.market === market);
  if (subsectors.length === 0) notFound();
  const totalCount = subsectors.reduce((s, e) => s + e.count, 0);
  const color = SECTOR_COLORS[sectorName] ?? '#6b7280';

  const scanMap = new Map(scanData.map(s => [s.ticker, s]));
  const peMap = new Map(
    (marketStageData as Array<{ Ticker: string; PE_Ratio?: number | null; PBV?: number | null; ROE?: number | null }>).map(i => [
      i.Ticker,
      {
        pe: i.PE_Ratio ?? null,
        pb: i.PBV ?? null,
        roe: i.ROE != null ? i.ROE * 100 : null,
      },
    ])
  );

  const subsectorData = subsectors.map(sub => ({
    subsector: sub.subsector,
    tickers: sub.tickers
      .map(t => ({
        ticker: t,
        scan: scanMap.get(t) ?? null,
        pe: peMap.get(t)?.pe ?? null,
        pb: peMap.get(t)?.pb ?? null,
        roe: peMap.get(t)?.roe ?? null,
      }))
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
        href={`/sector`}
        className="inline-flex items-center gap-1 text-[12px] text-white/40 hover:text-white/70 transition-colors"
      >
        <ChevronLeft size={14} />
        Sector Map · {market}
      </Link>

      <div className="flex items-center gap-3">
        <div className="w-1.5 h-10 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        <div>
          <h1 className="text-[20px] font-bold text-white">{sectorName}</h1>
          <p className="text-[12px] text-white/35 mt-0.5">{totalCount} หุ้น · {subsectors.length} subsectors</p>
        </div>
      </div>

      <Suspense fallback={<div className="text-white/40 text-sm py-4">กำลังโหลดข้อมูล...</div>}>
        <SectorViewToggle subsectors={subsectorData} />
      </Suspense>
    </div>
  );
}
