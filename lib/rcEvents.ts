// Report Card แบบ "เหตุการณ์" (RS-7 + Martin Luk) — types + logic ล้วนของ data/scans/report_card_events.json
// data-engine tools/scanner/report_card_events.py เขียนไฟล์นี้ (แยกจาก report_card.json เดิม) · ตัวเลขเป็น % อยู่แล้ว
// ตัวโหลดไฟล์ (fs ตอน build) อยู่ที่ lib/rcEventsData.ts

export interface HorizonStat {
  n: number;
  pending: number;
  small_sample: boolean;
  avg: number | null;
  median: number | null;
  win_pct: number | null;
  set_avg?: number | null;
  excess_avg?: number | null;
  beat_set_pct?: number | null;
}

export interface Rs7BuyGroup {
  n_events: number;
  d5: HorizonStat; d10: HorizonStat; d20: HorizonStat;
  mfe_avg: number | null; mae_avg: number | null;
  small_sample: boolean;
  pattern?: number; name?: string; phase?: string;
}

export interface Rs7WatchGroup {
  n_entries: number; converted_pending: number; converted_pct: number | null; converted_n: number;
  d20: HorizonStat; small_sample: boolean;
  status?: string; pattern?: number; name?: string;
}

export interface LukLongGroup {
  n_events: number; pending: number; triggered: number; trigger_pct: number | null;
  stopped_entry_day: number; stopped_entry_day_pct: number | null;
  r_close: HorizonStat; r5: HorizonStat; r10: HorizonStat; r_stop: HorizonStat;
  mfe_avg: number | null; mae_avg: number | null; small_sample: boolean;
  setup?: string; regime?: string;
}

export interface LukWeakGroup {
  n_events: number; d1: HorizonStat; d5: HorizonStat; d10: HorizonStat;
  underperform_5_pct: number | null; small_sample: boolean; setup?: string;
}

export interface Rs7Recent { date: string; ticker: string; pattern: number; status: string; phase: string | null; entry: number | null; r5: number | null; r10: number | null; r20: number | null; source: string | null }
export interface LukRecent { date: string; symbol: string; setup: string; regime: string | null; triggered: boolean | null; entry: number | null; stopped_entry_day: boolean | null; r_close: number | null; r5: number | null; r10: number | null; r_stop: number | null; source: string | null }

export interface SourceRange { from: string; to: string; days: number }
export type Sources = { backfill: SourceRange | null; live: SourceRange | null };

export interface RcEventsData {
  generatedAt: string | null;
  asOf: string | null;
  smallSampleN: number;
  definitions: Record<string, string>;
  sources: { rs7?: Sources; luk?: Sources };
  rs7: {
    buy: { all: Rs7BuyGroup; by_pattern: Rs7BuyGroup[]; by_phase: Rs7BuyGroup[] } | null;
    watch: { all: Rs7WatchGroup; by_status: Rs7WatchGroup[]; by_pattern: Rs7WatchGroup[] } | null;
    recent: Rs7Recent[];
  };
  luk: {
    long: { all: LukLongGroup; by_setup: LukLongGroup[]; by_regime: LukLongGroup[] } | null;
    weak: { by_setup: LukWeakGroup[] } | null;
    recent: LukRecent[];
  };
  warnings: string[];
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const arr = <T,>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : []);

/** raw → RcEventsData · ไม่ใช่ไฟล์นี้ (ไม่มี generated_at / rs7 / luk) → null (หน้าขึ้น "ยังไม่มีข้อมูล") */
export function parseRcEvents(raw: unknown): RcEventsData | null {
  if (!isObj(raw) || typeof raw.generated_at !== 'string' || !isObj(raw.rs7) || !isObj(raw.luk)) return null;
  const rs7 = raw.rs7, luk = raw.luk;
  const buy = isObj(rs7.buy) && isObj(rs7.buy.all) ? (rs7.buy as unknown as NonNullable<RcEventsData['rs7']['buy']>) : null;
  const watch = isObj(rs7.watch) && isObj(rs7.watch.all) ? (rs7.watch as unknown as NonNullable<RcEventsData['rs7']['watch']>) : null;
  const long = isObj(luk.long) && isObj(luk.long.all) ? (luk.long as unknown as NonNullable<RcEventsData['luk']['long']>) : null;
  const weak = isObj(luk.weak) ? { by_setup: arr<LukWeakGroup>(luk.weak.by_setup) } : null;
  const defs: Record<string, string> = {};
  if (isObj(raw.definitions)) for (const [k, v] of Object.entries(raw.definitions)) if (typeof v === 'string') defs[k] = v;
  return {
    generatedAt: raw.generated_at, asOf: typeof raw.as_of === 'string' ? raw.as_of : null,
    smallSampleN: typeof raw.small_sample_n === 'number' ? raw.small_sample_n : 30,
    definitions: defs, sources: isObj(raw.sources) ? (raw.sources as RcEventsData['sources']) : {},
    rs7: buy || watch ? {
      buy: buy ? { all: buy.all, by_pattern: arr(buy.by_pattern), by_phase: arr(buy.by_phase) } : null,
      watch: watch ? { all: watch.all, by_status: arr(watch.by_status), by_pattern: arr(watch.by_pattern) } : null,
      recent: arr(rs7.recent),
    } : { buy: null, watch: null, recent: [] },
    luk: { long: long ? { all: long.all, by_setup: arr(long.by_setup), by_regime: arr(long.by_regime) } : null, weak, recent: arr(luk.recent) },
    warnings: arr<unknown>(raw.warnings).filter((w): w is string => typeof w === 'string'),
  };
}

// ── format ─────────────────────────────────────────────────────────────────
/** ค่าเป็น % อยู่แล้ว: 1.5 → "+1.5%" */
export function fmtP(x: number | null | undefined, digits = 1): string {
  if (x == null || !Number.isFinite(x)) return '—';
  const s = Math.abs(x).toFixed(digits);
  if (Number(s) === 0) return `${s}%`;
  return `${x > 0 ? '+' : '−'}${s}%`;
}
/** จุด % (ส่วนต่างเทียบ SET): 1.2 → "+1.2" */
export function fmtPt(x: number | null | undefined, digits = 1): string {
  if (x == null || !Number.isFinite(x)) return '—';
  const s = Math.abs(x).toFixed(digits);
  return Number(s) === 0 ? s : `${x > 0 ? '+' : '−'}${s}`;
}
/** อัตรา (win / trigger): 57.1 → "57%" */
export const fmtRate = (x: number | null | undefined): string => (x == null || !Number.isFinite(x) ? '—' : `${Math.round(x)}%`);
export const fmtInt = (n: number | null | undefined): string => (n == null ? '—' : n.toLocaleString('en-US'));
export const tone = (x: number | null | undefined): 'pos' | 'neg' | 'flat' => (x == null || !Number.isFinite(x) || x === 0 ? 'flat' : x > 0 ? 'pos' : 'neg');

export const PHASE_LABEL: Record<string, string> = { A: 'A ก่อนจุดต่ำ', B: 'B หลัง low ถึง FTD', C: 'C ขาขึ้นยืนยัน', neutral: 'ไม่อยู่ช่วงไหน' };
export const PHASE_READ: Record<string, string> = {
  A: 'ซื้อตอนตลาดยังลง ไม้เล็กเท่านั้น', B: 'ช่วง FTD มีทั้งรอบจริงและรอบหลอก', C: 'ช่วงที่ควรได้เปรียบที่สุด', neutral: 'นอกรอบปรับฐาน',
};
export const SETUP_LABEL: Record<string, string> = {
  LONG_PULLBACK: 'Long Pullback', EPISODIC_PIVOT: 'Episodic Pivot',
  SHORT_WEAK_BOUNCE: 'เด้งอ่อน (Weak bounce)', PARABOLIC_SHORT: 'วิ่งแนวตั้ง (Parabolic)',
};
export const STATUS_LABEL: Record<string, string> = {
  SETUP: 'SETUP', WATCH: 'WATCH', REST: 'REST', RUNNING: 'RUNNING', FIRST_PULLBACK: 'FIRST_PULLBACK',
  PIVOT_RESET: 'PIVOT_RESET', BASE_RESET: 'BASE_RESET',
};

// ── สรุปสำหรับการ์ดหน้า /report-card ──────────────────────────────────────
export interface Rs7Summary { n: number; d20: HorizonStat; best: Rs7BuyGroup | null; worst: Rs7BuyGroup | null }
/** ดีสุด = ผลเฉลี่ย 20 วันสูงสุดในกลุ่มที่ไม่ใช่ตัวอย่างน้อย · แย่สุด = ต่ำสุดในทุกกลุ่ม (ติดป้ายตัวอย่างน้อยได้) */
export function rs7Summary(d: RcEventsData): Rs7Summary | null {
  const b = d.rs7.buy;
  if (!b) return null;
  const withAvg = b.by_pattern.filter(g => g.d20?.avg != null);
  const big = withAvg.filter(g => !g.small_sample);
  const best = [...(big.length ? big : withAvg)].sort((a, c) => (c.d20.avg as number) - (a.d20.avg as number))[0] ?? null;
  const worst = [...withAvg].sort((a, c) => (a.d20.avg as number) - (c.d20.avg as number))[0] ?? null;
  return { n: b.all.n_events, d20: b.all.d20, best, worst: worst && best && worst.pattern === best.pattern ? null : worst };
}

export function lukPullback(d: RcEventsData): LukLongGroup | null {
  return d.luk.long?.by_setup.find(g => g.setup === 'LONG_PULLBACK') ?? null;
}

/** ข้อความช่วงข้อมูล: "ย้อนหลัง 10 ก.ย. 2024 – 22 ก.ค. 2026 (449 วัน) · จริง —" */
export function sourceText(s: Sources | undefined, fmt: (iso: string) => string): string {
  if (!s) return 'ยังไม่มีข้อมูล';
  const part = (label: string, r: SourceRange | null) => (r ? `${label} ${fmt(r.from)} – ${fmt(r.to)} (${r.days} วัน)` : `${label} ยังไม่มี`);
  return `${part('ย้อนหลัง (backfill)', s.backfill)} · ${part('บันทึกจริงรายวัน', s.live)}`;
}

export const PENDING_NOTE = 'pending = ยังไม่ครบระยะ ไม่นับในตัวเลข';
