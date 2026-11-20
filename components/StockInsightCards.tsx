'use client';

// การ์ดใหม่ 3 ใบของหน้า /stock/[ticker] (mockups/stock-detail-v3.html) — ใช้เฉพาะหน้านี้
//   EntryPlanCard (คอลัมน์เทคนิค ต่อจาก SEPA/Stage/Kell) · ScanHistoryCard (ต่อจาก EntryPlanCard)
//   MoneyFlowCard (คอลัมน์พื้นฐาน ต่อจากตัวเลขการเงินย้อนหลัง)
// style เดียวกับการ์ด v2 ใน StockDetailPage (สี/ขนาด 18/14/12 · ข้อความรอง #848ca0)
// ข้อมูลทั้งหมดตัดมาจาก server แล้ว (lib/stockInsightsData.ts) · ประโยคสรุปจากกฎใน lib/stockInsights.ts

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import Link from 'next/link';
import {
  entryNumbers,
  entrySummary,
  fmtMillion,
  fmtPrice,
  hasVcpBase,
  moneyFlowSummary,
  statsSummary,
  type EntryPlan,
  type MoneyFlowCard as MoneyFlowData,
  type ScanHistoryCard as ScanHistoryData,
} from '@/lib/stockInsights';
import { STAGE_COLORS } from '@/lib/peadExtras';

const META = 'text-[#a3aabb]'; // 2026-11-20: สว่างขึ้นจาก #848ca0 — ใช้เฉพาะไฟล์นี้
const INK2 = 'text-[#b4bac8]';
const INK = 'text-[#eceef3]';
const UP_TXT = 'text-[#1D9E75]';
const DOWN_TXT = 'text-[#E24B4A]';
const WARN_TXT = 'text-[#EF9F27]';
const CARD = '@container bg-[#13161e] border border-white/[0.07] rounded-xl';
const TILE = 'bg-white/[0.035] rounded-lg px-3 py-2.5 min-w-0';
const ACCENT = '#8b9cff';

const signed = (v: number, d = 1) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d)}%`;
const signCls = (v: number | null) => (v == null ? INK : v > 0 ? UP_TXT : v < 0 ? DOWN_TXT : INK);
const thShort = (iso: string) => {
  const d = new Date(`${iso}T00:00:00+07:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' });
};

function CardHead({ title, right, question }: { title: string; right?: ReactNode; question: string }) {
  return (
    <>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
        <h3 className={`text-[16px] font-semibold ${INK}`}>{title}</h3>
        {right}
      </div>
      <p className={`text-[13px] ${META} mb-3`}>{question}</p>
    </>
  );
}

function Hint({ text, testId }: { text: string; testId: string }) {
  return (
    <div className={`mt-3 text-[14px] leading-relaxed ${INK2} bg-white/[0.04] rounded-lg px-3 py-2`} data-testid={testId}>
      สรุป: {text}
    </div>
  );
}

function MiniTile({ label, value, sub, valueCls = INK, subCls = META, testId }: { label: string; value: ReactNode; sub?: ReactNode; valueCls?: string; subCls?: string; testId?: string }) {
  return (
    <div className={TILE} data-testid={testId}>
      <div className={`text-[13px] font-medium ${META}`}>{label}</div>
      <div className={`text-[14px] font-semibold leading-snug mt-0.5 break-words ${valueCls}`}>{value}</div>
      {sub != null && <div className={`text-[12px] mt-0.5 break-words ${subCls}`}>{sub}</div>}
    </div>
  );
}

function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(entries => { const cw = entries[0]?.contentRect.width; if (cw) setW(cw); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

// ── ① จุดเข้า & แผนเทรด ─────────────────────────────────────────────────────

interface Marker { key: string; value: number; label: string; caption: string; valueCls: string; tick: string; tickH: number }

/** เส้นราคาเส้นเดียว SL — ราคา — Pivot — TP · ป้ายริมชิดขอบ · ป้ายที่ชนกันย้ายไปแถวล่าง */
function PriceLevels({ markers, sl, price, tp }: { markers: Marker[]; sl: number; price: number; tp: number }) {
  const [ref, width] = useWidth<HTMLDivElement>(560);
  const lo = Math.min(...markers.map(m => m.value));
  const hi = Math.max(...markers.map(m => m.value));
  const pos = (v: number) => (hi === lo ? 50 : ((v - lo) / (hi - lo)) * 100);

  // จัดแถวป้าย: ประมาณความกว้างจากจำนวนตัวอักษร แล้ววางทีละตัวจากซ้าย — ชนกับตัวก่อนหน้าในแถวเดียวกัน → แถวล่าง
  const sorted = [...markers].sort((a, b) => a.value - b.value);
  const placed = sorted.map((m, i) => {
    const p = pos(m.value);
    const estW = Math.max(m.label.length * 8.5, m.caption.length * 6.6) + 10;
    const align: 'left' | 'right' | 'center' = i === 0 || p <= 8 ? 'left' : i === sorted.length - 1 || p >= 92 ? 'right' : 'center';
    const x = (p / 100) * width;
    const left = align === 'left' ? x : align === 'right' ? x - estW : x - estW / 2;
    return { m, p, align, left, right: left + estW, row: 0 };
  });
  // ราคาตอนนี้ได้แถวบนก่อนเสมอ
  const order = [...placed].sort((a, b) => (a.m.key === 'now' ? -1 : b.m.key === 'now' ? 1 : a.p - b.p));
  const taken: { left: number; right: number; row: number }[] = [];
  for (const pl of order) {
    const clash = (row: number) => taken.some(t => t.row === row && pl.left < t.right + 6 && pl.right > t.left - 6);
    pl.row = clash(0) ? 1 : 0;
    taken.push(pl);
  }
  const twoRows = placed.some(p => p.row === 1);
  const LINE = 22;
  const zone = (a: number, b: number, cls: string) => {
    const l = pos(Math.min(a, b)), r = pos(Math.max(a, b));
    return r - l > 0 ? <div className={`absolute h-2.5 rounded-full ${cls}`} style={{ left: `${l}%`, width: `${r - l}%`, top: LINE - 4 }} /> : null;
  };

  return (
    <div ref={ref} className="relative mx-1" style={{ height: twoRows ? 86 : 50 }} data-testid="entry-levels">
      <div className="absolute left-0 right-0 h-0.5 bg-white/[0.07]" style={{ top: LINE }} />
      {price > sl && zone(sl, price, 'bg-[#E24B4A]/25')}
      {tp > price && zone(price, tp, 'bg-[#1D9E75]/20')}
      {placed.map(({ m, p, align, row }) => {
        const tr = align === 'left' ? 'translateX(0)' : align === 'right' ? 'translateX(-100%)' : 'translateX(-50%)';
        const items = align === 'left' ? 'items-start' : align === 'right' ? 'items-end' : 'items-center';
        return (
          <div key={m.key}>
            <span className="absolute rounded-sm" style={{ left: `${p}%`, top: LINE + 1 - m.tickH / 2, width: m.key === 'now' ? 3 : 2, height: m.tickH, marginLeft: m.key === 'now' ? -1.5 : -1, background: m.tick }} />
            <div
              className={`absolute flex flex-col ${items} whitespace-nowrap leading-4`}
              style={{ left: `${p}%`, transform: tr, top: row === 0 ? 0 : LINE + 28 }}
              data-marker={m.key}
            >
              {row === 0 ? (
                <>
                  <b className={`text-[14px] font-semibold ${m.valueCls}`}>{m.label}</b>
                  <span className={`text-[13px] ${META} mt-4`}>{m.caption}</span>
                </>
              ) : (
                <>
                  <span className={`text-[13px] ${META}`}>{m.caption}</span>
                  <b className={`text-[14px] font-semibold ${m.valueCls}`}>{m.label}</b>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function EntryPlanCard({ plan, livePrice, isFund }: { plan: EntryPlan | null; livePrice: number | null; isFund: boolean }) {
  if (isFund) return null;
  if (!plan) {
    return (
      <div className={`${CARD} p-4 mt-4`} data-testid="card-entry" data-state="none">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className={`text-[16px] font-semibold ${INK}`}>จุดเข้า &amp; แผนเทรด</h3>
          <span className={`text-[13px] ${META}`}>ยังไม่มีฐาน VCP (ไม่ผ่าน SEPA)</span>
        </div>
      </div>
    );
  }
  const price = livePrice ?? plan.scanPrice;
  const base = hasVcpBase(plan);
  const n = entryNumbers(plan, price);
  const slPct = ((plan.sl - plan.scanPrice) / plan.scanPrice) * 100;
  const tpPct = ((plan.tp - plan.scanPrice) / plan.scanPrice) * 100;
  const markers: Marker[] = [
    { key: 'sl', value: plan.sl, label: fmtPrice(plan.sl), caption: `ตัดขาดทุน ${signed(slPct, 0)}`, valueCls: DOWN_TXT, tick: '#b4bac8', tickH: 12 },
    { key: 'now', value: price, label: fmtPrice(price), caption: 'ราคาตอนนี้', valueCls: INK, tick: '#eceef3', tickH: 16 },
    { key: 'tp', value: plan.tp, label: fmtPrice(plan.tp), caption: `เป้า ${signed(tpPct, 0)}`, valueCls: UP_TXT, tick: '#b4bac8', tickH: 12 },
  ];
  if (base && plan.pivot != null && n.toPivotPct != null) {
    markers.push({ key: 'pivot', value: plan.pivot, label: fmtPrice(plan.pivot), caption: `Pivot ${signed(n.toPivotPct)}`, valueCls: WARN_TXT, tick: '#EF9F27', tickH: 12 });
  }
  const dry = plan.volRatio == null ? null : plan.volRatio < 1;

  return (
    <div className={`${CARD} p-4 mt-4`} data-testid="card-entry" data-state={base ? 'base' : 'nobase'}>
      <CardHead
        title="จุดเข้า & แผนเทรด"
        question="ใกล้จุดซื้อไหม?"
        right={
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[12px] font-medium whitespace-nowrap bg-white/[0.05] ${INK2} border-white/[0.08]`} data-testid="entry-footprint">
            {base ? `ฐาน VCP · ${plan.footprint}` : 'ยังไม่มีฐาน VCP'}
          </span>
        }
      />
      <PriceLevels markers={markers} sl={plan.sl} price={price} tp={plan.tp} />
      {base && (
        <div className="grid grid-cols-2 @md:grid-cols-3 gap-2 mt-3">
          <MiniTile
            testId="entry-base"
            label="ฐานราคา"
            value={plan.weeks != null ? `${plan.weeks % 1 === 0 ? plan.weeks.toFixed(0) : plan.weeks.toFixed(1)} สัปดาห์` : '—'}
            sub={`ย่อ ${plan.contractions ?? '—'} ครั้ง · แคบลง ${plan.contracting == null ? '—' : plan.contracting ? '✓' : '✗'}`}
          />
          <MiniTile
            testId="entry-depth"
            label="ความลึก"
            value={plan.maxDepth != null && plan.finalDepth != null ? `${plan.maxDepth.toFixed(1)}% → ${plan.finalDepth.toFixed(1)}%` : '—'}
            sub="ย่อครั้งแรก → ล่าสุด"
          />
          <MiniTile
            testId="entry-vol"
            label="วอลุ่มช่วงย่อ"
            value={plan.volRatio != null ? `${plan.volRatio.toFixed(2)}×` : '—'}
            valueCls={dry == null ? INK : dry ? UP_TXT : WARN_TXT}
            sub={dry == null ? undefined : dry ? 'แห้ง (ดี < 1)' : 'ยังไม่แห้ง (ดี < 1)'}
          />
        </div>
      )}
      <Hint text={entrySummary(plan, price)} testId="entry-summary" />
      <p className={`text-[13px] ${META} mt-2`}>
        SL / เป้า คำนวณจากราคาปิด ณ วันสแกน ({fmtPrice(plan.scanPrice)}){livePrice == null ? ' · ดึงราคาสดไม่ได้ ใช้ราคาปิดวันสแกน' : ''}
      </p>
    </div>
  );
}

// ── ② ประวัติในสแกน ──────────────────────────────────────────────────────────

/** แถบ 30 ช่อง — ไม่ใส่ title รายช่อง (ข้อความซ้ำ 30×แถวทำให้ HTML ใหญ่) · hover/แตะ → บรรทัดวันที่ใต้แถบ */
function StripRow({ label, cells, right, testId, onHover }: { label: string; cells: (string | null)[]; right?: ReactNode; testId: string; onHover: (i: number | null) => void }) {
  const pick = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.floor(((e.clientX - r.left) / r.width) * cells.length);
    onHover(i >= 0 && i < cells.length ? i : null);
  };
  return (
    <div className="grid grid-cols-[64px_minmax(0,1fr)_64px] items-center gap-2 mb-1.5" data-testid={testId}>
      <span className={`text-[13px] ${META} truncate`}>{label}</span>
      <div
        className="grid gap-[2px] cursor-crosshair [&>i]:block [&>i]:h-3 [&>i]:rounded-[2px] [&>i]:bg-white/5"
        style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}
        onPointerMove={pick}
        onPointerDown={pick}
        onPointerLeave={() => onHover(null)}
      >
        {cells.map((c, i) =>
          c === 'hit' ? <i key={i} className="!bg-[#8b9cff]" />
            : c ? <i key={i} style={{ background: c }} />
              : <i key={i} />,
        )}
      </div>
      <span className={`text-[12px] ${INK2} text-right whitespace-nowrap`}>{right}</span>
    </div>
  );
}

export function ScanHistoryCard({ data }: { data: ScanHistoryData | null }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!data) return null;
  const { dates, stage, rows, setups, stats } = data;
  const hoverText = hover == null || !dates[hover] ? null : [
    thShort(dates[hover]),
    `Stage ${stage[hover] ?? '—'}`,
    ...rows.map(r => `${r.label} ${r.hits[hover] ? '✓' : '—'}`),
  ].join(' · ');
  const hasStage = stage.some(s => s != null);
  const stageRow = hasStage && (
    <StripRow
      testId="strip-stage"
      label="Stage"
      cells={stage.map(s => (s ? STAGE_COLORS[s] ?? '#9e9e9e' : null))}
      onHover={setHover}
    />
  );
  const range = dates.length ? `${thShort(dates[0])} → ${thShort(dates[dates.length - 1])}` : '';
  const empty = rows.length === 0 && setups.length === 0;

  if (empty) {
    return (
      <div className={`${CARD} p-4 mt-4`} data-testid="card-history" data-state="empty">
        <CardHead title="ประวัติในสแกน" question="สัญญาณนี้ต่อเนื่องและเชื่อได้แค่ไหน?" right={<span className={`text-[13px] ${META}`}>30 วันทำการล่าสุด</span>} />
        {stageRow}
        <p className={`text-[13px] ${META} ${hasStage ? 'mt-2' : ''}`} data-testid="strip-hover">{hoverText ?? `ไม่ติดสแกนใดใน 30 วันล่าสุด${range ? ` (${range})` : ''}`}</p>
      </div>
    );
  }

  const stagesShown = [...new Set(stage.filter((s): s is string => s != null))];
  const summary = statsSummary(stats);

  return (
    <div className={`${CARD} p-4 mt-4`} data-testid="card-history" data-state="full">
      <CardHead title="ประวัติในสแกน" question="สัญญาณนี้ต่อเนื่องและเชื่อได้แค่ไหน?" right={<span className={`text-[13px] ${META}`}>30 วันทำการล่าสุด</span>} />
      {stageRow}
      {rows.map(r => (
        <StripRow
          key={r.key}
          testId={`strip-${r.key}`}
          label={r.label}
          cells={r.hits.map(h => (h ? 'hit' : null))}
          onHover={setHover}
          right={r.days != null ? <span data-testid={`days-${r.key}`}>ติด {r.days} วัน</span> : undefined}
        />
      ))}
      <div className={`flex gap-3 flex-wrap text-[13px] ${META} mt-1 mb-3`}>
        {stagesShown.map(s => (
          <span key={s} className="inline-flex items-center gap-1"><i className="inline-block w-2.5 h-2.5 rounded-[2px]" style={{ background: STAGE_COLORS[s] ?? '#9e9e9e' }} />{s}</span>
        ))}
        {rows.length > 0 && <span className="inline-flex items-center gap-1"><i className="inline-block w-2.5 h-2.5 rounded-[2px]" style={{ background: ACCENT }} />ติดสแกน</span>}
        <span className={hoverText ? INK2 : undefined} data-testid="strip-hover">{hoverText ?? range}</span>
      </div>

      {setups.length > 0 && (
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full border-collapse text-[12px]" data-testid="setup-table">
            <thead>
              <tr className="border-b border-white/[0.06]">
                {['setup', 'เข้า', 'ถือ', 'ตอนนี้', 'สูงสุด', 'ลึกสุด'].map((h, i) => (
                  <th key={h} className={`pb-2 px-1.5 font-medium ${META} whitespace-nowrap ${i === 0 ? 'text-left pl-0' : 'text-right'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {setups.map(s => {
                const past = s.status === 'closed';
                const dim = past ? 'opacity-55' : '';
                return (
                  <tr key={`${s.scan}-${s.seq}-${s.entryDate}`} data-status={s.status} className={dim}>
                    <td className={`py-1.5 pr-1.5 text-left whitespace-nowrap align-top ${INK}`}>
                      {s.label} {s.seq != null && <span className={META}>#{s.seq}</span>}
                      {past && <span className={`${META} block @md:inline`}> (ปิดแล้ว)</span>}
                    </td>
                    <td className={`py-1.5 px-1.5 text-right whitespace-nowrap ${INK2}`}>{thShort(s.entryDate)}<br className="@md:hidden" /><span className="hidden @md:inline"> </span>@{fmtPrice(s.entryPrice)}</td>
                    <td className={`py-1.5 px-1.5 text-right whitespace-nowrap ${INK2}`}>{s.holdingDays != null ? `${s.holdingDays} วัน` : '—'}</td>
                    <td className={`py-1.5 px-1.5 text-right whitespace-nowrap ${signCls(s.returnPct)}`}>{s.returnPct != null ? signed(s.returnPct) : '—'}</td>
                    <td className={`py-1.5 px-1.5 text-right whitespace-nowrap ${signCls(s.mfePct)}`}>{s.mfePct != null ? signed(s.mfePct) : '—'}</td>
                    <td className={`py-1.5 pl-1.5 text-right whitespace-nowrap ${signCls(s.maePct)}`}>{s.maePct != null ? signed(s.maePct) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className={`text-[13px] ${META} mt-1`}>ตอนนี้ = ผลถึงวันสแกนล่าสุด (แถวที่ปิดแล้ว = ผลตอนปิด) · สูงสุด/ลึกสุด นับจากราคาเข้า</p>
        </div>
      )}

      {stats.length > 0 && (
        <>
          <div className="flex items-center justify-between gap-3 flex-wrap mt-4 mb-2">
            <h4 className={`text-[12px] font-semibold ${INK}`}>สถิติ Report Card (ทุกหุ้น)</h4>
            <Link href="/report-card" className="text-[12px] text-[#8b9cff] hover:text-[#b4bfff]">Report Card →</Link>
          </div>
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full border-collapse text-[12px]" data-testid="stat-table">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className={`pb-2 pr-1.5 text-left font-medium ${META}`} />
                  {['ชนะ', 'เฉลี่ย', 'วิ่งไปก่อนสูงสุด', 'n'].map(h => (
                    <th key={h} className={`pb-2 px-1.5 text-right font-medium ${META} whitespace-nowrap`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {stats.map(s => (
                  <tr key={s.scan} data-scan={s.scan}>
                    <td className={`py-1.5 pr-1.5 text-left ${INK}`}>
                      <Link href={`/report-card/${s.scan}`} className="hover:text-[#b4bfff]">{s.label}</Link>
                      <span className={META}>
                        {s.stage ? ` · เข้าตอน ${s.stage}` : ` · ภาพรวม${s.entryStage && s.entryStage !== 'ไม่มีข้อมูล' ? ` (${s.entryStage} n < 30)` : ''}`}
                      </span>
                    </td>
                    <td className={`py-1.5 px-1.5 text-right whitespace-nowrap ${s.winRate == null ? INK : s.winRate >= 50 ? UP_TXT : DOWN_TXT}`}>{s.winRate != null ? `${s.winRate.toFixed(0)}%` : '—'}</td>
                    <td className={`py-1.5 px-1.5 text-right whitespace-nowrap ${signCls(s.avgReturn)}`}>{s.avgReturn != null ? signed(s.avgReturn) : '—'}</td>
                    <td className={`py-1.5 px-1.5 text-right whitespace-nowrap ${signCls(s.avgMfe)}`}>{s.avgMfe != null ? signed(s.avgMfe) : '—'}</td>
                    <td className={`py-1.5 pl-1.5 text-right whitespace-nowrap ${META}`}>{s.n.toLocaleString('en-US')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {summary && <Hint text={summary.text} testId="history-summary" />}
    </div>
  );
}

// ── ③ แรงเงิน & กลุ่ม ────────────────────────────────────────────────────────

function Sparkline({ series, color }: { series: (number | null)[]; color: string }) {
  const vals = series.filter((v): v is number => v != null);
  if (vals.length < 2) return null;
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const W = 200, H = 34, pad = 3;
  const x = (i: number) => (series.length === 1 ? W : (i / (series.length - 1)) * W);
  const y = (v: number) => (hi === lo ? H / 2 : H - pad - ((v - lo) / (hi - lo)) * (H - pad * 2));
  // ช่วงที่ไม่มีค่า → ตัดเส้น ไม่ลากผ่าน
  const segs: string[] = [];
  let cur: string[] = [];
  series.forEach((v, i) => {
    if (v == null) { if (cur.length) segs.push(cur.join(' ')); cur = []; return; }
    cur.push(`${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  });
  if (cur.length) segs.push(cur.join(' '));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-[34px] block" aria-hidden="true" data-testid="rs-sparkline">
      {segs.map((pts, i) => (
        <polyline key={i} points={pts} fill="none" stroke={color} strokeWidth={1.6} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      ))}
    </svg>
  );
}

export function MoneyFlowCard({ data }: { data: MoneyFlowData | null }) {
  if (!data) return null;
  const { today, d5, rs, nvdrDate } = data;
  const summary = moneyFlowSummary(data);
  const rsCls = rs?.latest == null ? INK : rs.latest >= 70 ? UP_TXT : rs.latest <= 40 ? DOWN_TXT : INK;
  const rsDelta = rs && rs.latest != null && rs.prev20 != null ? rs.latest - rs.prev20 : null;
  const arrow = rsDelta == null ? '' : rsDelta >= 3 ? ' ↑' : rsDelta <= -3 ? ' ↓' : ' →';
  const tileCount = (today ? 1 : 0) + (d5 ? 1 : 0) + (rs ? 1 : 0);
  const sparkColor = rs?.latest == null ? '#b4bac8' : rs.latest >= 70 ? '#1D9E75' : rs.latest <= 40 ? '#E24B4A' : '#b4bac8';
  const unit = <span className={`text-[13px] font-normal ${META}`}>ลบ.</span>;
  const fmtRs = (v: number) => (v % 1 === 0 ? v.toFixed(0) : v.toFixed(1));

  return (
    <div className={`${CARD} p-4 mt-4`} data-testid="card-flow">
      <CardHead
        title="แรงเงิน & กลุ่ม"
        question="เงินไหลเข้าหรือออก?"
        right={nvdrDate ? <span className={`text-[13px] ${META}`} data-testid="nvdr-date">NVDR ถึง {thShort(nvdrDate)}</span> : undefined}
      />
      <div className={`grid gap-2 ${tileCount >= 3 ? 'grid-cols-2 @md:grid-cols-3' : tileCount === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {today && (
          <MiniTile
            testId="nvdr-today"
            label="NVDR วันล่าสุด"
            value={<>{fmtMillion(today.net)} {unit}</>}
            valueCls={signCls(today.net)}
            sub={today.net > 0 ? 'ซื้อสุทธิ' : today.net < 0 ? 'ขายสุทธิ' : 'สุทธิ 0'}
          />
        )}
        {d5 && (
          <MiniTile
            testId="nvdr-5d"
            label="NVDR 5 วัน"
            value={<>{fmtMillion(d5.net)} {unit}</>}
            valueCls={signCls(d5.net)}
            sub={`ซื้อ ${fmtMillion(d5.buy, false)} · ขาย ${fmtMillion(d5.sell, false)}`}
          />
        )}
        {rs && (
          <MiniTile
            testId="rs-group"
            label={`RS กลุ่ม ${rs.group}`}
            value={rs.latest != null ? fmtRs(rs.latest) : '—'}
            valueCls={rsCls}
            sub={rs.prev20 != null ? `20 วันก่อน ${fmtRs(rs.prev20)}${arrow}` : undefined}
          />
        )}
      </div>
      {rs && (
        <div className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] items-center gap-3 mt-3">
          <span className={`text-[13px] ${META}`}>RS {rs.group} 20 วัน</span>
          <Sparkline series={rs.series} color={sparkColor} />
        </div>
      )}
      {rs?.level === 'sector' && (
        <p className={`text-[13px] ${META} mt-1`}>ไม่มีข้อมูล RS กลุ่มย่อย ใช้ทั้งกลุ่ม {rs.group} แทน</p>
      )}
      {summary && <Hint text={summary.text} testId="flow-summary" />}
      <p className={`text-[13px] ${META} mt-2`}>
        {today || d5 ? 'NVDR = ซื้อขายผ่าน Thai NVDR (มักใช้แทนแรงต่างชาติ) · ' : ''}RS กลุ่ม = ค่ากลาง RS ของหุ้นในกลุ่ม
      </p>
    </div>
  );
}
