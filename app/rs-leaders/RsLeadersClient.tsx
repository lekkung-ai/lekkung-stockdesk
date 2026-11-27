'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import FullWidthPage from '@/components/FullWidthPage';
import { breadthConfig } from '@/lib/breadthData';
import { formatShortThaiDate } from '@/lib/utils';
import {
  GROUP_RANK, PHASE_INFO, STATUS_MEANING, actionSentence, cfgNum, cfgPair, filterStocks, fmtCfgPct, fmtPct, fmtPrice,
  patternAvailability, patternCounts, patternName, phaseCondition, phaseKey, phaseNotes, sortStocks, statusGroup,
  type PhaseKey, type Rs7Data, type Rs7Pattern, type Rs7Stock, type StatusGroup,
} from '@/lib/rs7';
import Rs7Chart from './Rs7Chart';

const CARD = 'bg-[#13161e] border border-white/[0.07] rounded-xl';

const GROUP_CHIP: Record<StatusGroup, string> = {
  trigger: 'bg-[#14352a] text-[#86efac] border-[#166534]',
  setup: 'bg-[#1e293b] text-[#93c5fd] border-[#1e3a8a]',
  watch: 'bg-[#2a2410] text-[#fcd34d] border-[#713f12]',
  reset: 'bg-[#2e1065] text-[#c4b5fd] border-[#4c1d95]',
};

const PHASE_STYLE: Record<PhaseKey, { name: string; on: string }> = {
  A: { name: 'text-[#fca5a5]', on: 'bg-[#3b1418] border-[#7f1d1d] text-[#fecaca]' },
  B: { name: 'text-[#fcd34d]', on: 'bg-[#2a2410] border-[#713f12] text-[#fde68a]' },
  C: { name: 'text-[#86efac]', on: 'bg-[#14352a] border-[#166534] text-[#bbf7d0]' },
  neutral: { name: 'text-white/70', on: 'bg-white/10 border-white/20 text-white' },
};

const STAGE_COLOR: Record<string, { color: string; bg: string }> = {
  'S.Bull': { color: '#1D9E75', bg: 'rgba(29,158,117,.15)' },
  Bull: { color: '#4CAF50', bg: 'rgba(76,175,80,.15)' },
  Recovery: { color: '#EF9F27', bg: 'rgba(239,159,39,.15)' },
  Accumulation: { color: '#378ADD', bg: 'rgba(55,138,221,.15)' },
  Distribution: { color: '#BA7517', bg: 'rgba(186,117,23,.15)' },
  Warning: { color: '#EF9F27', bg: 'rgba(239,159,39,.15)' },
  Bear: { color: '#E24B4A', bg: 'rgba(226,75,74,.15)' },
};

const thaiDate = (iso: string | null | undefined): string => (iso ? `${formatShortThaiDate(iso)} ${Number(iso.slice(0, 4)) + 543}` : '-');

export default function RsLeadersClient({ data }: { data: Rs7Data | null }) {
  return (
    <FullWidthPage className="space-y-4">
      <div>
        <div className="text-[13px] text-white/50">SCANNER › RS Leaders (Minervini 7)</div>
        <h1 className="mt-1 text-[22px] font-extrabold text-white">RS Leaders · 7 รูปแบบหุ้นผู้นำ</h1>
        <p className="mt-1 text-[13px] text-white/60">
          ดูว่าตลาดอยู่ช่วงไหนของรอบ แล้วหาหุ้นผู้นำที่เหมาะกับช่วงนั้น · ราคา/RS ในตารางจากสแกนล่าสุด
          {data?.asOf && <span className="ml-2 text-white/80 font-semibold" data-testid="rs7-asof">ข้อมูลสแกน {thaiDate(data.asOf)}</span>}
        </p>
      </div>
      {!data && <Empty text="ยังไม่มีข้อมูล RS-7 · จะมาในรอบสแกนถัดไป" />}
      {data && !data.phase && (
        <>
          <Empty text="คำนวณช่วงดัชนีไม่สำเร็จในรอบสแกนล่าสุด · รอรอบสแกนถัดไป" />
          <Warnings warnings={data.warnings} />
        </>
      )}
      {data && data.phase && <Content data={data} />}
    </FullWidthPage>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className={`${CARD} p-8 text-center text-[15px] text-white/70`} data-testid="rs7-empty">{text}</div>
  );
}

function Warnings({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return null;
  return (
    <div className="text-[12px] text-white/40 space-y-0.5" data-testid="rs7-warnings">
      {warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
    </div>
  );
}

function Content({ data }: { data: Rs7Data }) {
  const phase = data.phase!;
  const key = phaseKey(phase);
  const [filterId, setFilterId] = useState<number | null>(null);
  const counts = useMemo(() => patternCounts(data.stocks), [data.stocks]);
  const rows = useMemo(
    () => sortStocks(filterStocks(data.stocks, filterId), filterId),
    [data.stocks, filterId],
  );

  return (
    <>
      <PhaseCard data={data} />
      {data.series.length > 0 && (
        <section className={`${CARD} p-4`}>
          <h2 className="text-[15px] font-extrabold text-white mb-2">หุ้นที่เข้ารูปแบบ 1–3 ต่อวัน เทียบ SET</h2>
          <Rs7Chart series={data.series} />
        </section>
      )}
      <PatternCards data={data} counts={counts} filterId={filterId} onFilter={setFilterId} />
      <StockTable data={data} rows={rows} filterId={filterId} phase={key} onClear={() => setFilterId(null)} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Criteria data={data} />
        <StatusMeaning />
      </div>
      <Warnings warnings={data.warnings} />
    </>
  );
}

// ── การ์ดช่วงดัชนี ─────────────────────────────────────────────────────────
function PhaseCard({ data }: { data: Rs7Data }) {
  const p = data.phase!;
  const key = phaseKey(p);
  const info = PHASE_INFO[key];
  const style = PHASE_STYLE[key];
  const f = p.last_ftd;
  return (
    <section className={`${CARD} p-4`} data-testid="rs7-phase" data-phase={key}>
      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <div>
          <div className="text-[12px] font-semibold text-white/50">ดัชนีตอนนี้อยู่ช่วง</div>
          <div className={`mt-0.5 text-[24px] font-bold ${style.name}`}>
            {key === 'neutral' ? info.name : `${info.letter} · ${info.name}`}
          </div>
          <div className="mt-1 text-[15px] text-white">{info.sentence}</div>
          <div className="mt-0.5 text-[13px] text-white/55">{phaseCondition(key, data.config)}</div>
          <div className="mt-3 flex flex-wrap gap-x-7 gap-y-3">
            <Fact k="ห่าง high 52 สัปดาห์" v={fmtPct(p.idx_dd)} h={`high ${fmtPrice(p.idx_high)} · ${thaiDate(p.idx_high_date)}`} />
            <Fact
              k="เหนือจุดต่ำ" v={fmtPct(p.above_low)}
              h={`low ${fmtPrice(p.idx_low)} · ${thaiDate(p.idx_low_date)}${p.bars_since_low != null ? ` (${p.bars_since_low} วันก่อน)` : ''}`}
            />
            <Fact
              k="FTD ล่าสุด (เกณฑ์เดิมของระบบ)" v={f ? thaiDate(f.date) : 'ยังไม่มี'}
              h={f ? `วันที่ ${f.rally_day} ของ rally · ${f.bars_ago} วันก่อน` : 'ยังไม่เคยเกิดในช่วงข้อมูล'}
            />
            <Fact k="ช่วงนี้เริ่มเมื่อ" v={thaiDate(p.since)} h={p.date ? `SET ${fmtPrice(p.idx_close)} · ${thaiDate(p.date)}` : ''} />
          </div>
        </div>
        <div>
          <div className="text-[12px] font-semibold text-white/50">ตำแหน่งในรอบตลาด</div>
          <div className="mt-1.5 flex gap-1.5" data-testid="rs7-steps">
            {(['A', 'B', 'C'] as const).map(k => (
              <div
                key={k}
                data-on={key === k}
                className={`flex-1 rounded-lg border px-2.5 py-2 text-[13px] ${
                  key === k ? PHASE_STYLE[k].on : 'bg-[#1a1e29] border-transparent text-white/55'
                }`}
              >
                <b className="block text-[14px] text-white">{PHASE_INFO[k].letter} {PHASE_INFO[k].name}</b>
                หา {PHASE_INFO[k].look.join(' · ')}
              </div>
            ))}
          </div>
          <div className="mt-2.5 rounded-lg bg-[#1a1e29] px-3 py-2.5 text-[14px] text-white/85">
            <span className="text-white/50">ช่วงนี้หาแบบ </span>
            {info.look.map(id => (
              <span key={id} className="inline-block mr-1.5 px-2 rounded-md bg-white/10 font-semibold text-white">
                {id} {patternName(data, id)}
              </span>
            ))}
            <div className="mt-1.5"><span className="text-white/50">ควรทำ: </span>{info.doText}</div>
          </div>
        </div>
      </div>
      <div className="mt-3 space-y-0.5 text-[13px] text-white/45" data-testid="rs7-phase-notes">
        {phaseNotes(key).map(t => <div key={t}>{t}</div>)}
      </div>
    </section>
  );
}

function Fact({ k, v, h }: { k: string; v: string; h?: string }) {
  return (
    <div>
      <div className="text-[12px] text-white/45">{k}</div>
      <div className="text-[16px] font-bold text-white tabular-nums">{v}</div>
      {h && <div className="text-[12px] text-white/55">{h}</div>}
    </div>
  );
}

// ── การ์ด 8 ใบ ─────────────────────────────────────────────────────────────
const CARD_NOTE: Record<number, string> = {
  1: 'ช่วง A', 2: 'ช่วง B', 3: 'ช่วง C', 4: 'ดัชนีอ่อน', 5: 'หลัง low', 6: 'เด้งแล้ว', 7: 'ทุกช่วง',
};

function PatternCards({ data, counts, filterId, onFilter }: {
  data: Rs7Data; counts: ReturnType<typeof patternCounts>; filterId: number | null; onFilter: (id: number | null) => void;
}) {
  const total = data.stocks.length;
  const toggle = (id: number) => onFilter(filterId === id ? null : id);
  return (
    <section>
      <div className="flex gap-2 overflow-x-auto pb-2 lg:grid lg:grid-cols-8 lg:overflow-visible" data-testid="rs7-cards">
        <button
          type="button"
          onClick={() => onFilter(null)}
          aria-pressed={filterId == null}
          data-card="all"
          className={`min-w-[132px] lg:min-w-0 shrink-0 text-left rounded-[10px] border px-3 py-2.5 cursor-pointer ${
            filterId == null ? 'bg-[#1a1e29] border-white/30' : 'bg-[#13161e] border-white/[0.07]'
          }`}
        >
          <div className="text-[12px] text-white/45">ทั้งหมด</div>
          <div className="text-[14px] font-bold text-white">ทุกรูปแบบ</div>
          <div className="mt-0.5 text-[22px] font-bold text-white tabular-nums">{total}</div>
          <div className="text-[12px] text-white/55">ตัวที่เข้าอย่างน้อย 1 แบบ</div>
        </button>
        {[1, 2, 3, 4, 5, 6, 7].map(id => {
          const c = counts[id];
          const av = patternAvailability(id, data.phase, data.series, data.config);
          const faded = !av.available && c.total === 0;
          return (
            <button
              key={id}
              type="button"
              onClick={() => toggle(id)}
              aria-pressed={filterId === id}
              data-card={id}
              data-faded={faded}
              className={`min-w-[132px] lg:min-w-0 shrink-0 text-left rounded-[10px] border px-3 py-2.5 cursor-pointer ${
                filterId === id ? 'bg-[#1a1e29] border-white/30' : 'bg-[#13161e] border-white/[0.07]'
              } ${faded ? 'opacity-55' : ''}`}
            >
              <div className="text-[12px] text-white/45">{id} · {CARD_NOTE[id]}</div>
              <div className="text-[14px] font-bold text-white">{patternName(data, id)}</div>
              <div className="mt-0.5 text-[22px] font-bold text-white tabular-nums">{faded ? '–' : c.total}</div>
              <div className="text-[12px] text-white/55">{faded ? av.wait : cardBreakdown(id, c)}</div>
            </button>
          );
        })}
      </div>
      <div className="text-[13px] text-white/45">
        การ์ดที่จางคือรูปแบบที่ช่วงดัชนีตอนนี้ยังเกิดไม่ได้ · กดการ์ดเพื่อกรองตาราง · หุ้นตัวเดียวติดได้หลายรูปแบบ
      </div>
    </section>
  );
}

function cardBreakdown(id: number, c: ReturnType<typeof patternCounts>[number]): string {
  if (c.total === 0) return 'ไม่มีตัวเข้า';
  if (id === 7) return [c.pivot ? `pivot ${c.pivot}` : '', c.base ? `base ${c.base}` : ''].filter(Boolean).join(' · ');
  return (['trigger', 'setup', 'watch'] as const)
    .filter(g => c.groups[g] > 0)
    .map(g => `${g} ${c.groups[g]}`)
    .join(' · ');
}

// ── ตาราง ──────────────────────────────────────────────────────────────────
const TH = 'px-2 py-2 text-[12px] font-medium text-white/45 whitespace-nowrap border-b border-white/[0.07]';
const TD = 'px-2 py-2.5 border-b border-white/[0.05] align-top';

function StockTable({ data, rows, filterId, phase, onClear }: {
  data: Rs7Data; rows: Rs7Stock[]; filterId: number | null; phase: PhaseKey; onClear: () => void;
}) {
  const antsWin = cfgNum(data.config, 'ants_win');
  return (
    <section className={`${CARD} p-4`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-extrabold text-white">
          รายชื่อหุ้น {filterId != null && <span className="text-white/60 font-semibold">· เฉพาะ {filterId} {patternName(data, filterId)}</span>}
          <span className="ml-2 text-[13px] font-normal text-white/50" data-testid="rs7-row-count">{rows.length} ตัว</span>
        </h2>
        {filterId != null && (
          <button type="button" onClick={onClear} className="text-[13px] text-[#93c5fd] cursor-pointer hover:underline">ล้างตัวกรอง</button>
        )}
      </div>
      {rows.length === 0 ? (
        <div className="py-8 text-center text-[14px] text-white/55" data-testid="rs7-no-rows">ไม่มีหุ้นเข้ารูปแบบนี้ในสแกนวันนี้</div>
      ) : (
        <div className="mt-2 overflow-x-auto" data-testid="rs7-table-wrap">
          <table className="w-full text-[14px] border-collapse min-w-[1040px]" data-testid="rs7-table">
            <thead>
              <tr className="text-right">
                <th className={`${TH} text-left sticky left-0 z-10 bg-[#13161e]`}>หุ้น</th>
                <th className={`${TH} text-left`}>รูปแบบ · สถานะ</th>
                <th className={TH}>ราคา</th>
                <th className={TH}>RS Rating</th>
                <th className={TH}>ห่าง high</th>
                <th className={TH}>RS line ห่าง high</th>
                <th className={TH}>ฐาน 10 วัน</th>
                <th className={TH}>มด {antsWin ?? 15} วัน</th>
                <th className={TH}>Trend Template</th>
                <th className={`${TH} text-left`}>Stage</th>
                <th className={`${TH} text-left`}>ทำอะไรต่อ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(s => <StockRow key={s.ticker} s={s} data={data} filterId={filterId} phase={phase} />)}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-3 text-[13px] text-white/45">
        RS Rating / Stage / Trend Template = ค่าเดิมของระบบ (ตัวเดียวกับหน้า SEPA) · RS line = ราคาหุ้น ÷ SET ·
        &quot;มด&quot; = จำนวนวันปิดบวกในช่วงล่าสุด (≥ 12 ดีมาก) · กดชื่อหุ้น → /stock
      </div>
    </section>
  );
}

function StockRow({ s, data, filterId, phase }: { s: Rs7Stock; data: Rs7Data; filterId: number | null; phase: PhaseKey }) {
  const pats: Rs7Pattern[] = filterId == null ? s.patterns : s.patterns.filter(p => p.id === filterId);
  const sorted = [...pats].sort((a, b) => GROUP_RANK[statusGroup(a.status)] - GROUP_RANK[statusGroup(b.status)] || a.id - b.id);
  const stage = s.stage ? STAGE_COLOR[s.stage] : null;
  const ttFull = s.tt != null && s.tt.pass === s.tt.total;
  return (
    <tr data-ticker={s.ticker} className="hover:bg-white/[0.02]">
      <td className={`${TD} sticky left-0 z-10 bg-[#13161e]`}>
        <Link href={`/stock/${encodeURIComponent(s.ticker)}`} className="font-bold text-[#60a5fa] hover:underline">{s.ticker}</Link>
        {s.sector && <div className="text-[12px] text-white/40">{s.sector}</div>}
      </td>
      <td className={TD}>
        {sorted.map(p => (
          <span
            key={`${p.id}-${p.status}`}
            data-chip={statusGroup(p.status)}
            className={`inline-block mr-1 my-0.5 px-2 py-px rounded-md border text-[12px] font-bold whitespace-nowrap ${GROUP_CHIP[statusGroup(p.status)]}`}
          >
            {p.id} {patternName(data, p.id)} · {p.status}
          </span>
        ))}
      </td>
      <td className={`${TD} text-right tabular-nums font-semibold text-[#7dd3fc]`}>{fmtPrice(s.close)}</td>
      <td className={`${TD} text-right tabular-nums`}>{s.rs_rating ?? '-'}</td>
      <td className={`${TD} text-right tabular-nums`}>{fmtPct(s.dist_hi)}</td>
      <td className={`${TD} text-right tabular-nums`}>
        {fmtPct(s.rs_gap)}{s.rs_nh && <span className="ml-1 text-[12px] font-bold text-[#7dd3fc]" title="RS line ทำ new high 52 สัปดาห์">NH</span>}
      </td>
      <td className={`${TD} text-right tabular-nums`}>{fmtPct(s.tight10, 1, false)}</td>
      <td className={`${TD} text-right tabular-nums`}>{s.ants15 ?? '-'}</td>
      <td className={`${TD} text-right tabular-nums ${ttFull ? 'text-[#22c55e]' : 'text-white/45'}`}>
        {s.tt ? `${ttFull ? '✓ ' : ''}${s.tt.pass}/${s.tt.total}` : '-'}
      </td>
      <td className={TD}>
        {s.stage ? (
          <span className="inline-block px-2 py-px rounded-md text-[12px] font-bold" style={{ color: stage?.color ?? '#9CA3AF', background: stage?.bg ?? 'rgba(156,163,175,.15)' }}>{s.stage}</span>
        ) : '-'}
      </td>
      <td className={`${TD} text-[13px] text-white/65 min-w-[230px] max-w-[330px]`}>
        {sorted.map(p => (
          <div key={`${p.id}-${p.status}`} className={sorted.length > 1 ? 'mb-1' : ''}>
            {sorted.length > 1 && <b className="text-white/80">{p.id}: </b>}
            {actionSentence(s, p, phase, data.config)}
          </div>
        ))}
      </td>
    </tr>
  );
}

// ── เกณฑ์ที่ใช้ (จาก config{} ในไฟล์) ───────────────────────────────────────
const CONFIG_GROUPS: { title: string; prefixes: string[] }[] = [
  { title: '1 Predictive', prefixes: ['pred_'] },
  { title: '2 Coincident', prefixes: ['coin_'] },
  { title: '3 Confirming', prefixes: ['conf_'] },
  { title: '4 Sore thumbs', prefixes: ['sore_'] },
  { title: '5 Fast rebound', prefixes: ['fast_'] },
  { title: '6 Lead and rest', prefixes: ['rest_'] },
  { title: '7 Failure reset', prefixes: ['piv_', 'base_'] },
];

const fmtVal = (v: unknown): string => (Array.isArray(v) ? v.join('–') : String(v));

function Criteria({ data }: { data: Rs7Data }) {
  const c = data.config;
  const bo = cfgPair(c, 'phase_b_bsl');
  const groups = CONFIG_GROUPS.map(g => ({
    ...g, items: Object.entries(c).filter(([k]) => g.prefixes.some(p => k.startsWith(p))),
  })).filter(g => g.items.length);
  return (
    <section className={`${CARD} p-4`} data-testid="rs7-criteria">
      <h2 className="text-[15px] font-extrabold text-white">เกณฑ์ที่ใช้ <span className="text-[13px] font-normal text-white/50">(ยังไม่ backtest · ปรับได้จากไฟล์ตั้งค่าที่เดียว)</span></h2>
      <ul className="mt-2 space-y-1.5 text-[13px] text-white/60 list-disc pl-5">
        <li><b className="text-white/85">ปรับฐาน</b> ดัชนีลงจาก high ≥ {fmtCfgPct(cfgNum(c, 'corr_th'))} · ช่วง A ใกล้ low ≤ {fmtCfgPct(cfgNum(c, 'near_low'))}</li>
        <li>
          <b className="text-white/85">FTD</b> ใช้เกณฑ์เดิมของระบบ (≥ {breadthConfig.ftd_min_gain_pct}% วันที่ {breadthConfig.ftd_window_start_day}–{breadthConfig.ftd_window_end_day} ของการเด้ง)
          ไม่มี FTD ชุดที่สอง{bo ? ` · ช่วง B = ${bo[0]}–${bo[1]} วันหลัง low` : ''}
        </li>
        <li><b className="text-white/85">เบรก</b> ปิดเหนือ pivot {cfgNum(c, 'pivot_win') ?? '?'} วัน + วอลุ่ม ≥ {cfgNum(c, 'vol_mult') ?? '?'} × เฉลี่ย {cfgNum(c, 'vol_avg_win') ?? '?'} วัน</li>
        <li>
          <b className="text-white/85">หุ้นที่สแกน</b> ราคา ≥ {cfgNum(c, 'min_price') ?? '?'} บาท · มูลค่าเฉลี่ย {cfgNum(c, 'vol_avg_win') ?? '?'} วัน ≥ {cfgNum(c, 'min_adtv_mb') ?? '?'} ลบ. · ประวัติ ≥ {cfgNum(c, 'min_bars') ?? '?'} วัน
        </li>
        <li><b className="text-white/85">Trend Template</b> + RS Rating ≥ {cfgNum(c, 'rs_rating_min') ?? '?'} ตามหน้า SEPA · RS line = ราคาหุ้น ÷ SET</li>
      </ul>
      <details className="mt-3 text-[13px] text-white/60">
        <summary className="cursor-pointer text-[#93c5fd]">ดูตัวเลขรายรูปแบบทั้งหมด (จาก config ในไฟล์ rs7.json)</summary>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {groups.map(g => (
            <div key={g.title}>
              <div className="font-semibold text-white/80">{g.title}</div>
              <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                {g.items.map(([k, v]) => <span key={k} className="tabular-nums"><span className="text-white/45">{k}</span> {fmtVal(v)}</span>)}
              </div>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}

function StatusMeaning() {
  return (
    <section className={`${CARD} p-4`} data-testid="rs7-status-meaning">
      <h2 className="text-[15px] font-extrabold text-white">ความหมายสถานะ</h2>
      <ul className="mt-2 space-y-2 text-[13px] text-white/60">
        {STATUS_MEANING.map(m => (
          <li key={m.label} className="flex items-start gap-2">
            <span className={`shrink-0 inline-block px-2 py-px rounded-md border text-[12px] font-bold ${GROUP_CHIP[m.group]}`}>{m.label}</span>
            <span>{m.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
