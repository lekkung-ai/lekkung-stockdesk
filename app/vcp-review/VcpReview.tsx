'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Copy, RotateCcw, ExternalLink } from 'lucide-react';
import rawSepa from '@/data/scans/sepa.json';
import { getScanGeneratedAt } from '@/lib/scanGeneratedAt';
import VcpChart, { tradingViewUrl } from '@/components/VcpChart';
import { buildReviewGroups, toVcpRows, type ReviewGroup, type VcpRow } from './groups';

// เครื่องมือชั่วคราว: ติ๊กว่า VCP footprint ที่ scanner ตรวจพบตรงกับกราฟจริงไหม
// render ฝั่ง client เท่านั้น (page.tsx โหลดด้วย ssr:false) → อ่าน localStorage ตอน init ได้เลย

type Verdict = 'ok' | 'bad' | 'unsure';
interface Answer { verdict?: Verdict; note?: string; }
interface Saved { answers: Record<string, Answer>; index: number; }

const VERDICTS: { key: Verdict; hotkey: string; label: string; cls: string }[] = [
  { key: 'ok', hotkey: '1', label: '✅ ตรง', cls: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20' },
  { key: 'bad', hotkey: '2', label: '❌ เพี้ยน', cls: 'border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20' },
  { key: 'unsure', hotkey: '3', label: '⚠️ ก้ำกึ่ง', cls: 'border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20' },
];
const VERDICT_TEXT: Record<Verdict, string> = { ok: '✅ ตรง', bad: '❌ เพี้ยน', unsure: '⚠️ ก้ำกึ่ง' };

const DATA_DATE = getScanGeneratedAt('sepa')?.slice(0, 10) ?? 'unknown';
const STORAGE_KEY = `vcp-review:${DATA_DATE}`;
const GROUPS: ReviewGroup[] = buildReviewGroups(toVcpRows(rawSepa as unknown[]));
const ITEMS: { group: ReviewGroup; row: VcpRow }[] = GROUPS.flatMap(group => group.rows.map(row => ({ group, row })));

function loadSaved(): Saved {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<Saved>;
      const index = typeof s.index === 'number' ? Math.min(Math.max(0, s.index), Math.max(0, ITEMS.length - 1)) : 0;
      return { answers: s.answers && typeof s.answers === 'object' ? s.answers : {}, index };
    }
  } catch { /* storage ถูกบล็อก / JSON เสีย → เริ่มว่าง */ }
  return { answers: {}, index: 0 };
}

const isNoBase = (r: VcpRow) => r.Footprint === 'no base' || r.Weeks == null;

function explainFootprint(r: VcpRow): string {
  if (isNoBase(r)) return 'ไม่มีฐาน';
  const parts = [`ฐาน ${Math.round(r.Weeks!)} สัปดาห์`];
  if (r.MaxDepth != null) parts.push(`ย่อลึกสุด ${Math.round(r.MaxDepth)}%`);
  if (r.FinalDepth != null) parts.push(`ย่อรอบสุดท้าย ${Math.round(r.FinalDepth)}%`);
  if (r.T != null) parts.push(`หดตัว ${r.T} ครั้ง`);
  return parts.join(' · ');
}

const fmt = (v: number | null, digits = 2, suffix = '') => (v == null ? '—' : `${v.toFixed(digits)}${suffix}`);

function buildReport(answers: Record<string, Answer>): string {
  const done = ITEMS.filter(i => answers[i.row.Ticker]?.verdict).length;
  const lines = [`VCP Review · ข้อมูลวันที่ ${DATA_DATE} · ตรวจแล้ว ${done}/${ITEMS.length}`];
  for (const g of GROUPS) {
    lines.push('', `${g.id} ${g.name}`);
    if (!g.rows.length) { lines.push('(ไม่มีในข้อมูลวันนี้)'); continue; }
    lines.push('Symbol | footprint | ToPivot | VolRatio | ผล | หมายเหตุ');
    for (const r of g.rows) {
      const a = answers[r.Ticker] ?? {};
      lines.push([
        r.Ticker, r.Footprint || '—', fmt(r.ToPivot, 1, '%'), fmt(r.VolRatio),
        a.verdict ? VERDICT_TEXT[a.verdict] : '—', a.note?.trim().replace(/\s+/g, ' ') || '',
      ].join(' | '));
    }
  }
  return lines.join('\n');
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch { return false; }
  }
}

function Field({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 border-b border-white/[0.05] last:border-0">
      <span className="text-[11px] text-white/35">{label}</span>
      <span className={`text-[13px] tabular-nums font-medium ${tone ?? 'text-white/80'}`}>{value}</span>
    </div>
  );
}

export default function VcpReview() {
  const [saved, setSaved] = useState<Saved>(loadSaved);
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'fail'>('idle');
  const { answers, index } = saved;

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); } catch { /* ignore */ }
  }, [saved]);

  const go = useCallback((delta: number) => {
    setSaved(s => ({ ...s, index: Math.min(Math.max(0, s.index + delta), ITEMS.length - 1) }));
  }, []);

  const jump = (i: number) => setSaved(s => ({ ...s, index: i }));

  const answer = useCallback((verdict: Verdict) => {
    setSaved(s => {
      const t = ITEMS[s.index]?.row.Ticker;
      if (!t) return s;
      return {
        answers: { ...s.answers, [t]: { ...s.answers[t], verdict } },
        index: Math.min(s.index + 1, ITEMS.length - 1),
      };
    });
  }, []);

  const setNote = (note: string) => {
    setSaved(s => {
      const t = ITEMS[s.index].row.Ticker;
      return { ...s, answers: { ...s.answers, [t]: { ...s.answers[t], note } } };
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      const v = VERDICTS.find(x => x.hotkey === e.key);
      if (v) { e.preventDefault(); answer(v.key); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [answer, go]);

  const doneCount = useMemo(() => ITEMS.filter(i => answers[i.row.Ticker]?.verdict).length, [answers]);

  const onCopy = async () => {
    const ok = await copyText(buildReport(answers));
    setCopyState(ok ? 'ok' : 'fail');
    setTimeout(() => setCopyState('idle'), 2000);
  };

  const onReset = () => {
    if (!window.confirm('ล้างคำตอบทั้งหมดของข้อมูลวันนี้ แล้วเริ่มใหม่?')) return;
    setSaved({ answers: {}, index: 0 });
  };

  if (!ITEMS.length) {
    return <p className="text-[13px] text-white/50">ไม่มีหุ้นเข้ากลุ่มไหนเลยในข้อมูลวันที่ {DATA_DATE}</p>;
  }

  const { group, row } = ITEMS[index];
  const current = answers[row.Ticker] ?? {};
  const noBase = isNoBase(row);
  const pct = Math.round((doneCount / ITEMS.length) * 100);

  return (
    <div className="space-y-4" data-testid="vcp-review">
      {/* หัว + ความคืบหน้า */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[18px] font-bold text-white">VCP Review</h1>
          <p className="text-[12px] text-white/35 mt-0.5">
            ตรวจความแม่นของ VCP footprint จาก scanner · ข้อมูลวันที่ {DATA_DATE}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-[12px] text-white/70 hover:bg-white/[0.06]"
          >
            <Copy size={13} />
            {copyState === 'ok' ? 'คัดลอกแล้ว' : copyState === 'fail' ? 'คัดลอกไม่ได้' : 'คัดลอกผล'}
          </button>
          <button
            onClick={onReset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-[12px] text-white/50 hover:bg-white/[0.06]"
          >
            <RotateCcw size={13} /> เริ่มใหม่
          </button>
        </div>
      </div>

      <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-3 text-[12px]">
          <span className="text-white/70" data-testid="progress">
            ตรวจแล้ว <b className="text-white tabular-nums">{doneCount}</b> / <span className="tabular-nums">{ITEMS.length}</span>
          </span>
          <span className="text-white/45 truncate">
            ตัวที่ {index + 1} · <span className="text-white/80 font-medium">{group.id} {group.name}</span>
          </span>
        </div>
        <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
          <div className="h-full bg-emerald-500/70 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex flex-wrap gap-1.5" data-testid="group-chips">
          {GROUPS.map(g => {
            const first = ITEMS.findIndex(i => i.group.id === g.id);
            const gDone = g.rows.filter(r => answers[r.Ticker]?.verdict).length;
            const active = g.id === group.id;
            if (!g.rows.length) {
              return (
                <span key={g.id} data-group={g.id} className="px-2 py-1 rounded-md text-[11px] text-white/25 border border-dashed border-white/10">
                  {g.id} {g.name} · ไม่มีในข้อมูลวันนี้
                </span>
              );
            }
            return (
              <button
                key={g.id}
                data-group={g.id}
                data-tickers={g.rows.map(r => r.Ticker).join(',')}
                onClick={() => jump(first)}
                className={`px-2 py-1 rounded-md text-[11px] border transition-colors ${
                  active ? 'border-sky-400/50 bg-sky-400/10 text-sky-200' : 'border-white/10 text-white/50 hover:bg-white/[0.05]'
                }`}
              >
                {g.id} {g.name} <span className="tabular-nums text-white/35">{gDone}/{g.rows.length}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* คำถามของกลุ่ม */}
      <div className="rounded-xl border border-sky-400/20 bg-sky-400/[0.05] px-4 py-3">
        <p className="text-[11px] text-sky-300/60">{group.id} {group.name}</p>
        <p className="text-[18px] md:text-[20px] font-semibold text-white leading-snug" data-testid="question">{group.question}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-4">
        <VcpChart
          key={row.Ticker}
          ticker={row.Ticker}
          pivot={noBase ? null : row.Pivot}
          weeks={noBase ? null : row.Weeks}
        />

        <div className="space-y-3 min-w-0">
          <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[22px] font-bold text-white" data-testid="ticker">
                {row.Ticker}
                {row.LowLiquidity && <span className="ml-2 text-[13px] text-amber-400" title="Low liquidity">⚑ สภาพคล่องต่ำ</span>}
              </span>
              <a
                href={tradingViewUrl(row.Ticker)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[11px] text-sky-400 hover:underline shrink-0"
              >
                เปิดใน TradingView <ExternalLink size={11} />
              </a>
            </div>
            <div className="mt-2 rounded-lg bg-white/[0.04] px-3 py-2">
              <p className="text-[15px] font-mono text-white">{row.Footprint || '—'}</p>
              <p className="text-[12px] text-white/55 mt-0.5">{explainFootprint(row)}</p>
            </div>
            <div className="mt-2">
              <Field label="RS Rating" value={row.RS} />
              <Field label="Pivot" value={fmt(row.Pivot)} />
              <Field
                label="ToPivot"
                value={fmt(row.ToPivot, 1, '%')}
                tone={row.ToPivot != null && row.ToPivot < 0 ? 'text-amber-300' : undefined}
              />
              <Field label="% From High" value={fmt(row.FromHigh, 2, '%')} />
              <Field
                label="VolRatio"
                value={fmt(row.VolRatio)}
                tone={row.VolRatio == null ? undefined : row.VolRatio < 1 ? 'text-emerald-300' : 'text-red-300'}
              />
              <Field
                label="Contracting"
                value={row.Contracting == null ? '—' : row.Contracting ? 'True' : 'False'}
              />
            </div>
          </div>

          <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-4 space-y-2.5">
            <div className="grid grid-cols-3 lg:grid-cols-1 gap-2">
              {VERDICTS.map(v => (
                <button
                  key={v.key}
                  onClick={() => answer(v.key)}
                  data-verdict={v.key}
                  className={`py-3 rounded-lg border text-[15px] font-semibold transition-colors ${v.cls} ${
                    current.verdict === v.key ? 'ring-2 ring-white/60' : ''
                  }`}
                >
                  {v.label} <span className="text-[10px] opacity-50 font-normal">[{v.hotkey}]</span>
                </button>
              ))}
            </div>
            <textarea
              value={current.note ?? ''}
              onChange={e => setNote(e.target.value)}
              placeholder="หมายเหตุ (ไม่บังคับ)"
              rows={2}
              className="w-full resize-y rounded-lg bg-white/[0.04] border border-white/10 px-3 py-2 text-[13px] text-white placeholder:text-white/25 focus:outline-none focus:border-sky-400/40"
            />
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => go(-1)}
                disabled={index === 0}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-white/10 text-[12px] text-white/60 hover:bg-white/[0.06] disabled:opacity-30"
              >
                <ChevronLeft size={14} /> ย้อนกลับ
              </button>
              <span className="text-[10px] text-white/25 text-center">1/2/3 ตอบ · ← → เลื่อน</span>
              <button
                onClick={() => go(1)}
                disabled={index === ITEMS.length - 1}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-white/10 text-[12px] text-white/60 hover:bg-white/[0.06] disabled:opacity-30"
              >
                ถัดไป <ChevronRight size={14} />
              </button>
            </div>
            {doneCount === ITEMS.length && (
              <p className="text-[12px] text-emerald-300/80 text-center">ตรวจครบแล้ว — กด “คัดลอกผล” ด้านบน</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
