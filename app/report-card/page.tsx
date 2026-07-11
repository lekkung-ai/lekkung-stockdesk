import Link from 'next/link';
import rawReportCard from '@/data/scans/report_card.json';
import { formatThaiDate } from '@/lib/utils';

interface BestWorstEntry { ticker: string; entry_date: string; return_pct: number; }
interface HorizonMetric {
  n: number;
  avg_return_pct: number | null;
  median_return_pct: number | null;
  win_rate_pct: number | null;
  avg_set_return_pct: number | null;
  excess_return_pct: number | null;
  best5: BestWorstEntry[];
  worst5: BestWorstEntry[];
}
interface ScanCard {
  total_picks: number;
  horizons: Record<string, HorizonMetric>;
}
interface ReportCardFile {
  generated_at: string | null;
  assumptions: Record<string, string>;
  history_range: { first_date: string; last_date: string; n_dates: number };
  scans: Record<string, ScanCard>;
}

const data = rawReportCard as unknown as ReportCardFile;

const SCAN_ORDER = ['sepa', 'kell', 'breakout', 'lekkung_growth', 'ppbp'];
const SCAN_LABELS: Record<string, string> = {
  sepa: 'SEPA',
  kell: 'Oliver Kell',
  breakout: 'Breakout',
  lekkung_growth: 'Lekkung Growth',
  ppbp: 'PPBP',
};
const SCAN_COLORS: Record<string, string> = {
  sepa: '#1D9E75',
  kell: '#378ADD',
  breakout: '#EF9F27',
  lekkung_growth: '#7F77DD',
  ppbp: '#E24B4A',
};
const HORIZONS = ['5', '10', '20'];

// Below this many history snapshot-dates, forward-return stats (especially
// D+10/D+20) are still thin — flag it rather than let a good/bad win rate
// look more reliable than it actually is yet.
const SHORT_HISTORY_THRESHOLD = 30;

function fmtPct(n: number | null, showSign = true): string {
  if (n == null) return '—';
  const sign = showSign && n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

function returnColor(n: number | null): string {
  if (n == null) return 'rgba(255,255,255,0.3)';
  if (n > 0) return '#1D9E75';
  if (n < 0) return '#E24B4A';
  return 'rgba(255,255,255,0.5)';
}

function TickerChip({ entry }: { entry: BestWorstEntry }) {
  return (
    <Link
      href={`/stock/${entry.ticker}`}
      className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.07] transition-colors"
    >
      <span className="text-[11.5px] font-semibold text-white/80">{entry.ticker}</span>
      <span className="text-[11px] font-medium tabular-nums" style={{ color: returnColor(entry.return_pct) }}>
        {fmtPct(entry.return_pct)}
      </span>
    </Link>
  );
}

function ScanSummaryCard({ scanKey, card }: { scanKey: string; card: ScanCard }) {
  const headline = card.horizons['5'];
  const color = SCAN_COLORS[scanKey] ?? '#7F77DD';

  return (
    <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-bold text-white">{SCAN_LABELS[scanKey] ?? scanKey}</h3>
        <span className="text-[10.5px] text-white/30 tabular-nums">{card.total_picks} picks สะสม</span>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider text-white/25 mb-1">Win Rate (D+5)</div>
        <div className="text-[32px] font-bold tabular-nums leading-none" style={{ color }}>
          {headline.win_rate_pct != null ? `${headline.win_rate_pct.toFixed(0)}%` : '—'}
        </div>
        <div className="text-[10.5px] text-white/25 mt-1">
          {headline.n > 0 ? `จาก ${headline.n} entries ที่ครบ D+5 แล้ว` : 'ยังไม่มี entry ที่ครบ D+5'}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 pt-1 border-t border-white/[0.06]">
        {HORIZONS.map(h => {
          const m = card.horizons[h];
          return (
            <div key={h} className="text-center">
              <div className="text-[9.5px] text-white/25 mb-1">D+{h}</div>
              <div className="text-[13px] font-semibold tabular-nums" style={{ color: returnColor(m.avg_return_pct) }}>
                {fmtPct(m.avg_return_pct)}
              </div>
              <div className="text-[9px] text-white/20 mt-0.5">
                {m.excess_return_pct != null ? `excess ${fmtPct(m.excess_return_pct)}` : 'excess —'}
              </div>
            </div>
          );
        })}
      </div>

      {(headline.best5.length > 0 || headline.worst5.length > 0) && (
        <div className="grid grid-cols-2 gap-3 pt-1 border-t border-white/[0.06]">
          <div>
            <div className="text-[9.5px] uppercase tracking-wider text-[#1D9E75]/70 mb-1.5">Best 5 (D+5)</div>
            <div className="space-y-1">
              {headline.best5.map(e => <TickerChip key={e.ticker + e.entry_date} entry={e} />)}
            </div>
          </div>
          <div>
            <div className="text-[9.5px] uppercase tracking-wider text-[#E24B4A]/70 mb-1.5">Worst 5 (D+5)</div>
            <div className="space-y-1">
              {headline.worst5.map(e => <TickerChip key={e.ticker + e.entry_date} entry={e} />)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ComparisonTable({ horizon }: { horizon: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left min-w-[560px]">
        <thead>
          <tr className="border-b border-white/[0.06]">
            <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-white/25">Scan</th>
            <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-white/25 text-right">n</th>
            <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-white/25 text-right">Avg Return</th>
            <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-white/25 text-right">Median</th>
            <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-white/25 text-right">Win Rate</th>
            <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-white/25 text-right">vs SET</th>
            <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-white/25 text-right">Excess</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.04]">
          {SCAN_ORDER.map(key => {
            const card = data.scans[key];
            if (!card) return null;
            const m = card.horizons[horizon];
            return (
              <tr key={key}>
                <td className="px-3 py-2.5 text-[12px] font-semibold" style={{ color: SCAN_COLORS[key] }}>
                  {SCAN_LABELS[key]}
                </td>
                <td className="px-3 py-2.5 text-[12px] text-white/50 text-right tabular-nums">{m.n}</td>
                <td className="px-3 py-2.5 text-[12px] text-right tabular-nums font-medium" style={{ color: returnColor(m.avg_return_pct) }}>
                  {fmtPct(m.avg_return_pct)}
                </td>
                <td className="px-3 py-2.5 text-[12px] text-white/60 text-right tabular-nums">{fmtPct(m.median_return_pct)}</td>
                <td className="px-3 py-2.5 text-[12px] text-white/60 text-right tabular-nums">
                  {m.win_rate_pct != null ? `${m.win_rate_pct.toFixed(0)}%` : '—'}
                </td>
                <td className="px-3 py-2.5 text-[12px] text-white/40 text-right tabular-nums">{fmtPct(m.avg_set_return_pct)}</td>
                <td className="px-3 py-2.5 text-[12px] text-right tabular-nums font-medium" style={{ color: returnColor(m.excess_return_pct) }}>
                  {fmtPct(m.excess_return_pct)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function ReportCardPage() {
  const isShortHistory = data.history_range.n_dates < SHORT_HISTORY_THRESHOLD;

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div>
        <h1 className="text-[18px] font-bold text-white">Report Card</h1>
        <p className="text-[12px] text-white/35 mt-0.5">
          ผลตอบแทนย้อนหลังของแต่ละ scan · ข้อมูล {data.history_range.first_date} ถึง {data.history_range.last_date} ({data.history_range.n_dates} วัน)
        </p>
      </div>

      {isShortHistory && (
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-[#EF9F27]/10 border border-[#EF9F27]/25 text-[12.5px] text-[#EF9F27]">
          <span className="flex-shrink-0 mt-0.5">⚠️</span>
          <span>
            ข้อมูลย้อนหลังยังสะสมได้แค่ {data.history_range.n_dates} วัน (เพิ่งเริ่มสะสม) — สถิติโดยเฉพาะ D+10/D+20 ยังไม่นิ่ง
            ตัวเลขจะแม่นยำขึ้นเรื่อยๆ เมื่อสะสมประวัติได้นานขึ้น
          </span>
        </div>
      )}

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {SCAN_ORDER.map(key => {
          const card = data.scans[key];
          if (!card) return null;
          return <ScanSummaryCard key={key} scanKey={key} card={card} />;
        })}
      </div>

      {/* ── Comparison tables per horizon ── */}
      <div className="bg-[#13161e] border border-white/[0.07] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/[0.06]">
          <h2 className="text-[13px] font-semibold text-white">เทียบทุก Scan</h2>
        </div>
        <div className="divide-y divide-white/[0.06]">
          {HORIZONS.map(h => (
            <div key={h} className="p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/30 mb-2 px-1">D+{h} วันทำการ</p>
              <ComparisonTable horizon={h} />
            </div>
          ))}
        </div>
      </div>

      {/* ── Assumptions & disclaimer ── */}
      <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-5 space-y-3">
        <h2 className="text-[12px] font-semibold text-white/70">หมายเหตุ</h2>
        <ul className="space-y-1.5">
          {Object.entries(data.assumptions).map(([key, text]) => (
            <li key={key} className="text-[11.5px] text-white/40 leading-relaxed flex items-start gap-2">
              <span className="text-white/20 flex-shrink-0">•</span>
              <span>{text}</span>
            </li>
          ))}
        </ul>
        <p className="text-[11.5px] text-white/50 font-medium pt-2 border-t border-white/[0.06]">
          ผลตอบแทนย้อนหลังไม่ได้การันตีผลลัพธ์ในอนาคต ใช้เพื่อประกอบการตัดสินใจเท่านั้น ไม่ใช่คำแนะนำการลงทุน
        </p>
        {data.generated_at && (
          <p className="text-[10px] text-white/20">คำนวณล่าสุด: {formatThaiDate(data.generated_at)}</p>
        )}
      </div>
    </div>
  );
}
