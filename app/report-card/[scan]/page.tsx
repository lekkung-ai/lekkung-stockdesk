import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import rawReportCard from '@/data/scans/report_card.json';
import ReportCardDetailClient from './ReportCardDetailClient';
import { ReportCardFile, SCAN_COLORS, SCAN_DESC, SCAN_LABELS, SCAN_ORDER } from '@/lib/reportCard';

const data = rawReportCard as unknown as ReportCardFile;

export async function generateStaticParams() {
  return SCAN_ORDER.map(scan => ({ scan }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ scan: string }>;
}): Promise<Metadata> {
  const { scan } = await params;
  const name = SCAN_LABELS[scan] ?? scan;
  return { title: `${name} — Report Card` };
}

export default async function ScanDetailPage({
  params,
}: {
  params: Promise<{ scan: string }>;
}) {
  const { scan } = await params;
  if (!SCAN_LABELS[scan]) notFound();

  const scanData = data.scans?.[scan];
  if (!scanData) notFound();

  return (
    <ReportCardDetailClient
      scanKey={scan}
      scanLabel={SCAN_LABELS[scan]}
      scanColor={SCAN_COLORS[scan] ?? '#7F77DD'}
      scanDesc={SCAN_DESC[scan]}
      scanData={scanData}
      meta={{
        generated_at: data.generated_at,
        assumptions: data.assumptions ?? {},
        history_range: data.history_range,
        price_range: data.price_range,
      }}
    />
  );
}
