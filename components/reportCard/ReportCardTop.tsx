// Top of /report-card/[scan] (2026-11 redesign, mockups/report_card_top_mock.html):
// สรุปผล → 3 คำถาม → ตอนนี้ถืออะไร / ปิดไม้แล้วได้ผลยังไง → ถ้าเปลี่ยนวิธีขาย → วิธีวัด.
// Layout and wording follow the mock; colours, fonts and sizes are the site's own.
import React from 'react';
import Link from 'next/link';
import { TS, READABLE } from '@/lib/typeScale';
import { stageCls } from '@/components/StrategyTable';
import {
  ClosedBrief,
  FLAT_COLOR,
  GIVEBACK_MFE_DEFAULT,
  MonthRow,
  NEG,
  POS,
  ScanReport,
  SetupEntry,
  SetupSummary,
  fmtInt,
  fmtMonth,
  fmtPct,
  fmtShortDate,
  isNum,
  openDaysOut,
  returnColor,
} from '@/lib/reportCard';
import { GRADE_LABEL, GRADE_RULES, Grade, ScanGrade, gradeScan, verdictFor, whatIfLines } from '@/lib/reportCardGrade';

const CARD = 'bg-[#13161e] border border-white/[0.07] rounded-xl';
const AMBER = '#EF9F27';
const SUB = `${TS.caption} text-white/45`;

const GRADE_CLS: Record<Grade, string> = {
  g: 'bg-[#1D9E75]/15 text-[#3fd39b] border-[#1D9E75]/35',
  m: 'bg-[#EF9F27]/12 text-[#f3b555] border-[#EF9F27]/35',
  b: 'bg-[#E24B4A]/12 text-[#f07a79] border-[#E24B4A]/35',
};

function GradeBadge({ g }: { g: Grade }) {
  return (
    <span className={`${TS.caption} font-semibold px-2.5 py-0.5 rounded-full border whitespace-nowrap ${GRADE_CLS[g]}`}>{GRADE_LABEL[g]}</span>
  );
}

const Num = ({ v, digits = 2, className = '' }: { v: number | null | undefined; digits?: number; className?: string }) => (
  <span className={`tabular-nums ${className}`} style={{ color: returnColor(v) }}>{fmtPct(v, digits)}</span>
);

/* ---------- 2. สรุปผล ---------- */

function MonthBars({ months }: { months: MonthRow[] }) {
  const rows = months.filter(m => isNum(m.avg_return_pct));
  if (rows.length === 0) return null;
  const W = 330;
  const H = 112;
  const mid = 50;
  const mx = Math.max(0.5, ...rows.map(m => Math.abs(m.avg_return_pct!)));
  const bw = (W - 10) / rows.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full h-auto" role="img" aria-label="ผลเฉลี่ยต่อไม้ รายเดือน">
      <line x1={0} x2={W} y1={mid} y2={mid} stroke="rgba(255,255,255,0.18)" />
      {rows.map((m, i) => {
        const v = m.avg_return_pct!;
        const h = Math.max(2, (Math.abs(v) / mx) * 30);
        const x = 5 + i * bw;
        const faint = m.n < GRADE_RULES.monthFaintN;
        return (
          <g key={m.month}>
            <rect x={x + bw * 0.2} y={v >= 0 ? mid - h : mid} width={bw * 0.6} height={h} rx={2} fill={v >= 0 ? POS : NEG} fillOpacity={faint ? 0.35 : 0.9}>
              <title>{`${fmtMonth(m.month)} · ${m.n} ไม้ · ${fmtPct(v)}`}</title>
            </rect>
            <text x={x + bw / 2} y={v >= 0 ? mid - h - 4 : mid + h + 12} fontSize={11} fill="rgba(255,255,255,0.7)" textAnchor="middle">
              {fmtPct(v, 1)}
            </text>
            <text x={x + bw / 2} y={H - 2} fontSize={10.5} fill="rgba(255,255,255,0.45)" textAnchor="middle">
              {fmtMonth(m.month)} · {m.n}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function VerdictPanel({ scan, sum, g, color }: { scan: ScanReport; sum: SetupSummary; g: ScanGrade; color: string }) {
  const v = verdictFor(scan, g);
  return (
    <div className={`${CARD} p-5 border-l-[3px] grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_330px] gap-6 items-center`} style={{ borderLeftColor: color }}>
      <div className="min-w-0">
        <div className={SUB}>สรุปผล</div>
        <p className={`text-[19px] sm:text-[21px] font-bold text-white leading-snug mt-1 mb-2 max-w-[62ch]`}>{v.head}</p>
        <p className={`${TS.body} text-white/65 leading-relaxed ${READABLE}`}>{v.why}</p>
        {v.smallSample && (
          <span className={`inline-block mt-2.5 ${TS.caption} px-2.5 py-0.5 rounded-full border border-[#EF9F27]/45 text-[#EF9F27]`}>
            ตัวอย่างน้อย: {fmtInt(sum.n_closed)} ไม้ ตัวเลขยังเชื่อถือได้จำกัด
          </span>
        )}
      </div>
      {Array.isArray(sum.monthly) && sum.monthly.length > 0 && (
        <div className="min-w-0">
          <div className={`${SUB} mb-1.5`}>
            ผลเฉลี่ยต่อไม้ รายเดือน <span className="text-white/30">(เดือนที่เข้า · จำนวนไม้)</span>
          </div>
          <MonthBars months={sum.monthly} />
        </div>
      )}
    </div>
  );
}

/* ---------- 3. สามคำถาม ---------- */

function QCard({ n, title, grade, children }: { n: number; title: string; grade: Grade; children: React.ReactNode }) {
  return (
    <div className={`${CARD} p-5 min-w-0`}>
      <div className="flex items-start justify-between gap-2.5">
        <div>
          <div className={`${TS.caption} text-white/30 font-semibold tracking-wide`}>{n}</div>
          <h2 className={`${TS.sectionTitle} text-white`}>{title}</h2>
        </div>
        <GradeBadge g={grade} />
      </div>
      {children}
    </div>
  );
}

const Big = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[26px] sm:text-[28px] font-bold leading-tight mt-3 tabular-nums">{children}</div>
);
const Say = ({ children }: { children: React.ReactNode }) => (
  <p className={`${TS.body} text-white/60 leading-relaxed mt-2.5`}>{children}</p>
);

function PickCard({ scan, g }: { scan: ScanReport; g: ScanGrade }) {
  const total = g.excess.length;
  return (
    <QCard n={1} title="เลือกหุ้นถูกไหม" grade={g.pick}>
      <Big>
        <span className="text-white text-[22px] sm:text-[24px]">
          {total === 0 ? 'ยังไม่มีข้อมูล' : g.nUp === total ? 'ชนะ SET ทุกระยะ' : `ชนะ SET ${g.nUp} จาก ${total} ระยะ`}
        </span>
      </Big>
      <div className="grid grid-cols-3 gap-2 mt-3.5">
        {GRADE_RULES.horizons.map(h => {
          const m = scan.horizons[h];
          if (!m || !isNum(m.excess_return_pct)) return <div key={h} />;
          return (
            <div key={h} className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-2.5 py-2 min-w-0">
              <div className={`${TS.caption} text-white/45`}>ถือ {h} วัน</div>
              <div className="text-[16px] font-bold"><Num v={m.excess_return_pct} /></div>
              <div className={`${TS.caption} text-white/40 tabular-nums leading-tight mt-0.5`}>
                สแกน {fmtPct(m.avg_return_pct)}
                <br />
                SET {fmtPct(m.avg_set_return_pct)}
              </div>
            </div>
          );
        })}
      </div>
      <Say>
        ตัวเลขใหญ่ = ผลของหุ้นที่สแกนเลือก <b className="text-white">ลบ</b> ผลของ SET ในช่วงเดียวกัน ถ้าบวก แปลว่าหุ้นที่สแกนหยิบมาแข็งกว่าตลาดจริง
      </Say>
    </QCard>
  );
}

function ProfitCard({ sum, g }: { sum: SetupSummary; g: ScanGrade }) {
  const n = sum.n_closed;
  const nW = sum.n_win ?? 0;
  const nF = sum.n_flat ?? 0;
  const nL = sum.n_loss ?? 0;
  const be = g.breakEven;
  const ws = g.winShare;
  const ok = be != null && ws != null && ws >= be;
  return (
    <QCard n={2} title="ถือตามสแกนแล้วได้กำไรไหม" grade={g.profit}>
      <Big>
        <Num v={sum.avg_return_pct} />
        <span className={`${TS.body} font-normal text-white/45 ml-2`}>เฉลี่ยต่อไม้</span>
      </Big>
      {n > 0 && (
        <>
          <div className="flex h-2 rounded-full overflow-hidden mt-3.5 bg-white/[0.06]" aria-hidden="true">
            <i style={{ width: `${(nW / n) * 100}%`, background: POS }} />
            <i style={{ width: `${(nF / n) * 100}%`, background: FLAT_COLOR }} />
            <i style={{ width: `${(nL / n) * 100}%`, background: NEG }} />
          </div>
          <div className={`flex justify-between flex-wrap gap-x-3 gap-y-1 mt-1.5 ${TS.caption} text-white/50`}>
            <span>กำไร <b className="tabular-nums" style={{ color: POS }}>{fmtInt(nW)}</b></span>
            <span>เสมอ <b className="tabular-nums text-white/75">{fmtInt(nF)}</b></span>
            <span>ขาดทุน <b className="tabular-nums" style={{ color: NEG }}>{fmtInt(nL)}</b></span>
          </div>
        </>
      )}
      {(sum.n_excluded_outlier ?? 0) > 0 && (
        <p className={`${TS.caption} text-white/40 mt-2.5`}>
          ไม่นับ {fmtInt(sum.n_excluded_outlier!)} ไม้ผิดปกติ
          {sum.excluded_outliers?.length ? ` เช่น ${sum.excluded_outliers.slice(0, 2).map(o => o.ticker).join(', ')}` : ''}
          {' '}(ผลเกิน ±40% และมีวันไม่มีการซื้อขายระหว่างถือ)
        </p>
      )}
      {be != null && ws != null && (
        <>
          <div className="relative h-7 mt-5" aria-hidden="true">
            <div className="absolute inset-x-0 top-[10px] h-2 rounded-full bg-white/[0.06]" />
            <div className="absolute left-0 top-[10px] h-2 rounded-full" style={{ width: `${Math.min(100, ws)}%`, background: ok ? POS : AMBER }} />
            <div className="absolute top-[3px] w-0.5 h-[22px] bg-white" style={{ left: `${be}%` }} />
            <div className={`absolute -top-3 -translate-x-1/2 ${TS.caption} text-white/65 whitespace-nowrap`} style={{ left: `${Math.min(85, Math.max(15, be))}%` }}>
              ต้องชนะ {Math.round(be)}%
            </div>
          </div>
          <Say>
            ชนะทีได้ <b className="tabular-nums" style={{ color: POS }}>{fmtPct(sum.avg_win_pct)}</b> แพ้ทีเสีย{' '}
            <b className="tabular-nums" style={{ color: NEG }}>{fmtPct(sum.avg_loss_pct)}</b> จึงต้องชนะอย่างน้อย{' '}
            <b className="text-white">{Math.round(be)}%</b> ของไม้ที่มีผลถึงจะคุ้มทุน ตอนนี้ชนะ{' '}
            <b style={{ color: ok ? POS : AMBER }}>{Math.round(ws)}%</b>
          </Say>
        </>
      )}
    </QCard>
  );
}

function ExitCard({ sum, g }: { sum: SetupSummary; g: ScanGrade }) {
  const mae = sum.avg_mae_pct;
  const avg = sum.avg_return_pct;
  const mfe = sum.avg_mfe_pct;
  const line = sum.giveback_mfe_pct ?? GIVEBACK_MFE_DEFAULT;
  const has = isNum(mae) && isNum(avg) && isNum(mfe);
  let P = (x: number) => x;
  if (has) {
    const lo = Math.min(mae, avg, -0.5);
    const hi = Math.max(mfe, avg, 0.5);
    const pad = (hi - lo) * 0.14;
    P = (x: number) => ((x - (lo - pad)) / (hi + pad - (lo - pad))) * 100;
  }
  return (
    <QCard n={3} title="ขายถูกจังหวะไหม" grade={g.exit}>
      <Big>
        <Num v={mfe} /> <span className="text-white/35 text-[20px]">→</span> <Num v={avg} />
      </Big>
      <div className={SUB}>ขึ้นสูงสุดเฉลี่ยระหว่างถือ → ผลตอนขายจริง</div>
      {has && (
        <div className="relative h-11 mt-5" aria-hidden="true">
          <div className="absolute inset-x-0 top-[25px] h-0.5 bg-white/[0.14]" />
          <div className="absolute top-5 h-3 rounded-md" style={{ left: `${P(mae)}%`, width: `${P(0) - P(mae)}%`, background: 'rgba(226,75,74,0.3)' }} />
          <div className="absolute top-5 h-3 rounded-md" style={{ left: `${P(0)}%`, width: `${P(mfe) - P(0)}%`, background: 'rgba(29,158,117,0.3)' }} />
          <div className="absolute top-3.5 w-px h-6 bg-white/30" style={{ left: `${P(0)}%` }} />
          {[
            { x: mae, label: fmtPct(mae, 1), dot: NEG, color: NEG },
            { x: avg, label: 'ขาย', dot: '#fff', color: '#fff' },
            { x: mfe, label: fmtPct(mfe, 1), dot: POS, color: POS },
          ].map(p => (
            <div key={p.label} className={`absolute top-0 -translate-x-1/2 text-center ${TS.caption} whitespace-nowrap tabular-nums`} style={{ left: `${P(p.x)}%`, color: p.color }}>
              {p.label}
              <i className="block w-[11px] h-[11px] rounded-full mx-auto mt-2 border-2 border-[#13161e]" style={{ background: p.dot }} />
            </div>
          ))}
        </div>
      )}
      {isNum(sum.giveback_n) && (
        <Say>
          <b className="text-white tabular-nums">{fmtInt(sum.giveback_n)}</b> จาก {fmtInt(sum.n_closed)} ไม้ เคยกำไรเกิน +{line}% แต่ขายเท่าทุนหรือขาดทุน
        </Say>
      )}
    </QCard>
  );
}

/* ---------- 4. ตอนนี้ถืออะไร / ปิดไม้แล้วได้ผลยังไง ---------- */

function Stat({ value, label, color }: { value: React.ReactNode; label: string; color?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[22px] font-bold leading-tight tabular-nums" style={color ? { color } : undefined}>{value}</div>
      <div className={SUB}>{label}</div>
    </div>
  );
}

const TH = `px-2 py-2 ${TS.caption} font-semibold text-white/40 whitespace-nowrap text-right first:text-left first:pl-0`;
const TD = `px-2 py-2 ${TS.body} tabular-nums text-right whitespace-nowrap first:text-left first:pl-0`;

function Ticker({ t }: { t: string }) {
  return (
    <Link href={`/stock/${t}`} className="font-bold text-white hover:text-emerald-400 transition-colors">{t}</Link>
  );
}

function StageDot({ stage }: { stage?: string | null }) {
  if (!stage) return <span className="text-white/25">—</span>;
  return <span className={`px-1.5 py-0.5 rounded ${TS.caption} whitespace-nowrap ${stageCls(stage === 'ไม่มีข้อมูล' ? null : stage)}`}>{stage}</span>;
}

function HoldingNow({ setups, nOpen }: { setups: SetupEntry[]; nOpen: number }) {
  const open = setups.filter(s => s.status === 'open');
  const inScan = open.filter(s => openDaysOut(s) === 0).sort((a, b) => b.return_pct - a.return_pct);
  const pending = open.filter(s => openDaysOut(s) > 0).sort((a, b) => b.return_pct - a.return_pct);
  const avg = inScan.length ? inScan.reduce((a, s) => a + s.return_pct, 0) / inScan.length : null;
  const tr = (s: SetupEntry, last: React.ReactNode) => (
    <tr key={`${s.ticker}-${s.entry_date}`} className="border-b border-white/[0.05]">
      <td className={TD}><Ticker t={s.ticker} /></td>
      <td className={TD}>{fmtShortDate(s.entry_date)}</td>
      <td className={TD}>{s.holding_days}</td>
      <td className={TD}><Num v={s.return_pct} /></td>
      <td className={`${TD} hidden sm:table-cell`}>{last}</td>
    </tr>
  );
  return (
    <div className={`${CARD} p-5 min-w-0`}>
      <h2 className={`${TS.sectionTitle} text-white`}>ตอนนี้ถืออะไรอยู่</h2>
      <div className="flex flex-wrap items-end gap-x-7 gap-y-2 mt-2">
        <Stat value={fmtInt(inScan.length)} label="ไม้ที่ยังอยู่ในสแกน" />
        <Stat value={avg == null ? '—' : fmtPct(avg)} label="ผลเฉลี่ย ณ ราคาล่าสุด" color={returnColor(avg)} />
        <Stat value={fmtInt(pending.length)} label="หลุดสแกนยังไม่ถึง 5 วัน" color={AMBER} />
      </div>
      {nOpen === 0 ? (
        <p className={`${TS.body} text-white/40 mt-4`}>ตอนนี้ไม่มีไม้ที่ยังถือ</p>
      ) : (
        <div className="overflow-x-auto mt-2.5">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.07]">
                <th className={TH}>หุ้น</th><th className={TH}>เข้า</th><th className={TH}>ถือ (วัน)</th><th className={TH}>ผลตอนนี้</th>
                <th className={`${TH} hidden sm:table-cell`}>stage ตอนเข้า</th>
              </tr>
            </thead>
            <tbody>
              {inScan.slice(0, 5).map(s => tr(s, <StageDot stage={s.stage_at_entry} />))}
              {inScan.length > 5 && (
                <tr><td colSpan={5} className={`${TD} !text-left text-white/45`}>และอีก {fmtInt(inScan.length - 5)} ไม้ ดูทั้งหมดในตารางด้านล่าง</td></tr>
              )}
              {pending.length > 0 && (
                <tr>
                  <td colSpan={5} className={`pt-3.5 pb-1.5 ${TS.caption} text-white/50 whitespace-normal`}>
                    หลุดสแกนยังไม่ถึง 5 วัน · ยังไม่นับว่าปิดไม้ จนกว่าจะหลุดครบ 5 วันทำการ
                  </td>
                </tr>
              )}
              {pending.slice(0, 5).map(s =>
                tr(s, <span className={`${TS.caption} px-2 py-0.5 rounded-full border border-[#EF9F27]/45 text-[#f3b555] whitespace-nowrap`}>หลุดมา {openDaysOut(s)} วัน</span>),
              )}
              {pending.length > 5 && (
                <tr><td colSpan={5} className={`${TD} !text-left text-white/45`}>และอีก {fmtInt(pending.length - 5)} ไม้</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ReasonTag({ r }: { r?: string }) {
  const one = r === 'single_day';
  return (
    <span className={`${TS.caption} px-2 py-0.5 rounded-full border whitespace-nowrap ${one ? 'border-[#EF9F27]/45 text-[#f3b555]' : 'border-white/[0.14] text-white/50'}`}>
      {one ? 'ติดวันเดียว' : 'หลุดสแกน'}
    </span>
  );
}

function BestWorstList({ title, rows }: { title: string; rows: ClosedBrief[] }) {
  return (
    <div className="min-w-0">
      <h3 className={`${TS.caption} text-white/45 mb-1`}>{title}</h3>
      {rows.length === 0 ? (
        <div className={`${TS.body} text-white/30 py-1`}>—</div>
      ) : (
        rows.map(o => (
          <div key={`${o.ticker}-${o.entry_date}`} className={`flex justify-between gap-2 py-1 border-b border-white/[0.05] ${TS.body}`}>
            <span className="min-w-0 truncate">
              <Ticker t={o.ticker} /> <span className="text-white/40 tabular-nums">{fmtShortDate(o.entry_date)} · {o.holding_days} วัน</span>
            </span>
            <Num v={o.return_pct} />
          </div>
        ))
      )}
    </div>
  );
}

function ClosedResults({ scan, sum }: { scan: ScanReport; sum: SetupSummary }) {
  const l30 = scan.last30;
  const recent = scan.recent_closed ?? [];
  return (
    <div className={`${CARD} p-5 min-w-0`}>
      <h2 className={`${TS.sectionTitle} text-white`}>ปิดไม้แล้วได้ผลยังไง</h2>
      <div className="flex flex-wrap items-end gap-x-7 gap-y-2 mt-2">
        <Stat value={fmtInt(sum.n_closed)} label="ไม้ที่ปิดแล้วทั้งหมด" />
        {l30 && (
          <>
            <Stat
              value={isNum(l30.avg_return_pct) ? fmtPct(l30.avg_return_pct) : '—'}
              label={`ผลเฉลี่ย ไม้ที่ปิดใน ${l30.days} วันล่าสุด (${fmtInt(l30.n)} ไม้)`}
              color={returnColor(l30.avg_return_pct)}
            />
            <Stat
              value={<><span style={{ color: POS }}>{fmtInt(l30.n_win)}</span> <span className="text-white/35 text-[16px]">/</span> <span style={{ color: NEG }}>{fmtInt(l30.n_loss)}</span></>}
              label={`กำไร / ขาดทุน ใน ${l30.days} วัน`}
            />
          </>
        )}
      </div>
      {recent.length > 0 && (
        <div className="overflow-x-auto mt-2.5">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.07]">
                <th className={TH}>ปิดล่าสุด</th><th className={TH}>เข้า → ขาย</th><th className={TH}>ถือ</th><th className={TH}>ผล</th>
                <th className={`${TH} hidden sm:table-cell`}>ขึ้นสูงสุด</th><th className={`${TH} hidden sm:table-cell`}>ปิดเพราะ</th>
              </tr>
            </thead>
            <tbody>
              {recent.map(o => (
                <tr key={`${o.ticker}-${o.entry_date}`} className="border-b border-white/[0.05]">
                  <td className={TD}><Ticker t={o.ticker} /></td>
                  <td className={TD}>{fmtShortDate(o.entry_date)} → {fmtShortDate(o.exit_date)}</td>
                  <td className={TD}>{o.holding_days}</td>
                  <td className={TD}><Num v={o.return_pct} /></td>
                  <td className={`${TD} hidden sm:table-cell text-white/60`}>{fmtPct(o.mfe_pct, 1)}</td>
                  <td className={`${TD} hidden sm:table-cell`}><ReasonTag r={o.exit_reason} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
        <BestWorstList title="ดีสุด 3 ไม้" rows={scan.best3 ?? []} />
        <BestWorstList title="แย่สุด 3 ไม้" rows={scan.worst3 ?? []} />
      </div>
      <p className={`${TS.caption} text-white/35 mt-2.5`}>
        นับเฉพาะไม้ที่หลุดสแกนครบ 5 วันแล้ว · ดีสุด/แย่สุด ไม่นับไม้ที่ติดสแกนวันเดียว · รายการทั้งหมดอยู่ในตารางด้านล่าง
      </p>
    </div>
  );
}

/* ---------- 5. ถ้าเปลี่ยนวิธีขาย ---------- */

function WhatIfTable({ scan }: { scan: ScanReport }) {
  const lines = whatIfLines(scan.what_if);
  if (lines.length === 0) return null;
  const nCur = scan.what_if?.current?.n;
  return (
    <div className={`${CARD} p-5 min-w-0`}>
      <h2 className={`${TS.sectionTitle} text-white`}>ถ้าเปลี่ยนวิธีขาย ผลจะเป็นยังไง</h2>
      <p className={`${SUB} mt-0.5`}>เทียบกฎขายแบบต่าง ๆ กับไม้ที่ปิดแล้วชุดเดียวกัน ราคาเข้าเดียวกัน เพื่อบอกว่าควรปรับตรงไหน</p>
      <p className={`${TS.caption} text-white/55 mt-1`}>เทียบกับกฎตอนนี้บนไม้ชุดเดียวกัน</p>
      <div className="overflow-x-auto mt-2">
        <table className="w-full max-w-[860px]">
          <thead>
            <tr className="border-b border-white/[0.07]">
              <th className={TH}>กฎขาย</th><th className={TH}>ผลเฉลี่ย</th><th className={TH}>ไม้ที่กำไร</th>
              <th className={`${TH} hidden md:table-cell`}>กฎตอนนี้ บนไม้ชุดเดียวกัน</th>
              <th className={`${TH} hidden sm:table-cell`}>เทียบกับตอนนี้</th>
            </tr>
          </thead>
          <tbody>
            {lines.map(l => (
              <tr key={l.key} className={`border-b border-white/[0.05] ${l.key === 'current' ? 'bg-white/[0.03]' : ''} ${l.lowSample ? 'opacity-55' : ''}`}>
                <td className={`${TD} !whitespace-normal`}>
                  <span className={l.key === 'current' ? 'text-white font-semibold' : 'text-white/80'}>{l.label}</span>
                  {l.n !== nCur && <span className={`${TS.caption} text-white/40 ml-1.5`}>({fmtInt(l.n)} ไม้)</span>}
                  {l.differentSet && (
                    <span className={`${TS.caption} text-white/40 ml-1.5`} title="ไม้คนละชุดกับกฎหลัก (ถ้ากลับมาติดสแกนนับเป็นไม้ใหม่) เทียบกับค่าหลักทั้งชุด">· ไม้คนละชุด</span>
                  )}
                  {l.lowSample && l.key !== 'current' && (
                    <span className={`${TS.caption} ml-1.5 px-1.5 rounded-full border border-white/[0.14] text-white/55 whitespace-nowrap`}>ตัวอย่างน้อย</span>
                  )}
                  {l.best && (
                    <span className={`${TS.caption} ml-2 px-1.5 rounded-full border border-[#1D9E75]/50 text-[#3fd39b] whitespace-nowrap`}>ดีสุด</span>
                  )}
                </td>
                <td className={TD}><Num v={l.avg_return_pct} /></td>
                <td className={`${TD} text-white/75`}>{isNum(l.win_rate_pct) ? `${l.win_rate_pct.toFixed(0)}%` : '—'}</td>
                <td className={`${TD} hidden md:table-cell`}>{l.key === 'current' || l.sameAvg == null ? <span className="text-white/30">–</span> : <Num v={l.sameAvg} />}</td>
                <td className={`${TD} hidden sm:table-cell`}>{l.diff == null ? <span className="text-white/30">–</span> : <Num v={l.diff} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={`${TS.caption} text-white/40 mt-2.5 leading-relaxed ${READABLE}`}>
        ไม้ที่ยังไม่จบไม่นับ · &ldquo;เทียบกับตอนนี้&rdquo; = ผลของกฎนั้น ลบ ผลของกฎตอนนี้ บนไม้ชุดเดียวกันพอดี (ไม้ที่ข้อมูลยังไม่ครบ N วันตัดออกทั้งสองฝั่ง)
        · &ldquo;ขายทันทีที่หลุดสแกน&rdquo; ขายราคาปิดวันแรกที่หลุด ถ้ากลับมาติดนับเป็นไม้ใหม่ จึงเป็นไม้คนละชุด เทียบกับค่าหลักทั้งชุดและไม่ได้ป้าย ดีสุด
        · &ldquo;ถือตายตัว&rdquo; นับ N วันทำการจากวันเข้าซื้อของไม้ · แถวที่ไม้น้อยกว่า 30 ไม่ได้ป้าย ดีสุด
        · ขายทำกำไร/คัทขาดทุน ดูราคาสูง/ต่ำระหว่างวันตั้งแต่วันหลังวันเข้าซื้อ แตะแล้วขายที่ระดับนั้น ไม่แตะขายตามกฎหลัก
        · ผลย้อนหลังใช้ดูทิศทาง ไม่ใช่รับประกันอนาคต
      </p>
    </div>
  );
}

/* ---------- 6. วิธีวัด ---------- */

function MethodBox({ scan, sum, nSetups }: { scan: ScanReport; sum: SetupSummary; nSetups: number }) {
  const flow: [number, string][] = [
    [scan.total_picks, 'ครั้งที่ติดสแกน'],
    [nSetups, 'รวมเป็นไม้'],
    [sum.n_closed, 'ปิดแล้ว'],
    [sum.n_open, 'ยังถือ'],
    ...((sum.n_excluded_outlier ?? 0) > 0 ? ([[sum.n_excluded_outlier!, 'ตัดออก (ผิดปกติ)']] as [number, string][]) : []),
  ];
  const r = GRADE_RULES;
  return (
    <details className={`${CARD} p-5 group`}>
      <summary className={`cursor-pointer ${TS.sectionTitle} text-white/85 list-none flex items-center gap-2`}>
        <span className="text-[10px] text-white/35 transition-transform group-open:rotate-90">▶</span>
        วิธีวัดของหน้านี้
      </summary>
      <p className={`${TS.body} text-white/65 leading-relaxed mt-3 ${READABLE}`}>
        ซื้อที่ราคาปิดวันถัดจากวันที่ติดสแกน ถือไปเรื่อย ๆ แล้วขายที่ราคาปิดวันที่หลุดสแกนครบ 5 วันทำการติดกัน (วันแรกที่รู้ว่าไม้จบ)
        ถ้าหลุดไม่ถึง 5 วันแล้วกลับมา นับเป็นไม้เดิม ขึ้นสูงสุด/ลงต่ำสุดนับราคาระหว่างวันตั้งแต่วันหลังวันซื้อถึงวันขาย
        ตัวเลข &ldquo;ถือ 5/10/20 วัน&rdquo; ในช่องที่ 1 วัดอีกแบบ คือนับทุกครั้งที่ติดสแกน แล้วถือครบจำนวนวันที่กำหนด
      </p>
      <div className="flex flex-wrap mt-3">
        {flow.map(([v, k]) => (
          <div key={k} className="px-3.5 py-2 bg-white/[0.03] border border-white/[0.07] -mr-px">
            <div className="text-[18px] font-bold tabular-nums text-white">{fmtInt(v)}</div>
            <div className={SUB}>{k}</div>
          </div>
        ))}
      </div>
      <dl className={`grid grid-cols-1 md:grid-cols-[max-content_1fr] gap-x-5 gap-y-2 mt-4 ${TS.body}`}>
        <dt className="text-white font-medium">1 เลือกหุ้นถูกไหม</dt>
        <dd className="text-white/60">ดี = ชนะ SET ทุกระยะถือ (5/10/20 วัน) · พอใช้ = ชนะครึ่งหนึ่งขึ้นไป · ต้องแก้ = น้อยกว่านั้น</dd>
        <dt className="text-white font-medium">2 ได้กำไรไหม</dt>
        <dd className="text-white/60">
          ต้องชนะ X% = 1 ÷ (1 + ได้÷เสีย) · ชนะ Y% = ไม้กำไร ÷ (ไม้กำไร + ไม้ขาดทุน) ไม่นับไม้เสมอ · ดี = ผลเฉลี่ย &gt; 0 และ Y ≥ X ·
          พอใช้ = ผลเฉลี่ยไม่ต่ำกว่า {r.profitAvgFloor}% หรือ Y ขาดจาก X ไม่เกิน {r.profitWinSlack} จุด · ต้องแก้ = นอกนั้น
        </dd>
        <dt className="text-white font-medium">3 ขายถูกจังหวะไหม</dt>
        <dd className="text-white/60">ดี = ผลตอนขาย ≥ {Math.round(r.exitCaptureGood * 100)}% ของขึ้นสูงสุดเฉลี่ย · พอใช้ = ผลตอนขาย ≥ 0 · ต้องแก้ = ขายขาดทุน</dd>
        <dt className="text-white font-medium">ตัวอย่างน้อย</dt>
        <dd className="text-white/60">ไม้ที่ปิดแล้วน้อยกว่า {r.smallSample} ไม้ · แท่งรายเดือนที่จางคือเดือนที่มีไม้น้อยกว่า {r.monthFaintN} ไม้</dd>
        <dt className="text-white font-medium">ดีสุด (ตารางเปลี่ยนวิธีขาย)</dt>
        <dd className="text-white/60">
          แถวที่ผลเฉลี่ยดีกว่ากฎตอนนี้บนไม้ชุดเดียวกันอย่างน้อย {r.whatIfBestMin} จุด และมีไม้ตั้งแต่ {r.whatIfMinN} ไม้ขึ้นไป เฉพาะอันดับ 1 ·
          &ldquo;ขายทันทีที่หลุด&rdquo; เป็นไม้คนละชุด จึงไม่ได้ป้ายนี้
        </dd>
        <dt className="text-white font-medium">ไม้ผิดปกติ</dt>
        <dd className="text-white/60">
          ไม้ที่ปิดแล้ว ผลเกิน ±40% และมีวันที่ไม่มีการซื้อขายเลยระหว่างถือ (เกณฑ์เดียวกับตาราง D+N) ราคาที่ใช้คำนวณไม่ใช่ราคาที่ซื้อขายได้จริง
          จึงไม่นับในตัวเลขสรุป กราฟ และตารางเปลี่ยนวิธีขาย แต่ยังอยู่ในรายการไม้พร้อมป้าย &ldquo;ตัดออก: ผิดปกติ&rdquo;
          {(scan.setup_summary?.excluded_outliers?.length ?? 0) > 0 && (
            <>
              {' '}ตอนนี้มี {scan.setup_summary!.excluded_outliers!.map(o => `${o.ticker} (${fmtShortDate(o.entry_date)} ${fmtPct(o.return_pct, 0)})`).join(', ')}
            </>
          )}
        </dd>
      </dl>
    </details>
  );
}

/* ---------- all ---------- */

export default function ReportCardTop({ scan, sum, setups, color }: { scan: ScanReport; sum: SetupSummary; setups: SetupEntry[]; color: string }) {
  const g = gradeScan(scan);
  return (
    <div className="space-y-3.5">
      <VerdictPanel scan={scan} sum={sum} g={g} color={color} />
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3.5">
        <PickCard scan={scan} g={g} />
        <ProfitCard sum={sum} g={g} />
        <ExitCard sum={sum} g={g} />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5">
        <HoldingNow setups={setups} nOpen={sum.n_open} />
        <ClosedResults scan={scan} sum={sum} />
      </div>
      <WhatIfTable scan={scan} />
      <MethodBox scan={scan} sum={sum} nSetups={setups.length} />
    </div>
  );
}
