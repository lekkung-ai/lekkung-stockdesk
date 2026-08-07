import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import rawReportCard from '@/data/scans/report_card.json';
import ReportCardDetailClient from './ReportCardDetailClient';

const SCAN_KEYS = ['sepa', 'kell', 'breakout', 'lekkung_growth', 'ppbp', 'oneil'];

const SCAN_LABELS: Record<string, string> = {
  sepa: 'SEPA',
  kell: 'Oliver Kell',
  breakout: 'Breakout',
  lekkung_growth: 'Lekkung Growth',
  ppbp: 'PPBP',
  oneil: "CAN SLIM (O'Neil)",
};

const SCAN_COLORS: Record<string, string> = {
  sepa: '#1D9E75',
  kell: '#378ADD',
  breakout: '#EF9F27',
  lekkung_growth: '#7F77DD',
  ppbp: '#E24B4A',
  oneil: '#06B6D4',
};

export async function generateStaticParams() {
  return SCAN_KEYS.map(scan => ({ scan }));
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

  const scanData = (rawReportCard as any).scans?.[scan];
  if (!scanData) notFound();

  return (
    <ReportCardDetailClient
      scanKey={scan}
      scanLabel={SCAN_LABELS[scan]}
      scanColor={SCAN_COLORS[scan] ?? '#7F77DD'}
      scanData={scanData}
    />
  );
}
