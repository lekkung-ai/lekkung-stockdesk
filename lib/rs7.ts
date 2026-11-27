// /rs-leaders — RS Leaders (Minervini 7 รูปแบบหุ้นผู้นำ): types + logic ล้วน (ไม่มี I/O) ของ data/scans/rs7.json
// data-engine tools/scanner/scan_rs7.py เขียนไฟล์นี้ · เกณฑ์ตัวเลขทั้งหมดมาจาก config{} ในไฟล์ (ไม่พิมพ์ซ้ำในโค้ด)
// ตัวโหลดไฟล์ (fs) อยู่ที่ lib/rs7Data.ts

export type Rs7Config = Record<string, unknown>;

export interface Rs7Pattern { id: number; key: string; status: string }

export interface Rs7Reset {
  type: 'pivot' | 'base';
  bo_date?: string | null;
  bo_age?: number | null;
  bo_volx?: number | null;
  old_pivot?: number | null;
  base_low?: number | null;
  new_low?: number | null;
  broken_low?: number | null;
  new_base_high?: number | null;
}

export interface Rs7Stock {
  ticker: string;
  sector: string | null;
  stage: string | null;
  patterns: Rs7Pattern[];
  close: number | null;
  rs_rating: number | null;
  dist_hi: number | null;
  rs_gap: number | null;
  rs_nh: boolean;
  tight10: number | null;
  ants15: number | null;
  tt: { pass: number; total: number } | null;
  pivot: number | null;
  to_pivot: number | null;
  volx: number | null;
  adtv_mb: number | null;
  reset: Rs7Reset | null;
}

export interface Rs7Phase {
  today: 'A' | 'B' | 'C' | 'neutral';
  since: string | null;
  date: string | null;
  idx_close: number | null;
  idx_dd: number | null;
  idx_high: number | null;
  idx_high_date: string | null;
  idx_low: number | null;
  idx_low_date: string | null;
  above_low: number | null;
  bars_since_low: number | null;
  corr_recent: boolean;
  idx_above_sma50: boolean;
  last_ftd: { date: string; rally_day: number; bars_ago: number; pct: number | null } | null;
}

export interface Rs7SeriesRow {
  date: string;
  set_close: number;
  phase: string; // 'A' | 'B' | 'C' | '-'
  n1: number; n2: number; n3: number;
  n_sectors_123: number;
  n_all: number;
}

export interface Rs7Data {
  generatedAt: string | null;
  asOf: string | null;
  config: Rs7Config;
  patternNames: Record<number, string>;
  phase: Rs7Phase | null; // null = คำนวณช่วงดัชนีไม่ได้ (ดู warnings)
  stocks: Rs7Stock[];
  series: Rs7SeriesRow[];
  warnings: string[];
}

export type PhaseKey = 'A' | 'B' | 'C' | 'neutral';
export type StatusGroup = 'trigger' | 'setup' | 'watch' | 'reset';

// ── parse (ข้อมูลเสียรูป → ทิ้งแถวนั้น ไม่ throw) ───────────────────────────
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const str = (x: unknown): string | null => (typeof x === 'string' ? x : null);

function parsePhase(p: unknown): Rs7Phase | null {
  if (!isObj(p)) return null;
  const t = p.today;
  if (t !== 'A' && t !== 'B' && t !== 'C' && t !== 'neutral') return null;
  const f = isObj(p.last_ftd) ? p.last_ftd : null;
  return {
    today: t,
    since: str(p.since), date: str(p.date),
    idx_close: num(p.idx_close), idx_dd: num(p.idx_dd),
    idx_high: num(p.idx_high), idx_high_date: str(p.idx_high_date),
    idx_low: num(p.idx_low), idx_low_date: str(p.idx_low_date),
    above_low: num(p.above_low), bars_since_low: num(p.bars_since_low),
    corr_recent: p.corr_recent === true, idx_above_sma50: p.idx_above_sma50 === true,
    last_ftd: f && str(f.date) && num(f.rally_day) != null && num(f.bars_ago) != null
      ? { date: f.date as string, rally_day: f.rally_day as number, bars_ago: f.bars_ago as number, pct: num(f.pct) }
      : null,
  };
}

function parseStock(r: unknown): Rs7Stock | null {
  if (!isObj(r) || typeof r.ticker !== 'string' || !Array.isArray(r.patterns)) return null;
  const patterns: Rs7Pattern[] = [];
  for (const p of r.patterns) {
    if (isObj(p) && typeof p.id === 'number' && typeof p.status === 'string' && p.status) {
      patterns.push({ id: p.id, key: str(p.key) ?? '', status: p.status });
    }
  }
  if (!patterns.length) return null;
  const tt = isObj(r.tt) && num(r.tt.pass) != null && num(r.tt.total) != null
    ? { pass: r.tt.pass as number, total: r.tt.total as number } : null;
  const rs = isObj(r.reset) && (r.reset.type === 'pivot' || r.reset.type === 'base')
    ? {
        type: r.reset.type, bo_date: str(r.reset.bo_date), bo_age: num(r.reset.bo_age), bo_volx: num(r.reset.bo_volx),
        old_pivot: num(r.reset.old_pivot), base_low: num(r.reset.base_low), new_low: num(r.reset.new_low),
        broken_low: num(r.reset.broken_low), new_base_high: num(r.reset.new_base_high),
      } as Rs7Reset
    : null;
  return {
    ticker: r.ticker, sector: str(r.sector), stage: str(r.stage), patterns,
    close: num(r.close), rs_rating: num(r.rs_rating), dist_hi: num(r.dist_hi), rs_gap: num(r.rs_gap),
    rs_nh: r.rs_nh === true, tight10: num(r.tight10), ants15: num(r.ants15), tt,
    pivot: num(r.pivot), to_pivot: num(r.to_pivot), volx: num(r.volx), adtv_mb: num(r.adtv_mb), reset: rs,
  };
}

function parseSeriesRow(r: unknown): Rs7SeriesRow | null {
  if (!isObj(r) || typeof r.date !== 'string' || num(r.set_close) == null) return null;
  return {
    date: r.date, set_close: r.set_close as number, phase: str(r.phase) ?? '-',
    n1: num(r.n1) ?? 0, n2: num(r.n2) ?? 0, n3: num(r.n3) ?? 0,
    n_sectors_123: num(r.n_sectors_123) ?? 0, n_all: num(r.n_all) ?? 0,
  };
}

/** raw JSON → Rs7Data · ไม่ใช่ object ของไฟล์ rs7 (ไม่มี as_of/config/stocks) → null (หน้าขึ้น "ยังไม่มีข้อมูล") */
export function parseRs7(raw: unknown): Rs7Data | null {
  if (!isObj(raw) || !Array.isArray(raw.stocks) || !isObj(raw.config)) return null;
  const names: Record<number, string> = {};
  if (isObj(raw.patterns)) {
    for (const [k, v] of Object.entries(raw.patterns)) {
      if (isObj(v) && typeof v.name === 'string' && Number.isInteger(Number(k))) names[Number(k)] = v.name;
    }
  }
  return {
    generatedAt: str(raw.generated_at), asOf: str(raw.as_of), config: raw.config, patternNames: names,
    phase: parsePhase(raw.phase),
    stocks: raw.stocks.map(parseStock).filter((s): s is Rs7Stock => s !== null),
    series: Array.isArray(raw.series) ? raw.series.map(parseSeriesRow).filter((s): s is Rs7SeriesRow => s !== null) : [],
    warnings: Array.isArray(raw.warnings) ? raw.warnings.filter((w): w is string => typeof w === 'string') : [],
  };
}

// ── config helpers (ค่าตัวเลขทั้งหมดอ่านจาก config{} ของไฟล์) ───────────────
export const cfgNum = (cfg: Rs7Config, key: string): number | null => num(cfg[key]);
export function cfgPair(cfg: Rs7Config, key: string): [number, number] | null {
  const v = cfg[key];
  return Array.isArray(v) && v.length === 2 && typeof v[0] === 'number' && typeof v[1] === 'number' ? [v[0], v[1]] : null;
}

// ── format ─────────────────────────────────────────────────────────────────
const MINUS = '−';
export function fmtPct(x: number | null | undefined, digits = 1, sign = true): string {
  if (x == null || !Number.isFinite(x)) return '-';
  const v = x * 100;
  const s = Math.abs(v).toFixed(digits);
  if (!sign) return `${s}%`;
  if (v > 0) return `+${s}%`;
  if (v < 0 && Number(s) !== 0) return `${MINUS}${s}%`;
  return `${s}%`;
}
/** ตัวเลขเกณฑ์ใน config (สัดส่วน 0.08 → "8%") */
export const fmtCfgPct = (x: number | null): string => (x == null ? '?' : `${+(x * 100).toFixed(2)}%`);
export const fmtPrice = (x: number | null | undefined): string => (x == null || !Number.isFinite(x) ? '-' : x.toFixed(2));
export const fmtX = (x: number | null | undefined): string => (x == null || !Number.isFinite(x) ? '-' : x.toFixed(1));

// ── ช่วงดัชนี ──────────────────────────────────────────────────────────────
export const phaseKey = (p: Rs7Phase | null | undefined): PhaseKey => p?.today ?? 'neutral';
export const seriesPhaseKey = (s: string): PhaseKey => (s === 'A' || s === 'B' || s === 'C' ? s : 'neutral');

export interface PhaseInfo {
  letter: string;
  name: string;
  sentence: string;
  look: number[];
  doText: string;
}
export const PHASE_INFO: Record<PhaseKey, PhaseInfo> = {
  A: {
    letter: 'A', name: 'ก่อนจุดต่ำ', sentence: 'ตลาดยังลง อยู่ใกล้จุดต่ำ', look: [1, 4, 7],
    doText: 'สะสมรายชื่อ A-list จาก 1 Predictive · 4 Sore thumbs · 7 Failure reset · ถ้าซื้อ = ไม้ pilot เล็ก stop แคบ เพราะดัชนีอาจลงอีกขา',
  },
  B: {
    letter: 'B', name: 'หลัง low ถึง FTD', sentence: 'ดัชนีเด้งจาก low แล้วมี FTD ยืนยัน', look: [2, 5],
    doText: 'ซื้อตัวที่ขึ้น 2 Coincident และ 5 Fast rebound (รอย่อแรก) ด้วยไม้ pilot · ต้องมีหุ้นออกจากฐานแน่นๆ ด้วย FTD อย่างเดียวไม่ใช่สัญญาณซื้อ',
  },
  C: {
    letter: 'C', name: 'ขาขึ้นยืนยัน', sentence: 'ดัชนีกลับมาเป็นขาขึ้นแล้ว', look: [3, 6],
    doText: 'เพิ่มน้ำหนักที่ 3 Confirming และ 6 Lead and rest ถ้าไม้ pilot กำไร · อย่าไล่ตัวที่ห่าง pivot มาก',
  },
  neutral: {
    letter: '-', name: 'ไม่อยู่ช่วงไหน', sentence: 'ดัชนียังไม่เข้าเงื่อนไขช่วง A / B / C', look: [7],
    doText: 'รอดูว่าดัชนีเข้าช่วงไหน · แบบ 7 Failure reset เกิดได้ทุกช่วง เก็บไว้เป็นรายชื่อเฝ้า',
  },
};

/** ประโยคเงื่อนไขของช่วง (เลขเกณฑ์มาจาก config{}) */
export function phaseCondition(key: PhaseKey, cfg: Rs7Config): string {
  const corr = fmtCfgPct(cfgNum(cfg, 'corr_th'));
  switch (key) {
    case 'A': return `SET ลงจาก high เกินเกณฑ์ปรับฐาน ${corr} และยังห่าง low ไม่ถึง ${fmtCfgPct(cfgNum(cfg, 'near_low'))}`;
    case 'B': return `เคยปรับฐานเกิน ${corr} แล้วเด้งจาก low และมี FTD ของระบบภายในเวลาที่กำหนด · ดัชนียังห่าง high ${fmtCfgPct(cfgNum(cfg, 'b_max_near_high'))} ขึ้นไป`;
    case 'C': return `SET ยืนเหนือ SMA50 ที่กำลังขึ้น และเด้งจาก low ≥ ${fmtCfgPct(cfgNum(cfg, 'phase_c_rally'))} (หรือผ่าน low มานานแล้ว)`;
    default: return 'ยังไม่เข้าเงื่อนไขช่วง A / B / C';
  }
}

/** ข้อความใต้การ์ดช่วง: เสมอ 1 บรรทัดแรก · ช่วง B เพิ่มคำเตือน FTD */
export const PHASE_NOTE = 'ช่วงนี้เป็นของแท็บนี้ คนละอย่างกับสถานะตลาดหน้า Overview';
export const PHASE_B_NOTE = 'FTD ไม่ได้ถูกทุกครั้ง ช่วง B เกิดได้ทั้งรอบฟื้นจริงและรอบหลอก ใช้ไม้เล็ก';
export function phaseNotes(key: PhaseKey): string[] {
  return key === 'B' ? [PHASE_NOTE, PHASE_B_NOTE] : [PHASE_NOTE];
}

// ── สถานะ → กลุ่ม / ประโยค "ทำอะไรต่อ" ─────────────────────────────────────
const GROUP: Record<string, StatusGroup> = {
  BREAKOUT: 'trigger', PIVOT_RECLAIM: 'trigger', BASE_BREAKOUT: 'trigger',
  SETUP: 'setup',
  WATCH: 'watch', REST: 'watch', RUNNING: 'watch', EXTENDED: 'watch', FIRST_PULLBACK: 'watch',
  PIVOT_RESET: 'reset', BASE_RESET: 'reset',
};
export const statusGroup = (status: string): StatusGroup => GROUP[status] ?? 'watch';
export const GROUP_RANK: Record<StatusGroup, number> = { trigger: 0, setup: 1, watch: 2, reset: 3 };
export const GROUP_LABEL: Record<StatusGroup, string> = { trigger: 'trigger', setup: 'setup', watch: 'watch', reset: 'reset' };

export const PATTERN_NAME_FALLBACK: Record<number, string> = {
  1: 'Predictive', 2: 'Coincident', 3: 'Confirming', 4: 'Sore thumbs', 5: 'Fast rebound', 6: 'Lead and rest', 7: 'Failure reset',
};
export const patternName = (data: Pick<Rs7Data, 'patternNames'>, id: number): string =>
  data.patternNames[id] ?? PATTERN_NAME_FALLBACK[id] ?? `แบบ ${id}`;

export const STATUS_MEANING: { label: string; text: string; group: StatusGroup }[] = [
  { label: 'BREAKOUT / RECLAIM', text: 'เกิดจุดซื้อวันนี้', group: 'trigger' },
  { label: 'SETUP', text: 'ใกล้จุดซื้อ ตั้ง alert', group: 'setup' },
  { label: 'WATCH / REST / RUNNING', text: 'เฝ้า ยังไม่ซื้อ', group: 'watch' },
  { label: 'PIVOT_RESET / BASE_RESET', text: 'เบรกล้มแล้วกำลังตั้งใหม่ · Pivot = ฐานไม่หลุด รอกลับเหนือ pivot เดิม · Base = ฐานพัง รอฐานใหม่', group: 'reset' },
];

/** ประโยค "ทำอะไรต่อ" ของ 1 รูปแบบ — กติกาตายตัว ไม่ใช้ AI · phase = ช่วงดัชนีวันนี้ (ช่วง A/B → ไม้ pilot) */
export function actionSentence(s: Rs7Stock, p: Rs7Pattern, phase: PhaseKey, cfg: Rs7Config): string {
  const pilot = phase === 'A' || phase === 'B' ? ' · ไม้ pilot เท่านั้น' : '';
  const vol = s.volx != null ? ` วอลุ่ม ${fmtX(s.volx)} เท่า` : '';
  switch (p.status) {
    case 'BREAKOUT':
      return `จุดซื้อวันนี้ · เบรก ${fmtPrice(s.pivot)}${vol}${pilot}`;
    case 'PIVOT_RECLAIM':
      return `จุดซื้อวันนี้ · กลับเหนือ ${fmtPrice(s.reset?.old_pivot)}${vol}${pilot}`;
    case 'BASE_BREAKOUT':
      return `จุดซื้อวันนี้ · เบรก high ฐานใหม่ ${fmtPrice(s.reset?.new_base_high)}${vol}${pilot}`;
    case 'SETUP':
      if (s.to_pivot != null && s.to_pivot >= 0) {
        return `เหนือ pivot ${fmtPrice(s.pivot)} แล้ว แต่วอลุ่มยังไม่ถึงเกณฑ์ · ตั้ง alert`;
      }
      return `ใกล้ pivot ${fmtPrice(s.pivot)} (ห่าง ${fmtPct(s.to_pivot == null ? null : Math.abs(s.to_pivot), 1, false)}) · ตั้ง alert`;
    case 'WATCH':
    case 'REST':
    case 'RUNNING': {
      const maxTight = cfgNum(cfg, 'pred_tight10');
      const wide = s.tight10 != null && maxTight != null && s.tight10 > maxTight;
      return `เฝ้า ยังไม่ใช่จุดซื้อ${wide ? ' · ฐานยังกว้าง' : ''}`;
    }
    case 'EXTENDED':
      return 'ขึ้นมาไกลแล้ว · ไม่ไล่ รอย่อแรก';
    case 'FIRST_PULLBACK':
      return 'ย่อแรก วอลุ่มแห้ง · จุดเข้าเมื่อกลับเหนือ high ฐานสั้น';
    case 'PIVOT_RESET': {
      const op = fmtPrice(s.reset?.old_pivot);
      const age = s.reset?.bo_age;
      return `เบรก ${op}${age != null ? ` เมื่อ ${age} วันก่อน` : ''}แล้วโดนตบ · ปิดเหนือ ${op} พร้อมวอลุ่ม = เข้าใหม่ (ห้ามถัว)`;
    }
    case 'BASE_RESET': {
      const nb = s.reset?.new_base_high;
      return `ฐานเดิมพัง · รอเบรก high ฐานใหม่${nb != null ? ` ${fmtPrice(nb)}` : ''}`;
    }
    default:
      return '';
  }
}

// ── จัดเรียง / กรอง / นับ ──────────────────────────────────────────────────
/** กลุ่มที่ดีที่สุดของหุ้น (trigger < setup < watch < reset) — ถ้าระบุ filterId ดูเฉพาะรูปแบบนั้น */
export function bestGroupRank(s: Rs7Stock, filterId: number | null = null): number {
  let best = 99;
  for (const p of s.patterns) {
    if (filterId != null && p.id !== filterId) continue;
    best = Math.min(best, GROUP_RANK[statusGroup(p.status)]);
  }
  return best;
}

/** trigger ก่อน → setup → watch → reset · ภายในกลุ่มเรียง RS Rating มาก→น้อย (null ท้ายสุด) · เสมอ → ticker */
export function sortStocks(stocks: Rs7Stock[], filterId: number | null = null): Rs7Stock[] {
  return stocks
    .map(s => ({ s, g: bestGroupRank(s, filterId) }))
    .sort((a, b) =>
      a.g - b.g
      || (b.s.rs_rating ?? -1) - (a.s.rs_rating ?? -1)
      || a.s.ticker.localeCompare(b.s.ticker))
    .map(x => x.s);
}

export const filterStocks = (stocks: Rs7Stock[], filterId: number | null): Rs7Stock[] =>
  filterId == null ? stocks : stocks.filter(s => s.patterns.some(p => p.id === filterId));

export interface PatternCount {
  total: number;
  groups: Record<StatusGroup, number>;
  pivot: number; // แบบ 7: pivot reset/reclaim
  base: number;  // แบบ 7: base reset/breakout
}
export function patternCounts(stocks: Rs7Stock[]): Record<number, PatternCount> {
  const out: Record<number, PatternCount> = {};
  for (let id = 1; id <= 7; id++) out[id] = { total: 0, groups: { trigger: 0, setup: 0, watch: 0, reset: 0 }, pivot: 0, base: 0 };
  for (const s of stocks) {
    for (const p of s.patterns) {
      const c = out[p.id];
      if (!c) continue;
      c.total += 1;
      c.groups[statusGroup(p.status)] += 1;
      if (p.status === 'PIVOT_RESET' || p.status === 'PIVOT_RECLAIM') c.pivot += 1;
      if (p.status === 'BASE_RESET' || p.status === 'BASE_BREAKOUT') c.base += 1;
    }
  }
  return out;
}

/** แบบนี้เกิดได้ในช่วงดัชนีวันนี้ไหม · wait = ข้อความว่ารอช่วงไหน (ใช้เมื่อ available=false) */
export function patternAvailability(
  id: number, phase: Rs7Phase | null, series: Rs7SeriesRow[], cfg: Rs7Config,
): { available: boolean; wait: string | null } {
  const key = phaseKey(phase);
  switch (id) {
    case 1: return key === 'A' ? { available: true, wait: null } : { available: false, wait: 'รอช่วง A' };
    case 2: return key === 'B' ? { available: true, wait: null } : { available: false, wait: 'รอช่วง B' };
    case 3: return key === 'C' ? { available: true, wait: null } : { available: false, wait: 'รอช่วง C' };
    case 4: {
      // ดัชนี < SMA50 และผลตอบแทน 63 วัน ≤ เกณฑ์ (คิด 63 วันจากซีรีส์ set_close)
      const th = cfgNum(cfg, 'sore_idx_ret63');
      const n = series.length;
      let weak = phase ? !phase.idx_above_sma50 : false;
      if (weak && th != null && n > 63) weak = series[n - 1].set_close / series[n - 64].set_close - 1 <= th;
      return weak ? { available: true, wait: null } : { available: false, wait: 'รอดัชนีอ่อน' };
    }
    case 5: {
      const r = cfgPair(cfg, 'fast_bsl');
      const bsl = phase?.bars_since_low;
      const ok = !!phase && phase.corr_recent && bsl != null && (r ? bsl >= r[0] && bsl <= r[1] : true);
      return ok ? { available: true, wait: null } : { available: false, wait: r ? `รอ ≤ ${r[1]} วันหลัง low` : 'รอหลัง low' };
    }
    case 6: {
      const th = cfgNum(cfg, 'rest_rally');
      const r = cfgPair(cfg, 'rest_bsl');
      const bsl = phase?.bars_since_low;
      const ok = !!phase && phase.corr_recent && phase.above_low != null && (th == null || phase.above_low >= th)
        && bsl != null && (r ? bsl >= r[0] && bsl <= r[1] : true);
      return ok ? { available: true, wait: null } : { available: false, wait: `รอเด้ง ≥ ${fmtCfgPct(th)}` };
    }
    default: return { available: true, wait: null };
  }
}

// ── กราฟ ───────────────────────────────────────────────────────────────────
export type ChartRange = '3m' | '6m' | '1y';
export const CHART_RANGES: { key: ChartRange; label: string; bars: number }[] = [
  { key: '3m', label: '3 เดือน', bars: 63 },
  { key: '6m', label: '6 เดือน', bars: 126 },
  { key: '1y', label: '1 ปี', bars: 252 },
];
export const DEFAULT_CHART_RANGE: ChartRange = '6m';
export const chartBars = (r: ChartRange): number => CHART_RANGES.find(x => x.key === r)?.bars ?? 126;
export const SERIES_COLORS = { n1: '#338ced', n2: '#e76624', n3: '#00a888' } as const;
export const PHASE_BAND: Record<'A' | 'B', string> = { A: 'rgba(239,68,68,0.16)', B: 'rgba(245,158,11,0.16)' };
