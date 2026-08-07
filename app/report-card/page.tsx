import Link from 'next/link';
import rawReportCard from '@/data/scans/report_card.json';
import { formatThaiDate } from '@/lib/utils';

interface HorizonMetric {
  n: number;
  avg_return_pct: number | null;
  median_return_pct: number | null;
  win_rate_pct: number | null;
  avg_set_return_pct: number | null;
  excess_return_pct: number | null;
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

const SCAN_ORDER = ['sepa', 'kell', 'breakout', 'lekkung_growth', 'ppbp', 'oneil'];
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
const HORIZONS = ['5', '10', '20'];

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

function winRateColor(winRate: number | null): string {
  if (winRate == null) return 'rgba(255,255,255,0.4)';
  if (winRate > 50) return '#1D9E75';
  if (winRate >= 45) return 'rgba(255,255,255,0.85)';
  return '#E24B4A';
}

function ScanSummaryCard({ scanKey, card }: { scanKey: string; card: ScanCard }) {
  const headline = card.horizons['5'];
  const winRate = headline?.win_rate_pct;
  const avgReturn = headline?.avg_return_pct;
  const color = winRateColor(winRate);
  const isSmallSample = headline?.n > 0 && headline.n < 30;

  return (
    <Link
      href={`/report-card/${scanKey}`}
      className="bg-[#13161e] border border-white/[0.07] hover:border-white/20 hover:bg-white/[0.025] rounded-xl p-4 transition-all block group"
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-[13px] font-bold text-white group-hover:text-[#378ADD] transition-colors truncate">
            {SCAN_LABELS[scanKey] ?? scanKey}
          </h3>
          {isSmallSample && (
            <span
              className="text-[9.5px] font-medium px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 flex-shrink-0"
              title={`ข้อมูลย้อนหลังที่ครบ D+5 มีเพียง ${headline.n} ตัว (< 30)`}
            >
              n={headline.n}
            </span>
          )}
        </div>
        <span className="text-[11px] text-white/30 tabular-nums flex-shrink-0">{card.total_picks} picks สะสม</span>
      </div>

      <div className="flex items-baseline gap-1.5 mb-2">
        <span className="text-[28px] font-bold tabular-nums leading-none" style={{ color }}>
          {winRate != null ? `${winRate.toFixed(0)}%` : '—'}
        </span>
        <span className="text-[12px] font-medium text-white/35">win rate</span>
      </div>

      <div className="w-full h-1.5 rounded-full bg-white/[0.06] overflow-hidden mb-3">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${Math.min(100, Math.max(0, winRate ?? 0))}%`, backgroundColor: color }}
        />
      </div>

      <div className="flex items-center justify-between text-[11.5px] pt-2 border-t border-white/[0.05]">
        <span className="text-white/35">D+5 avg return</span>
        <span className="font-semibold tabular-nums" style={{ color: returnColor(avgReturn) }}>
          {fmtPct(avgReturn)}
        </span>
      </div>
    </Link>
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
            <th
              className="px-3 py-2 text-label font-semibold text-white/25 text-right"
              title="ผลตอบแทนของดัชนี SET ในช่วง D+1 ถึง D+N เดียวกันกับที่ scan ถืออยู่"
            >
              SET ช่วงเดียวกัน
            </th>
            <th
              className="px-3 py-2 text-label font-semibold text-white/25 text-right"
              title="ส่วนต่าง = ผลตอบแทนเฉลี่ยของ scan ลบผลตอบแทนของ SET ช่วงเดียวกัน — ค่าบวกแปลว่า scan นี้ชนะตลาดจริง"
            >
              ส่วนต่าง
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.04]">
          {SCAN_ORDER.map(key => {
            const card = data.scans[key];
            if (!card) return null;
            const m = card.horizons[horizon];
            const isSmallSample = m.n > 0 && m.n < 30;
            return (
              <tr key={key}>
                <td className="px-3 py-2.5 text-[12px] font-semibold" style={{ color: SCAN_COLORS[key] }}>
                  <span className="inline-flex items-center gap-1.5">
                    {SCAN_LABELS[key]}
                    {isSmallSample && (
                      <span
                        className="text-[9px] font-normal px-1 py-0.2 rounded bg-amber-500/10 text-amber-400/90 border border-amber-500/20"
                        title={`sample น้อย (n = ${m.n} < 30)`}
                      >
                        sample น้อย
                      </span>
                    )}
                  </span>
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
        <p className="text-label text-meta mt-0.5">
          ผลตอบแทนย้อนหลังของแต่ละ scan · ข้อมูล {data.history_range.first_date} ถึง {data.history_range.last_date} ({data.history_range.n_dates} วัน)
        </p>
      </div>

      <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-4 space-y-2">
        <p className="text-body text-ink leading-relaxed">
          หน้านี้วัดว่า &ldquo;ถ้าซื้อหุ้นทุกตัวที่ scan เจอ ตามราคาปิดของวันทำการถัดไป แล้วถือไว้ 5 / 10 / 20 วันทำการ
          จะได้ผลตอบแทนเฉลี่ยเท่าไหร่ และเทียบกับดัชนี SET ในช่วงเวลาเดียวกันแล้วชนะหรือแพ้&rdquo;
        </p>
        <p className="text-label text-white/45 leading-relaxed">
          วิธีอ่าน: เทียบ &ldquo;ส่วนต่าง&rdquo; (ไม่ใช่แค่ผลตอบแทนเฉลี่ยเฉยๆ) ว่า scan ไหนเอาชนะตลาดได้จริง — ถ้า Win Rate สูง
          แต่ส่วนต่างติดลบ แปลว่า scan นั้นให้กำไรบ่อยก็จริง แต่กำไรน้อยกว่าที่ถือดัชนี SET เฉยๆ เสียอีก (ตลาดโดยรวมช่วงนั้นวิ่งดีกว่า)
          ควรดูทั้งสองตัวเลขคู่กันเสมอ
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

      {/* ── Slim Option A Summary cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
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
              <p className="text-label font-semibold text-white/30 mb-2 px-1">D+{h} วันทำการ</p>
              <ComparisonTable horizon={h} />
            </div>
          ))}
        </div>
      </div>

      {/* ── Assumptions & disclaimer ── */}
      <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-5 space-y-3">
        <h2 className="text-label font-semibold text-white/70">หมายเหตุ</h2>
        <ul className="space-y-1.5">
          {Object.entries(data.assumptions).map(([key, text]) => (
            <li key={key} className="text-label text-white/40 leading-relaxed flex items-start gap-2">
              <span className="text-white/20 flex-shrink-0">•</span>
              <span>{text}</span>
            </li>
          ))}
        </ul>
        <p className="text-label text-white/50 font-medium pt-2 border-t border-white/[0.06]">
          ผลตอบแทนย้อนหลังไม่ได้การันตีผลลัพธ์ในอนาคต ใช้เพื่อประกอบการตัดสินใจเท่านั้น ไม่ใช่คำแนะนำการลงทุน
        </p>
        {data.generated_at && (
          <p className="text-label text-white/20">คำนวณล่าสุด: {formatThaiDate(data.generated_at)}</p>
        )}
      </div>
    </div>
  );
}
