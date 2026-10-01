import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { allSectorEntries, slugToSector, sectorToSlug } from '@/lib/sectorData';
import { scanData } from '@/lib/scanData';
import { sanitizeFlowQuery } from '@/lib/sectorFlow';
import { compareNullLast } from '@/lib/sepaTier';
import { ChevronLeft } from 'lucide-react';
import SectorViewToggle from '@/components/SectorViewToggle';
import SectorTodayChange from '@/components/SectorTodayChange';

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
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const one = (k: string) => { const v = sp[k]; return Array.isArray(v) ? v[0] : v; };
  const market = one('market') === 'MAI' ? 'MAI' : 'SET';

  const sectorName = slugToSector(slug);
  if (!sectorName) notFound();

  const subsectors = allSectorEntries.filter(e => e.sector === sectorName && e.market === market);
  if (subsectors.length === 0) notFound();

  // Opened from /sector-flow (?from=flow&back=<flow query>&sub=<subsector>): back link returns there with
  // the same view, and ?sub= narrows the stock views to that subsector. back is re-sanitized (only params
  // /sector-flow knows) · a ?sub= that isn't a subsector of this sector is ignored (whole sector shown).
  const fromFlow = one('from') === 'flow';
  const flowBack = fromFlow ? sanitizeFlowQuery(one('back')) : '';
  const backHref = fromFlow ? (flowBack ? `/sector-flow?${flowBack}` : '/sector-flow') : '/sector';
  const rawSub = one('sub');
  const activeSub = rawSub && subsectors.some(e => e.subsector === rawSub) ? rawSub : null;
  const allSubsQuery = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k === 'sub' || v == null) continue;
    for (const x of Array.isArray(v) ? v : [v]) allSubsQuery.append(k, x);
  }
  const allSubsHref = `/sector/${slug}${allSubsQuery.size ? `?${allSubsQuery.toString()}` : ''}`;
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

  const subsectorData = subsectors.filter(sub => !activeSub || sub.subsector === activeSub).map(sub => ({
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
        // RS null (กองทุน/REIT) อยู่ท้ายในกลุ่มที่มี scan · ไม่ถือเป็น 0
        if (a.scan && b.scan) return compareNullLast(a.scan.rs_score, b.scan.rs_score, 'desc');
        if (a.scan) return -1;
        if (b.scan) return 1;
        return 0;
      }),
  }));

  return (
    <div className="p-4 md:p-6 space-y-6">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-[12px] text-white/40 hover:text-white/70 transition-colors"
      >
        <ChevronLeft size={14} />
        {fromFlow ? 'Sector Flow' : `Sector Map · ${market}`}
      </Link>

      <div className="flex items-center gap-3">
        <div className="w-1.5 h-10 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        <div>
          <h1 className="text-[20px] font-bold text-white">{sectorName}</h1>
          <p className="text-[12px] text-white/35 mt-0.5">{totalCount} หุ้น · {subsectors.length} subsectors</p>
          <SectorTodayChange tickers={subsectors.flatMap(e => e.tickers)} />
        </div>
      </div>

      {activeSub && (
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <span className="px-2.5 py-1 rounded-lg border font-semibold" style={{ color, borderColor: `${color}66`, background: `${color}1f` }}>
            กำลังดู: {activeSub}
          </span>
          <Link
            href={allSubsHref}
            className="px-2.5 py-1 rounded-lg border border-white/10 bg-white/[0.04] text-white/50 hover:text-white transition-colors"
          >
            ดูทั้ง {sectorName}
          </Link>
        </div>
      )}

      <Suspense fallback={<div className="text-white/40 text-sm py-4">กำลังโหลดข้อมูล...</div>}>
        <SectorViewToggle subsectors={subsectorData} />
      </Suspense>
    </div>
  );
}
