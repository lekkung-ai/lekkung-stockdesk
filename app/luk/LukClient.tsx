'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import FullWidthPage from '@/components/FullWidthPage';
import { formatShortThaiDate } from '@/lib/utils';
import {
  MODE_INFO, MODE_ORDER, REGIME_NOTE, TAB_LABEL, TAB_ORDER, THEME_ADVICE, WEAK_HEADER,
  fmtPct, fmtPrice, fmtRank, fmtSize, funnelSteps, gaugeRows, nextStep, regimeSentence, setupLabel, sizingNotes,
  sortByScore, stopText, tabCandidates, tabCounts, themeBySymbol, themeSentence,
  type GaugeRow, type LukCandidate, type LukData, type LukMode, type LukTab, type LukWeak,
} from '@/lib/luk';

const CARD = 'bg-[#13161e] border border-white/[0.07] rounded-xl';

const MODE_STYLE: Record<LukMode, { name: string; on: string }> = {
  LONG: { name: 'text-[#86efac]', on: 'bg-[#14352a] border-[#166534] text-[#bbf7d0]' },
  MIXED: { name: 'text-[#fcd34d]', on: 'bg-[#2a2410] border-[#713f12] text-[#fde68a]' },
  DEFENSIVE: { name: 'text-[#fdba74]', on: 'bg-[#33200d] border-[#7c3a0e] text-[#fed7aa]' },
  SHORT: { name: 'text-[#fca5a5]', on: 'bg-[#3b1418] border-[#7f1d1d] text-[#fecaca]' },
};

const SETUP_CHIP: Record<string, string> = {
  LONG_PULLBACK: 'bg-[#1e293b] text-[#93c5fd] border-[#1e3a8a]',
  EPISODIC_PIVOT: 'bg-[#2e1065] text-[#c4b5fd] border-[#4c1d95]',
  SHORT_WEAK_BOUNCE: 'bg-[#3b1418] text-[#fca5a5] border-[#7f1d1d]',
  PARABOLIC_SHORT: 'bg-[#3b1418] text-[#fca5a5] border-[#7f1d1d]',
};

const thaiDate = (iso: string | null | undefined): string => (iso ? `${formatShortThaiDate(iso)} ${Number(iso.slice(0, 4)) + 543}` : '-');

export default function LukClient({ data }: { data: LukData | null }) {
  return (
    <FullWidthPage className="space-y-4">
      <div>
        <div className="text-[13px] text-white/50">SCANNER › Martin Luk</div>
        <h1 className="mt-1 text-[22px] font-extrabold text-white">Martin Luk · Momentum Watchlist</h1>
        <p className="mt-1 text-[13px] text-white/60">
          หุ้นผู้นำที่ย่อเข้าเส้น / Gap แรงวันนี้ → ลิสต์สำหรับพรุ่งนี้
          {data?.asOf && <span className="ml-2 text-white/80 font-semibold" data-testid="luk-asof">ข้อมูลสแกน {thaiDate(data.asOf)}</span>}
        </p>
      </div>
      {!data && <Empty text="ยังไม่มีข้อมูล Martin Luk · จะมาในรอบสแกนถัดไป" />}
      {data && !data.regime && (
        <>
          <Empty text="คำนวณสภาพตลาดไม่สำเร็จในรอบสแกนล่าสุด · รอรอบสแกนถัดไป" />
          <Warnings warnings={data.warnings} />
        </>
      )}
      {data && data.regime && <Content data={data} />}
    </FullWidthPage>
  );
}

function Empty({ text }: { text: string }) {
  return <div className={`${CARD} p-8 text-center text-[15px] text-white/70`} data-testid="luk-empty">{text}</div>;
}

function Warnings({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return null;
  return (
    <div className="text-[12px] text-white/40 space-y-0.5" data-testid="luk-warnings">
      {warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
    </div>
  );
}

function Content({ data }: { data: LukData }) {
  const [tab, setTab] = useState<LukTab>('buy');
  const counts = useMemo(() => tabCounts(data), [data]);
  const rows = useMemo(() => tabCandidates(data.candidates, tab), [data.candidates, tab]);
  const weak = useMemo(() => sortByScore(data.weak), [data.weak]);
  const themes = useMemo(() => themeBySymbol(data.themeAlerts), [data.themeAlerts]);
  const buyTab = tab !== 'weak';

  return (
    <>
      {data.reminder && (
        <div className="rounded-[10px] border border-[#5b3d0a] border-l-4 border-l-[#f59e0b] bg-[#1c1508] px-3.5 py-2.5 text-[14px] text-[#fde68a]" data-testid="luk-reminder">
          ⏱ {data.reminder}
        </div>
      )}
      <RegimeCard data={data} />
      {data.funnel && <Funnel data={data} />}

      <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="หมวด setup" data-testid="luk-tabs">
        {TAB_ORDER.map(k => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            data-tab={k}
            onClick={() => setTab(k)}
            className={`shrink-0 px-3.5 py-1.5 rounded-lg text-[14px] cursor-pointer transition-colors ${
              tab === k ? 'bg-[#2a2f3d] text-white font-semibold' : 'bg-[#1a1e29] text-white/60 hover:bg-white/10'
            }`}
          >
            {TAB_LABEL[k]} ({counts[k]})
          </button>
        ))}
      </div>

      {buyTab && data.themeAlerts.length > 0 && (
        <div className="rounded-[10px] border border-[#78350f] bg-[#1c1508] px-3.5 py-2.5 text-[14px] text-[#fde68a]" data-testid="luk-theme-alerts">
          {data.themeAlerts.map(a => (
            <div key={a.subsector}>⚠ กลุ่มเดียวกันหลายตัว: {themeSentence(a)} · {THEME_ADVICE}</div>
          ))}
        </div>
      )}

      {buyTab && (
        <section className={`${CARD} p-4`}>
          <BuyTable rows={rows} themes={themes} />
          <div className="mt-3 space-y-1 text-[13px] text-white/45" data-testid="luk-sizing-notes">
            {sizingNotes(data.config, data.regime?.suggested_risk_pct ?? null).map(t => <div key={t}>{t}</div>)}
          </div>
        </section>
      )}

      {(tab === 'buy' || tab === 'weak') && <WeakBox rows={weak} />}
      <Warnings warnings={data.warnings} />
    </>
  );
}

// ── Regime ─────────────────────────────────────────────────────────────────
function RegimeCard({ data }: { data: LukData }) {
  const r = data.regime!;
  const style = MODE_STYLE[r.mode];
  const gauges = gaugeRows(r, data.config);
  return (
    <section className={`${CARD} p-4`} data-testid="luk-regime" data-mode={r.mode}>
      <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <div className="text-[12px] font-semibold text-white/50">สภาพตลาดของแท็บนี้ (Regime)</div>
          <div className={`mt-0.5 text-[26px] font-bold ${style.name}`}>{MODE_INFO[r.mode].name}</div>
          <div className="mt-1 text-[15px] text-white">{regimeSentence(r)}</div>
          <div className="mt-3 flex gap-1.5" data-testid="luk-modes">
            {MODE_ORDER.map(m => (
              <div
                key={m}
                data-on={r.mode === m}
                className={`flex-1 rounded-lg border px-2.5 py-2 text-[12px] ${r.mode === m ? MODE_STYLE[m].on : 'bg-[#1a1e29] border-transparent text-white/55'}`}
              >
                <b className="block text-[14px] text-white">{MODE_INFO[m].name}</b>
                {MODE_INFO[m].sub}
              </div>
            ))}
          </div>
          <div className="mt-2.5 text-[13px] text-white/45">{REGIME_NOTE}</div>
        </div>
        <div>
          <div className="text-[12px] font-semibold text-white/50">
            ผู้นำ {r.leaders_counted ?? data.leadersCount} ตัว (RS Rating สูงสุด)
          </div>
          <div className="mt-1" data-testid="luk-gauges">
            {gauges.map(g => <Gauge key={g.key} g={g} />)}
          </div>
          {r.set && (
            <div className="mt-2 text-[13px] text-white/70" data-testid="luk-set-status">
              SET <span className="tabular-nums font-semibold text-white">{fmtPrice(r.set.close)}</span>
              {' · '}เหนือ EMA9 {tick(r.set.above_ema9)}{' · '}เหนือ EMA21 {tick(r.set.above_ema21)}{' · '}EMA21 กำลังขึ้น {tick(r.set.ema21_rising)}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

const tick = (b: boolean) => (b ? <span className="text-[#22c55e]">✓</span> : <span className="text-[#ef4444]">✗</span>);

function Gauge({ g }: { g: GaugeRow }) {
  const v = g.value == null ? 0 : Math.max(0, Math.min(100, g.value));
  return (
    <div className="my-1.5 grid grid-cols-[120px_1fr_52px] sm:grid-cols-[150px_1fr_56px] items-center gap-2.5 text-[13px]" data-gauge={g.key}>
      <div className="text-white/70">
        {g.label}
        {g.markLabel && <div className="text-[12px] text-white/40">{g.markLabel}</div>}
      </div>
      <div className="relative h-2.5 rounded bg-[#1f2937]">
        <div className="absolute inset-y-0 left-0 rounded bg-[#338ced]" style={{ width: `${v}%` }} />
        {g.mark != null && <div className="absolute -top-[3px] -bottom-[3px] w-0.5 bg-[#e5e7eb]" style={{ left: `${g.mark}%` }} />}
      </div>
      <div className="text-right tabular-nums font-semibold text-white">{g.value == null ? '-' : `${Math.round(g.value)}%`}</div>
    </div>
  );
}

function Funnel({ data }: { data: LukData }) {
  const steps = funnelSteps(data.funnel!, data.config, data.leadersCount);
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-white/55" data-testid="luk-funnel">
      {steps.map((s, i) => (
        <span key={s.label} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-white/30">→</span>}
          <span>{s.label} <b className="tabular-nums text-white">{s.n}</b></span>
        </span>
      ))}
    </div>
  );
}

// ── ตารางฝั่งซื้อ ──────────────────────────────────────────────────────────
const TH = 'px-1.5 py-2 text-[12px] font-medium text-white/45 whitespace-nowrap border-b border-white/[0.07]';
const TD = 'px-1.5 py-2.5 border-b border-white/[0.05] align-top';

function BuyTable({ rows, themes }: { rows: LukCandidate[]; themes: Map<string, string> }) {
  if (!rows.length) {
    return <div className="py-8 text-center text-[14px] text-white/55" data-testid="luk-no-rows">วันนี้ไม่มีหุ้นเข้า setup นี้</div>;
  }
  return (
    <div className="overflow-x-auto" data-testid="luk-table-wrap">
      <table className="w-full min-w-[1000px] border-collapse text-[14px]" data-testid="luk-table">
        <thead>
          <tr className="text-right">
            <th className={`${TH} text-left sticky left-0 z-10 bg-[#13161e]`}>หุ้น</th>
            <th className={`${TH} text-left`}>Setup</th>
            <th className={TH}>ราคา</th>
            <th className={TH}>RS · อันดับผู้นำ</th>
            <th className={`${TH} text-left`}>เข้าหาเส้น</th>
            <th className={TH}>ห่างเส้น (ADR)</th>
            <th className={TH}>จุดเข้า</th>
            <th className={`${TH} text-left`}>Stop</th>
            <th className={TH}>ขนาดไม้ (intraday · รายวัน)</th>
            <th className={`${TH} text-left`}>ทำไมติด / ทำอะไรพรุ่งนี้</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(c => {
            const theme = themes.get(c.symbol);
            return (
              <tr key={`${c.symbol}-${c.setup}`} data-ticker={c.symbol} className="hover:bg-white/[0.02]">
                <td className={`${TD} sticky left-0 z-10 bg-[#13161e]`}>
                  <Link href={`/stock/${encodeURIComponent(c.symbol)}`} className="font-bold text-[#60a5fa] hover:underline">{c.symbol}</Link>
                  {theme && (
                    <span data-testid="luk-theme-badge" title={theme} className="ml-1.5 whitespace-nowrap rounded-[5px] border border-[#78350f] bg-[#3f2a06] px-1.5 text-[12px] text-[#fcd34d]">กลุ่มซ้ำ</span>
                  )}
                  {(c.subsector || c.sector) && <div className="text-[12px] text-white/40">{c.subsector ?? c.sector}</div>}
                </td>
                <td className={TD}>
                  <span className={`inline-block rounded-md border px-2 py-px text-[12px] font-bold whitespace-nowrap ${SETUP_CHIP[c.setup] ?? SETUP_CHIP.LONG_PULLBACK}`}>{setupLabel(c.setup)}</span>
                </td>
                <td className={`${TD} text-right tabular-nums font-semibold text-[#7dd3fc]`}>{fmtPrice(c.close)}</td>
                <td className={`${TD} text-right tabular-nums`}>{c.rs_rating ?? '-'}{c.leader_rank != null && <> · {fmtRank(c.leader_rank)}</>}</td>
                <td className={`${TD} whitespace-nowrap`}>{c.ref_name ?? '-'} <span className="tabular-nums text-white/70">{fmtPrice(c.ref_level)}</span></td>
                <td className={`${TD} text-right tabular-nums`}>{c.dist_ref_adr != null ? c.dist_ref_adr.toFixed(2) : '-'}</td>
                <td className={`${TD} text-right tabular-nums font-semibold text-white`}>{fmtPrice(c.entry_trigger)}</td>
                <td className={`${TD} whitespace-nowrap tabular-nums text-white/80`}>{stopText(c)}</td>
                <td className={`${TD} text-right tabular-nums`}>{fmtSize(c.size_pct_intraday_stop)} · {fmtSize(c.size_pct_daily_stop)}</td>
                <td className={`${TD} min-w-[220px] max-w-[320px] text-[13px] text-white/65`}>
                  {c.note}
                  <div className="mt-0.5 text-white/50">{nextStep(c)}</div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── กล่องหุ้นอ่อนแรง (ไม่มีจุดเข้า / stop / ขนาดไม้) ─────────────────────────
function WeakBox({ rows }: { rows: LukWeak[] }) {
  return (
    <section className="rounded-xl border border-[#7f1d1d]/60 bg-[#13161e] p-4" data-testid="luk-weak">
      <h2 className="text-[15px] font-extrabold text-[#fca5a5]">{WEAK_HEADER}</h2>
      {rows.length === 0 ? (
        <div className="py-6 text-center text-[14px] text-white/55" data-testid="luk-weak-empty">วันนี้ไม่มีหุ้นเข้า setup นี้</div>
      ) : (
        <div className="mt-2 overflow-x-auto" data-testid="luk-weak-wrap">
          <table className="w-full min-w-[760px] border-collapse text-[14px]">
            <thead>
              <tr className="text-right">
                <th className={`${TH} text-left`}>หุ้น</th>
                <th className={`${TH} text-left`}>แบบ</th>
                <th className={TH}>ราคา</th>
                <th className={TH}>RS</th>
                <th className={TH}>1 เดือน</th>
                <th className={`${TH} text-left`}>ทำไมอ่อน</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(w => (
                <tr key={`${w.symbol}-${w.setup}`} data-weak={w.symbol}>
                  <td className={TD}><Link href={`/stock/${encodeURIComponent(w.symbol)}`} className="font-bold text-[#60a5fa] hover:underline">{w.symbol}</Link></td>
                  <td className={TD}><span className={`inline-block rounded-md border px-2 py-px text-[12px] font-bold whitespace-nowrap ${SETUP_CHIP[w.setup] ?? SETUP_CHIP.PARABOLIC_SHORT}`}>{setupLabel(w.setup)}</span></td>
                  <td className={`${TD} text-right tabular-nums font-semibold text-[#7dd3fc]`}>{fmtPrice(w.close)}</td>
                  <td className={`${TD} text-right tabular-nums`}>{w.rs_rating ?? '-'}</td>
                  <td className={`${TD} text-right tabular-nums`}>{fmtPct(w.perf_1m == null ? null : w.perf_1m / 100)}</td>
                  <td className={`${TD} min-w-[280px] text-[13px] text-white/65`}>{w.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-2 text-[13px] text-white/45">
        เด้งอ่อน = อดีตผู้นำที่หลุด EMA21 พร้อมวอลุ่ม แล้วเด้งกลับวอลุ่มเบาเข้าหาเส้น · วิ่งแนวตั้ง = ขึ้นรวดจนห่างเหนือ EMA9 มาก มีโอกาสย่อแรง อย่าไล่
      </div>
    </section>
  );
}
