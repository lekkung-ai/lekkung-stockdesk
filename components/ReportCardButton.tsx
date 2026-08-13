import Link from 'next/link';
import { BarChart3 } from 'lucide-react';

const DETAIL_PAGE_KEYS = ['sepa', 'kell', 'breakout', 'lekkung_growth', 'ppbp', 'oneil'];

export default function ReportCardButton({ scanKey }: { scanKey: string }) {
  const href = DETAIL_PAGE_KEYS.includes(scanKey) ? `/report-card/${scanKey}` : '/report-card';
  return (
    <Link
      href={href}
      title="ดูผลย้อนหลังของสแกนนี้ (Report Card)"
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-[#1D9E75]/[0.12] text-[#1D9E75] hover:bg-[#1D9E75]/20 transition-colors border border-[#1D9E75]/25"
    >
      <BarChart3 size={13} />
      <span>Report Card</span>
    </Link>
  );
}
