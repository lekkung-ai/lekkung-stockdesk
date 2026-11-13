import Link from 'next/link';
import rawReportCard from '@/data/scans/report_card.json';
import { formatThaiDate } from '@/lib/utils';
import { TS, READABLE } from '@/lib/typeScale';
import HorizonSpark from '@/components/reportCard/HorizonSpark';
import {
  NEUTRAL,
  ReportCardFile,
  SCAN_COLORS,
  SCAN_LABELS,
  SCAN_ORDER,
  ScanReport,
  fmtInt,
  fmtPct,
  isNum,
  returnColor,
} from '@/lib/reportCard';

const data = rawReportCard as unknown as ReportCardFile;

const HORIZONS = ['5', '10', '20'];

const SHORT_HISTORY_THRESHOLD = 30;

function Measure({ kind }: { kind: 'setup' | 'dn' }) {
  return (
    <span className={`${TS.caption} font-medium px-1.5 py-0.5 rounded border border-white/[0.1] bg-white/[0.04] text-white/55 whitespace-nowrap`}>
      {kind === 'setup' ? 'ตามไม้' : 'D+N'}
    </span>
  );
}

function CardStat({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[22px] font-bold tabular-nums leading-tight" style={{ color }}>{value}</div>
      <div className={`${TS.caption} text-white/45 mt-0.5`}>{label}</div>
    </div>
  );
}

function ScanSummaryCard({ scanKey, card }: { scanKey: string; card: ScanReport }) {
  const sum = card.setup_summary;
  const d5 = card.horizons['5'];
  const color = SCAN_COLORS[scanKey] ?? '#7F77DD';
  const hasD5 = d5 && d5.n > 0;
  const isSmallSample = sum != null && sum.n_closed > 0 && sum.n_closed < 30;

  return (
    <Link
      href={`/report-card/${scanKey}`}
      className="bg-[#13161e] border border-white/[0.07] hover:border-white/20 hover:bg-white/[0.025] rounded-xl p-4 transition-all block group border-t-[3px]"
      style={{ borderTopColor: color }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className={`${TS.sectionTitle} text-white group-hover:text-[#378ADD] transition-colors truncate`}>
            {SCAN_LABELS[scanKey] ?? scanKey}
          </h3>
          <p className={`${TS.caption} text-white/45 mt-0.5 tabular-nums`}>
            {sum ? <>{fmtInt(sum.n_closed)} ไม้ที่ปิดแล้ว · ยังถือ {fmtInt(sum.n_open)}</> : <>{fmtInt(card.total_picks)} picks สะสม</>}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {isSmallSample && (
            <span
              className={`${TS.caption} font-medium px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20`}
              title={`ไม้ที่ปิดแล้วมีเพียง ${sum!.n_closed} ไม้ (< 30) ตัวเลขยังไม่นิ่ง`}
            >
              ไม้น้อย
            </span>
          )}
          <Measure kind="setup" />
        </div>
      </div>

      {sum && (
        <div className="grid grid-cols-3 gap-3 mt-3.5">
          <CardStat value={fmtPct(sum.avg_return_pct)} label="ผลเฉลี่ยต่อไม้" color={returnColor(sum.avg_return_pct)} />
          <CardStat value={isNum(sum.win_rate_pct) ? `${sum.win_rate_pct.toFixed(0)}%` : '—'} label="ไม้ที่กำไร" color={NEUTRAL} />
          <CardStat value={isNum(sum.payoff_ratio) ? sum.payoff_ratio.toFixed(2) : '—'} label="ได้ ÷ เสีย ต่อไม้" color={NEUTRAL} />
        </div>
      )}

      {hasD5 && (
        <div className="flex items-center justify-between gap-3 mt-3.5 pt-3 border-t border-white/[0.06]">
          <div className={`${TS.body} text-white/55 min-w-0`}>
            <div className="whitespace-nowrap">
              ชนะ SET ที่ D+5{' '}
              <b className="tabular-nums" style={{ color: returnColor(d5.excess_return_pct) }}>{fmtPct(d5.excess_return_pct)}</b>
            </div>
            <div className={`${TS.caption} text-white/40 mt-1 flex items-center gap-1.5 whitespace-nowrap`}>
              <Measure kind="dn" /> ถือตายตัว
            </div>
          </div>
          <HorizonSpark horizons={card.horizons} color={color} />
        </div>
      )}
    </Link>
  );
}

function ComparisonTable({ horizon }: { horizon: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left min-w-[620px] table-fixed">
        <colgroup>
          <col style={{ width: '21%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '13%' }} />
          <col style={{ width: '11%' }} />
          <col style={{ width: '11%' }} />
          <col style={{ width: '9%' }} />
          <col style={{ width: '14%' }} />
          <col style={{ width: '13%' }} />
        </colgroup>
        <thead>
          <tr className="border-b border-white/[0.06]">
            <th className={`px-3 py-2 ${TS.body} font-semibold uppercase tracking-wider text-white/25`}>Scan</th>
            <th className={`px-3 py-2 ${TS.body} font-semibold uppercase tracking-wider text-white/25 text-right`}>n</th>
            <th className={`px-3 py-2 ${TS.body} font-semibold uppercase tracking-wider text-white/25 text-right`}>Avg Return</th>
            <th className={`px-3 py-2 ${TS.body} font-semibold uppercase tracking-wider text-white/25 text-right`}>Median</th>
            <th className={`px-3 py-2 ${TS.body} font-semibold uppercase tracking-wider text-white/25 text-right`}>Win Rate</th>
            <th
              className={`px-3 py-2 ${TS.body} font-semibold text-white/25 text-right`}
              title="สัดส่วนรายการที่ราคาออกเท่ากับราคาเข้า (ผลตอบแทน 0%)"
            >
              เสมอ
            </th>
            <th
              className={`px-3 py-2 ${TS.body} font-semibold text-white/25 text-right`}
              title="ผลตอบแทนของดัชนี SET ในช่วง D+1 ถึง D+N เดียวกันกับที่ scan ถืออยู่"
            >
              SET ช่วงเดียวกัน
            </th>
            <th
              className={`px-3 py-2 ${TS.body} font-semibold text-white/25 text-right`}
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
            if (!m) return null;
            const isSmallSample = m.n > 0 && m.n < 30;
            return (
              <tr key={key}>
                <td className={`px-3 py-2.5 ${TS.tableCell} font-semibold whitespace-nowrap`} style={{ color: SCAN_COLORS[key] }}>
                  <span className="inline-flex items-center gap-1.5">
                    {SCAN_LABELS[key]}
                    {isSmallSample && (
                      <span
                        className="text-[10px] font-normal px-1 py-0.2 rounded bg-amber-500/10 text-amber-400/90 border border-amber-500/20"
                        title={`sample น้อย (n = ${m.n} < 30)`}
                      >
                        sample น้อย
                      </span>
                    )}
                  </span>
                </td>
                <td className={`px-3 py-2.5 ${TS.tableCell} text-white/50 text-right tabular-nums`}>{m.n}</td>
                <td className={`px-3 py-2.5 ${TS.tableCell} text-right tabular-nums font-medium`} style={{ color: returnColor(m.avg_return_pct) }}>
                  {fmtPct(m.avg_return_pct)}
                </td>
                <td className={`px-3 py-2.5 ${TS.tableCell} text-white/60 text-right tabular-nums`}>{fmtPct(m.median_return_pct)}</td>
                <td className={`px-3 py-2.5 ${TS.tableCell} text-white/60 text-right tabular-nums`}>
                  {m.win_rate_pct != null ? `${m.win_rate_pct.toFixed(0)}%` : '—'}
                </td>
                <td className={`px-3 py-2.5 ${TS.tableCell} text-white/40 text-right tabular-nums`}>
                  {m.flat_pct != null ? `${m.flat_pct.toFixed(0)}%` : '—'}
                </td>
                <td className={`px-3 py-2.5 ${TS.tableCell} text-white/40 text-right tabular-nums`}>{fmtPct(m.avg_set_return_pct)}</td>
                <td className={`px-3 py-2.5 ${TS.tableCell} text-right tabular-nums font-medium`} style={{ color: returnColor(m.excess_return_pct) }}>
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
  // the days the scans really have data (history_range counts every snapshot folder, from 1 Jan)
  const scanFirst = data.scan_range?.first_date ?? data.history_range.first_date;
  const scanLast = data.scan_range?.last_date ?? data.history_range.last_date;

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div>
        <h1 className={`${TS.pageTitle} text-white`}>Report Card</h1>
        <p className={`${TS.tableCell} text-white/75 mt-1 ${READABLE}`}>
          ผลย้อนหลังของแต่ละสแกน ถ้าซื้อทุกตัวที่สแกนเจอ ตัวเลขบนการ์ดนับ <b className="text-white">ตามไม้</b>{' '}
          (ซื้อวันถัดจากติดสแกน ขายวันที่หลุดสแกนครบ 5 วันทำการ) สีเขียว/แดงใช้กับผลตอบแทนเท่านั้น
        </p>
        <p className={`${TS.body} text-meta mt-1`}>
          ข้อมูลสแกน {scanFirst} ถึง {scanLast}
        </p>
      </div>

      {isShortHistory && (
        <div className={`flex items-start gap-2.5 px-4 py-3 rounded-xl bg-[#EF9F27]/10 border border-[#EF9F27]/25 ${TS.body} text-[#EF9F27]`}>
          <span className="flex-shrink-0 mt-0.5">⚠️</span>
          <span>
            ข้อมูลย้อนหลังยังสะสมได้แค่ {data.history_range.n_dates} วัน (เพิ่งเริ่มสะสม) — สถิติโดยเฉพาะ D+10/D+20 ยังไม่นิ่ง
            ตัวเลขจะแม่นยำขึ้นเรื่อยๆ เมื่อสะสมประวัติได้นานขึ้น
          </span>
        </div>
      )}

      {/* ── Scan cards (ตามไม้) ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {SCAN_ORDER.map(key => {
          const card = data.scans[key];
          if (!card) return null;
          return <ScanSummaryCard key={key} scanKey={key} card={card} />;
        })}
      </div>
      <p className={`${TS.body} text-white/45 leading-relaxed ${READABLE}`}>
        &ldquo;ได้ ÷ เสีย&rdquo; = กำไรเฉลี่ยของไม้ที่ชนะ ÷ ขาดทุนเฉลี่ยของไม้ที่แพ้ ถ้ามากกว่า 1 แปลว่าชนะทีได้มากกว่าแพ้ทีเสีย win rate ต่ำก็ยังคุ้มได้
        · เส้นเล็กมุมขวา = ผลเฉลี่ยถ้าถือตายตัว 5 / 10 / 20 วันทำการ (วิธีวัดแบบ D+N) · กดการ์ดเพื่อดูรายละเอียดของสแกนนั้น
      </p>

      <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-4 space-y-2">
        <p className={`${TS.tableCell} font-semibold text-ink leading-relaxed ${READABLE}`}>
          หน้านี้วัดว่า &ldquo;ถ้าซื้อหุ้นทุกตัวที่ scan เจอ ตามราคาปิดของวันทำการถัดไป แล้วถือไว้ 5 / 10 / 20 วันทำการ
          จะได้ผลตอบแทนเฉลี่ยเท่าไหร่ และเทียบกับดัชนี SET ในช่วงเวลาเดียวกันแล้วชนะหรือแพ้&rdquo;
        </p>
        <p className={`${TS.body} text-white/45 leading-relaxed ${READABLE}`}>
          วิธีอ่าน: เทียบ &ldquo;ส่วนต่าง&rdquo; (ไม่ใช่แค่ผลตอบแทนเฉลี่ยเฉยๆ) ว่า scan ไหนเอาชนะตลาดได้จริง — ถ้า Win Rate สูง
          แต่ส่วนต่างติดลบ แปลว่า scan นั้นให้กำไรบ่อยก็จริง แต่กำไรน้อยกว่าที่ถือดัชนี SET เฉยๆ เสียอีก (ตลาดโดยรวมช่วงนั้นวิ่งดีกว่า)
          ควรดูทั้งสองตัวเลขคู่กันเสมอ
        </p>
        <p className={`${TS.body} text-white/35 leading-relaxed ${READABLE}`}>
          หุ้นไทยขยับทีละช่องราคา จึงมีกรณีราคาเท่าเดิมบ่อย · ค่ากลาง (median) จึงมักเป็น 0
        </p>
      </div>

      {/* ── Comparison tables per horizon (D+N) ── */}
      <div className="bg-[#13161e] border border-white/[0.07] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/[0.06]">
          <h2 className={`${TS.sectionTitle} text-white flex items-center gap-2`}>
            เทียบทุก Scan <Measure kind="dn" />
          </h2>
        </div>
        <div className="divide-y divide-white/[0.06]">
          {HORIZONS.map(h => (
            <div key={h} className="p-4">
              <p className={`${TS.body} font-bold text-white/40 mb-2 px-1`}>D+{h} วันทำการ</p>
              <ComparisonTable horizon={h} />
            </div>
          ))}
        </div>
      </div>

      {/* ── Assumptions & disclaimer ── */}
      <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-5 space-y-3">
        <h2 className={`${TS.sectionTitle} text-white/70`}>หมายเหตุ</h2>
        <ul className="space-y-1.5">
          {Object.entries(data.assumptions).map(([key, text]) => (
            <li key={key} className={`${TS.body} text-white/40 leading-relaxed flex items-start gap-2 ${READABLE}`}>
              <span className="text-white/20 flex-shrink-0">•</span>
              <span>{text}</span>
            </li>
          ))}
        </ul>
        <p className={`${TS.body} text-white/50 font-medium pt-2 border-t border-white/[0.06] ${READABLE}`}>
          ผลตอบแทนย้อนหลังไม่ได้การันตีผลลัพธ์ในอนาคต ใช้เพื่อประกอบการตัดสินใจเท่านั้น ไม่ใช่คำแนะนำการลงทุน
        </p>
        {data.generated_at && (
          <p className={`${TS.body} text-white/20`}>คำนวณล่าสุด: {formatThaiDate(data.generated_at)}</p>
        )}
      </div>
    </div>
  );
}
