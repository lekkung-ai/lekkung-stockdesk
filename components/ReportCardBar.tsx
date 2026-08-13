import Link from 'next/link';
import rawReportCard from '@/data/scans/report_card.json';

interface HorizonMetric {
  n: number;
  avg_return_pct: number | null;
  win_rate_pct: number | null;
}

interface ReportCardFile {
  scans: Record<string, { horizons: Record<string, HorizonMetric> }>;
}

const reportCard = rawReportCard as unknown as ReportCardFile;

const DETAIL_PAGE_KEYS = ['sepa', 'kell', 'breakout', 'lekkung_growth', 'ppbp', 'oneil'];

// Per-scan performance summary, pulled from the same report_card.json that
// drives /report-card - "10 วันที่ผ่านมา" uses the D+10 forward-return
// horizon (win rate + avg return of picks made ~10 trading days ago).
// Returns null quietly if this scan isn't tracked in report_card.json yet
// (oneil, market-stage, stage-analysis aren't as of this writing) rather
// than showing a broken/empty bar.
export default function ReportCardBar({ scanKey }: { scanKey: string }) {
  const horizon10 = reportCard.scans[scanKey]?.horizons?.['10'];
  if (!horizon10 || horizon10.n === 0 || horizon10.win_rate_pct == null || horizon10.avg_return_pct == null) {
    return null;
  }

  const avg = horizon10.avg_return_pct;
  const href = DETAIL_PAGE_KEYS.includes(scanKey) ? `/report-card/${scanKey}` : '/report-card';

  return (
    <Link
      href={href}
      className="flex items-center gap-1.5 text-label text-white/40 hover:text-white/70 transition-colors"
    >
      <span>10 วันที่ผ่านมา:</span>
      <span className="text-white/60">win rate {horizon10.win_rate_pct.toFixed(0)}%</span>
      <span className="text-white/20">·</span>
      <span className={avg >= 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}>
        avg {avg >= 0 ? '+' : ''}{avg.toFixed(1)}%
      </span>
      <span className="text-white/25 underline decoration-dotted underline-offset-2">ดูรายละเอียด</span>
    </Link>
  );
}