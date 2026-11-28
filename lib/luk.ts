// /luk — Martin Luk (SET): types + logic ล้วน (ไม่มี I/O) ของ data/scans/luk.json
// data-engine tools/scanner/scan_luk.py เขียนไฟล์นี้ · เกณฑ์ตัวเลขทั้งหมดมาจาก config{} ในไฟล์ (ไม่พิมพ์ซ้ำในโค้ด)
// ตัวโหลดไฟล์ (fs) อยู่ที่ lib/lukData.ts · ตัวจัดรูปแบบตัวเลขใช้ของ lib/rs7.ts

import { cfgNum, fmtCfgPct, fmtPct, fmtPrice, type Rs7Config } from './rs7';

export type LukConfig = Rs7Config;
export type LukMode = 'LONG' | 'MIXED' | 'DEFENSIVE' | 'SHORT';
export type LukTab = 'buy' | 'LONG_PULLBACK' | 'EPISODIC_PIVOT' | 'weak';

export interface LukRegime {
  mode: LukMode;
  suggested_risk_pct: number | null;
  leaders_counted: number | null;
  pct_above_ema9: number | null;
  pct_above_ema21: number | null;
  pct_ema9_over_ema21: number | null;
  pct_gap_down_today: number | null;
  pct_failed_breakout: number | null;
  set: { close: number | null; above_ema9: boolean; above_ema21: boolean; ema21_rising: boolean } | null;
  rule: string | null;
}

export interface LukCandidate {
  symbol: string;
  setup: string;
  score: number;
  close: number | null;
  adr_pct: number | null;
  ref_level: number | null;
  ref_name: string | null;
  dist_ref_adr: number | null;
  perf_1m: number | null;
  rs_rating: number | null;
  leader_rank: number | null;
  sector: string | null;
  subsector: string | null;
  entry_trigger: number | null;
  stop_pct: number | null;
  stop_price: number | null;
  stop_ticks: number | null;
  size_pct_daily_stop: number | null;
  size_pct_intraday_stop: number | null;
  note: string;
}

// หุ้นอ่อนแรง: ไม่มีจุดเข้า / stop / ขนาดไม้ โดยตั้งใจ (ไม่ใช่สัญญาณชอร์ต)
export interface LukWeak {
  symbol: string;
  setup: string;
  score: number;
  close: number | null;
  ref_level: number | null;
  ref_name: string | null;
  perf_1m: number | null;
  rs_rating: number | null;
  sector: string | null;
  subsector: string | null;
  note: string;
}

export interface LukThemeAlert { subsector: string; count: number; symbols: string[] }
export interface LukFunnel { universe: number; price: number; value20: number; adr: number }

export interface LukData {
  generatedAt: string | null;
  asOf: string | null;
  config: LukConfig;
  regime: LukRegime | null; // null = คำนวณ regime ไม่ได้ (ดู warnings)
  funnel: LukFunnel | null;
  counts: Record<string, number>;
  leadersCount: number;
  candidates: LukCandidate[];
  weak: LukWeak[];
  themeAlerts: LukThemeAlert[];
  warnings: string[];
  reminder: string | null;
}

// ── parse (ข้อมูลเสียรูป → ทิ้งแถวนั้น ไม่ throw) ───────────────────────────
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const str = (x: unknown): string | null => (typeof x === 'string' ? x : null);

const MODES: LukMode[] = ['LONG', 'MIXED', 'DEFENSIVE', 'SHORT'];

function parseRegime(r: unknown): LukRegime | null {
  if (!isObj(r) || !MODES.includes(r.mode as LukMode)) return null;
  const s = isObj(r.set) ? r.set : null;
  return {
    mode: r.mode as LukMode,
    suggested_risk_pct: num(r.suggested_risk_pct), leaders_counted: num(r.leaders_counted),
    pct_above_ema9: num(r.pct_above_ema9), pct_above_ema21: num(r.pct_above_ema21),
    pct_ema9_over_ema21: num(r.pct_ema9_over_ema21), pct_gap_down_today: num(r.pct_gap_down_today),
    pct_failed_breakout: num(r.pct_failed_breakout),
    set: s ? { close: num(s.close), above_ema9: s.above_ema9 === true, above_ema21: s.above_ema21 === true, ema21_rising: s.ema21_rising === true } : null,
    rule: str(r.rule),
  };
}

function parseCandidate(r: unknown): LukCandidate | null {
  if (!isObj(r) || typeof r.symbol !== 'string' || typeof r.setup !== 'string') return null;
  return {
    symbol: r.symbol, setup: r.setup, score: num(r.score) ?? 0, close: num(r.close), adr_pct: num(r.adr_pct),
    ref_level: num(r.ref_level), ref_name: str(r.ref_name), dist_ref_adr: num(r.dist_ref_adr), perf_1m: num(r.perf_1m),
    rs_rating: num(r.rs_rating), leader_rank: num(r.leader_rank), sector: str(r.sector), subsector: str(r.subsector),
    entry_trigger: num(r.entry_trigger), stop_pct: num(r.stop_pct), stop_price: num(r.stop_price), stop_ticks: num(r.stop_ticks),
    size_pct_daily_stop: num(r.size_pct_daily_stop), size_pct_intraday_stop: num(r.size_pct_intraday_stop),
    note: str(r.note) ?? '',
  };
}

function parseWeak(r: unknown): LukWeak | null {
  if (!isObj(r) || typeof r.symbol !== 'string' || typeof r.setup !== 'string') return null;
  // ตั้งใจไม่อ่านฟิลด์จุดเข้า/stop/ขนาดไม้ แม้ไฟล์จะมี — ฝั่งนี้ไม่แสดงตัวเลขเหล่านั้น
  return {
    symbol: r.symbol, setup: r.setup, score: num(r.score) ?? 0, close: num(r.close), ref_level: num(r.ref_level),
    ref_name: str(r.ref_name), perf_1m: num(r.perf_1m), rs_rating: num(r.rs_rating), sector: str(r.sector),
    subsector: str(r.subsector), note: str(r.note) ?? '',
  };
}

function parseTheme(r: unknown): LukThemeAlert | null {
  if (!isObj(r) || typeof r.subsector !== 'string' || !Array.isArray(r.symbols)) return null;
  const symbols = r.symbols.filter((s): s is string => typeof s === 'string');
  return symbols.length ? { subsector: r.subsector, count: num(r.count) ?? symbols.length, symbols } : null;
}

/** raw JSON → LukData · ไม่ใช่ไฟล์ luk (ไม่มี config / candidates) → null (หน้าขึ้น "ยังไม่มีข้อมูล") */
export function parseLuk(raw: unknown): LukData | null {
  if (!isObj(raw) || !isObj(raw.config) || !Array.isArray(raw.candidates)) return null;
  const f = isObj(raw.funnel) ? raw.funnel : null;
  const counts: Record<string, number> = {};
  if (isObj(raw.counts)) for (const [k, v] of Object.entries(raw.counts)) if (num(v) != null) counts[k] = v as number;
  return {
    generatedAt: str(raw.generated_at), asOf: str(raw.as_of), config: raw.config, regime: parseRegime(raw.regime),
    funnel: f && num(f.universe) != null ? { universe: f.universe as number, price: num(f.price) ?? 0, value20: num(f.value20) ?? 0, adr: num(f.adr) ?? 0 } : null,
    counts, leadersCount: Array.isArray(raw.leaders) ? raw.leaders.length : 0,
    candidates: raw.candidates.map(parseCandidate).filter((c): c is LukCandidate => c !== null),
    weak: Array.isArray(raw.weak) ? raw.weak.map(parseWeak).filter((c): c is LukWeak => c !== null) : [],
    themeAlerts: Array.isArray(raw.theme_alerts) ? raw.theme_alerts.map(parseTheme).filter((c): c is LukThemeAlert => c !== null) : [],
    warnings: Array.isArray(raw.warnings) ? raw.warnings.filter((w): w is string => typeof w === 'string') : [],
    reminder: str(raw.reminder),
  };
}

// ── regime ─────────────────────────────────────────────────────────────────
export interface ModeInfo { name: string; meaning: string; sub: string }
export const MODE_INFO: Record<LukMode, ModeInfo> = {
  LONG: { name: 'LONG', meaning: 'เล่นฝั่งซื้อเต็ม risk', sub: 'risk เต็ม' },
  MIXED: { name: 'MIXED', meaning: 'risk ครึ่ง', sub: 'risk ครึ่ง' },
  DEFENSIVE: { name: 'DEFENSIVE', meaning: 'risk ครึ่ง ระวัง', sub: 'risk ครึ่ง · ระวัง' },
  SHORT: { name: 'SHORT', meaning: 'ไม่เล่นฝั่งซื้อ', sub: 'ไม่เล่นฝั่งซื้อ' },
};
export const MODE_ORDER: LukMode[] = ['LONG', 'MIXED', 'DEFENSIVE', 'SHORT'];
export const REGIME_NOTE = 'คนละอย่างกับสถานะตลาดหน้า Overview และช่วง A/B/C ของ RS Leaders · ถ้าโดน stop ติดกันหลายไม้ ให้ลด risk เอง (หลักของ Luk)';

/** ประโยคสรุปของโหมดปัจจุบัน — เลขจากไฟล์ (ผู้นำกี่ % เหนือ EMA21 · risk ต่อไม้) */
export function regimeSentence(r: LukRegime): string {
  const pct = r.pct_above_ema21 != null ? `${Math.round(r.pct_above_ema21)}%` : '-';
  const risk = r.suggested_risk_pct != null ? `${r.suggested_risk_pct.toFixed(2)}%` : '-';
  const setTrend = r.set ? (r.set.above_ema21 && r.set.ema21_rising ? 'SET เป็นขาขึ้น' : r.set.above_ema21 ? 'SET เหนือ EMA21 แต่ EMA21 ยังไม่ขึ้น' : 'SET ต่ำกว่า EMA21') : '';
  const lead = `ผู้นำ ${pct} ยืนเหนือ EMA21${setTrend ? ` และ ${setTrend}` : ''}`;
  switch (r.mode) {
    case 'LONG': return `${MODE_INFO.LONG.meaning} · ${lead} → risk ต่อไม้ ${risk} ของพอร์ต`;
    case 'MIXED': return `${MODE_INFO.MIXED.meaning} · ${lead} → risk ต่อไม้ ${risk} ของพอร์ต`;
    case 'DEFENSIVE': return `${MODE_INFO.DEFENSIVE.meaning} · ${lead} → risk ต่อไม้ ${risk} ของพอร์ต`;
    case 'SHORT': return `${MODE_INFO.SHORT.meaning} · ${lead} → ฝั่งซื้อพักไว้ ดูรายการหุ้นอ่อนแรงเป็นคำเตือน`;
  }
}

export interface GaugeRow { key: string; label: string; value: number | null; mark: number | null; markLabel: string | null }

/** แถบวัดของผู้นำ — ขีดเกณฑ์มาจาก config{} */
export function gaugeRows(r: LukRegime, cfg: LukConfig): GaugeRow[] {
  const longAbove = cfgNum(cfg, 'reg_long_above21');
  const longStacked = cfgNum(cfg, 'reg_long_stacked');
  const defFailed = cfgNum(cfg, 'reg_def_failed');
  const shortAbove = cfgNum(cfg, 'reg_short_above21');
  return [
    { key: 'above21', label: 'เหนือ EMA21', value: r.pct_above_ema21, mark: longAbove, markLabel: longAbove != null ? `LONG ≥ ${longAbove}%` : null },
    { key: 'above9', label: 'เหนือ EMA9', value: r.pct_above_ema9, mark: null, markLabel: null },
    { key: 'stacked', label: 'EMA9 > EMA21', value: r.pct_ema9_over_ema21, mark: longStacked, markLabel: longStacked != null ? `LONG ≥ ${longStacked}%` : null },
    { key: 'gapdn', label: 'Gap ลงวันนี้', value: r.pct_gap_down_today, mark: null, markLabel: null },
    { key: 'failed', label: 'เบรกล้ม', value: r.pct_failed_breakout, mark: defFailed, markLabel: defFailed != null ? `DEFENSIVE ≥ ${defFailed}%` : null },
  ].map(g => (g.key === 'above21' && shortAbove != null ? { ...g, markLabel: `${g.markLabel ?? ''}${g.markLabel ? ' · ' : ''}SHORT ≤ ${shortAbove}%` } : g));
}

export function funnelSteps(f: LukFunnel, cfg: LukConfig, leaders: number): { label: string; n: number }[] {
  const minPrice = cfgNum(cfg, 'min_price');
  const minVal = cfgNum(cfg, 'min_value20_mb');
  const minAdr = cfgNum(cfg, 'min_adr_pct');
  return [
    { label: 'หุ้นที่สแกน', n: f.universe },
    { label: `ราคา ≥ ${minPrice ?? '?'} บาท`, n: f.price },
    { label: `มูลค่า 20 วัน ≥ ${minVal ?? '?'} ลบ.`, n: f.value20 },
    { label: `ADR ≥ ${minAdr ?? '?'}%`, n: f.adr },
    { label: `ผู้นำ (RS Rating สูงสุด ${cfgNum(cfg, 'leader_top_n') ?? leaders} ตัว)`, n: leaders },
  ];
}

// ── รายการ / แท็บ ──────────────────────────────────────────────────────────
export const LONG_SETUPS = ['LONG_PULLBACK', 'EPISODIC_PIVOT'] as const;
export const WEAK_SETUPS = ['SHORT_WEAK_BOUNCE', 'PARABOLIC_SHORT'] as const;
export const SETUP_LABEL: Record<string, string> = {
  LONG_PULLBACK: 'Long Pullback', EPISODIC_PIVOT: 'Episodic Pivot',
  SHORT_WEAK_BOUNCE: 'เด้งอ่อน (Weak bounce)', PARABOLIC_SHORT: 'วิ่งแนวตั้ง (Parabolic)',
};
export const setupLabel = (s: string): string => SETUP_LABEL[s] ?? s;

const bySetupThenScore = <T extends { score: number; symbol: string }>(a: T, b: T) => b.score - a.score || a.symbol.localeCompare(b.symbol);

/** เรียง score มาก→น้อย (เสมอ → ชื่อหุ้น) */
export const sortByScore = <T extends { score: number; symbol: string }>(rows: T[]): T[] => [...rows].sort(bySetupThenScore);

export function tabCandidates(cands: LukCandidate[], tab: LukTab): LukCandidate[] {
  if (tab === 'weak') return [];
  return sortByScore(tab === 'buy' ? cands : cands.filter(c => c.setup === tab));
}

/** จำนวนบนแท็บ — จาก counts{} ในไฟล์ (ไม่มีให้นับจากรายการ) */
export function tabCounts(d: Pick<LukData, 'counts' | 'candidates' | 'weak'>): Record<LukTab, number> {
  const c = (s: string, fallback: number) => d.counts[s] ?? fallback;
  const lp = c('LONG_PULLBACK', d.candidates.filter(x => x.setup === 'LONG_PULLBACK').length);
  const ep = c('EPISODIC_PIVOT', d.candidates.filter(x => x.setup === 'EPISODIC_PIVOT').length);
  const weak = WEAK_SETUPS.reduce((n, s) => n + c(s, d.weak.filter(x => x.setup === s).length), 0);
  return { buy: lp + ep, LONG_PULLBACK: lp, EPISODIC_PIVOT: ep, weak };
}

export const TAB_LABEL: Record<LukTab, string> = {
  buy: 'ฝั่งซื้อ', LONG_PULLBACK: 'Long Pullback', EPISODIC_PIVOT: 'Episodic Pivot', weak: 'หุ้นอ่อนแรง',
};
export const TAB_ORDER: LukTab[] = ['buy', 'LONG_PULLBACK', 'EPISODIC_PIVOT', 'weak'];

// ── ธีมซ้ำ ─────────────────────────────────────────────────────────────────
/** symbol → ชื่อกลุ่มที่แจ้งเตือน (ใช้แปะป้าย "กลุ่มซ้ำ") */
export function themeBySymbol(alerts: LukThemeAlert[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const a of alerts) for (const s of a.symbols) if (!m.has(s)) m.set(s, a.subsector);
  return m;
}

export const themeSentence = (a: LukThemeAlert): string => `${a.subsector} ${a.count} ตัว (${a.symbols.join(', ')})`;
export const THEME_ADVICE = 'ถ้าเข้าหลายตัวคือเสี่ยงก้อนเดียวกัน จำกัดน้ำหนักรวมของกลุ่ม';

// ── ข้อความในแถว ───────────────────────────────────────────────────────────
/** "ทำไมติด / ทำอะไรพรุ่งนี้" = note จากไฟล์ + ประโยคตายตัว (ไม่ใช้ AI) */
export function nextStep(c: LukCandidate): string {
  return `ผ่าน ${fmtPrice(c.entry_trigger)} ด้วย ORB/VWAP บนกราฟเล็กค่อยพิจารณา`;
}

export function stopText(c: LukCandidate): string {
  if (c.stop_price == null) return '-';
  const bits = [c.stop_pct != null ? `−${c.stop_pct.toFixed(2)}%` : '', c.stop_ticks != null ? `${c.stop_ticks} tick` : ''].filter(Boolean);
  return `${fmtPrice(c.stop_price)}${bits.length ? ` (${bits.join(' · ')})` : ''}`;
}

export const fmtSize = (x: number | null | undefined): string => (x == null || !Number.isFinite(x) ? '-' : `${x.toFixed(1)}%`);
export const fmtRank = (x: number | null | undefined): string => (x == null ? '-' : `#${x}`);

/** ข้อความใต้ตาราง (ตัวเลขจาก config{}) */
export function sizingNotes(cfg: LukConfig, risk: number | null): string[] {
  const maxPos = cfgNum(cfg, 'max_position_pct');
  const ticks = cfgNum(cfg, 'min_stop_ticks');
  const intraday = cfgNum(cfg, 'intraday_stop_pct');
  const r = risk != null ? risk.toFixed(2) : (cfgNum(cfg, 'risk_pct') ?? 0).toFixed(2);
  return [
    `ขนาดไม้ = risk ${r}% ÷ ระยะ stop (เพดาน ${maxPos ?? '?'}% ของพอร์ต) · stop intraday = จุดเข้าลง ${intraday ?? '?'}% ส่วน stop รายวัน = ถึง low ของวันนี้`,
    `stop ขั้นต่ำ ${ticks ?? '?'} tick เพราะหุ้นไทยราคา 5–25 บาท stop ${intraday ?? '?'}% = 1–2 tick เท่านั้น`,
    'ราคาในระบบปรับปันผลแล้ว หุ้นที่เพิ่ง XD จุดเข้าอาจต่างจากราคาจริงเล็กน้อย',
  ];
}

export const WEAK_HEADER = 'หุ้นอ่อนแรง (ไม่ใช่สัญญาณชอร์ต · อย่าซื้อ / ถืออยู่ให้ระวัง)';
export { fmtCfgPct, fmtPct, fmtPrice };
