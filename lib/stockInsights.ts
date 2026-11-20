// การ์ดใหม่ 3 ใบของหน้า /stock/[ticker] (mockups/stock-detail-v3.html)
//   ① จุดเข้า & แผนเทรด   ② ประวัติในสแกน   ③ แรงเงิน & กลุ่ม
// ไฟล์นี้ = ฟังก์ชันล้วน (ไม่มี fs): ตัดข้อมูลของหุ้นตัวเดียวออกจากไฟล์ใน data/scans/ + กฎประโยคสรุปตายตัว (ไม่ใช้ AI)
// ตัวโหลดไฟล์ฝั่ง server อยู่ใน lib/stockInsightsData.ts — browser ได้เฉพาะ object เล็ก ๆ ของหุ้นตัวนี้

export type Tone = 'good' | 'bad' | 'neutral';

const r1 = (n: number) => Math.round(n * 10) / 10;
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const signed = (n: number, digits = 1) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(digits)}`;

// ── ① จุดเข้า & แผนเทรด (sepa.json) ─────────────────────────────────────────

export interface EntryPlan {
  footprint: string | null;
  weeks: number | null;
  contractions: number | null;
  maxDepth: number | null;
  finalDepth: number | null;
  contracting: boolean | null;
  volRatio: number | null;
  pivot: number | null;
  /** ราคาปิด ณ วันสแกน (SL/TP คำนวณจากราคานี้) */
  scanPrice: number;
  sl: number;
  tp: number;
}

/** แถว sepa.json ของหุ้นนี้ → EntryPlan (ไม่อยู่ในไฟล์ / ข้อมูล SL-TP ไม่ครบ → null) */
export function entryPlanFromSepaRow(row: Record<string, unknown> | null | undefined): EntryPlan | null {
  if (!row) return null;
  const scanPrice = num(row.Price);
  const sl = num(row['SL(-8%)']);
  const tp = num(row['TP(+16%)']);
  if (scanPrice == null || sl == null || tp == null) return null;
  const fp = typeof row.VCP_Footprint === 'string' ? row.VCP_Footprint.trim() : '';
  const pivot = num(row.VCP_Pivot);
  return {
    footprint: fp && fp.toLowerCase() !== 'no base' ? fp : null,
    weeks: num(row.VCP_Weeks),
    contractions: num(row.VCP_T),
    maxDepth: num(row.VCP_MaxDepth),
    finalDepth: num(row.VCP_FinalDepth),
    contracting: typeof row.VCP_Contracting === 'boolean' ? row.VCP_Contracting : null,
    volRatio: num(row.VCP_VolRatio),
    pivot: pivot != null && pivot > 0 ? pivot : null,
    scanPrice,
    sl,
    tp,
  };
}

/** มีฐาน VCP ให้โชว์ไหม (มี footprint + pivot) */
export function hasVcpBase(p: EntryPlan): boolean {
  return p.footprint != null && p.pivot != null;
}

export const BUY_ZONE_PCT = 5;

export interface EntryNumbers { riskPct: number | null; rewardPct: number | null; rr: number | null; toPivotPct: number | null }

export function entryNumbers(p: EntryPlan, price: number): EntryNumbers {
  const riskPct = price > p.sl ? ((price - p.sl) / price) * 100 : null;
  const rewardPct = p.tp > price ? ((p.tp - price) / price) * 100 : null;
  const rr = riskPct != null && rewardPct != null && riskPct > 0 ? r1(rewardPct / riskPct) : null;
  const toPivotPct = p.pivot != null ? ((p.pivot - price) / price) * 100 : null;
  return { riskPct, rewardPct, rr, toPivotPct };
}

/** ประโยคสรุปการ์ด ① — ต่อกันด้วย " · " */
export function entrySummary(p: EntryPlan, price: number): string {
  const parts: string[] = [];
  const n = entryNumbers(p, price);
  if (!hasVcpBase(p)) {
    parts.push('ยังไม่มีฐาน VCP');
  } else {
    const pivot = p.pivot as number;
    if (price < pivot) parts.push(`ยังไม่เบรก Pivot ${fmtPrice(pivot)} (อีก +${(n.toPivotPct as number).toFixed(1)}%)`);
    else if (price <= pivot * (1 + BUY_ZONE_PCT / 100)) parts.push('เบรก Pivot แล้ว อยู่ในระยะซื้อ');
    else parts.push(`เลยระยะซื้อแล้ว (เกิน ${BUY_ZONE_PCT}% จาก Pivot)`);
    if (p.volRatio != null) parts.push(p.volRatio < 1 ? 'วอลุ่มแห้ง' : 'วอลุ่มยังไม่แห้ง');
  }
  if (n.riskPct != null && n.rewardPct != null && n.rr != null) {
    parts.push(`ซื้อที่ ${fmtPrice(price)} เสี่ยง ${n.riskPct.toFixed(1)}% ได้ ${n.rewardPct.toFixed(1)}% (R:R 1:${n.rr.toFixed(1)})`);
  } else if (price <= p.sl) {
    parts.push(`ราคาต่ำกว่าจุดตัดขาดทุน ${fmtPrice(p.sl)} แล้ว`);
  } else if (price >= p.tp) {
    parts.push(`ราคาถึงเป้า ${fmtPrice(p.tp)} แล้ว`);
  }
  return parts.join(' · ');
}

export function fmtPrice(v: number): string {
  if (v >= 100) return Number.isInteger(v) ? v.toFixed(0) : v.toFixed(2);
  return v.toFixed(2);
}

// ── ② ประวัติในสแกน ──────────────────────────────────────────────────────────

/** สแกนที่มีแถวในแถบ 30 วัน: history file · key ใน scan_days · key ใน report_card */
export const STRIP_SCANS = [
  { key: 'sepa', label: 'SEPA', days: 'sepa', rc: 'sepa' },
  { key: 'kell', label: 'Kell', days: 'kell', rc: 'kell' },
  { key: 'breakout', label: 'Breakout', days: 'breakout', rc: 'breakout' },
  { key: 'lekkung', label: 'Lekkung', days: 'lekkung', rc: 'lekkung_growth' },
  { key: 'oneil', label: "O'Neil", days: 'oneil', rc: 'oneil' },
] as const;

/** สแกนใน report_card ทั้งหมด (ตาราง setup ใช้ทุกสแกน — PPBP ไม่มีแถบเพราะไม่มี history file) */
export const RC_SCAN_LABEL: Record<string, string> = {
  sepa: 'SEPA', kell: 'Kell', breakout: 'Breakout', lekkung_growth: 'Lekkung Growth', oneil: "O'Neil", ppbp: 'PPBP',
};
const RC_ORDER = ['sepa', 'kell', 'breakout', 'lekkung_growth', 'oneil', 'ppbp'];

export const STAT_MIN_N = 30;
export const STRIP_DAYS = 30;

export interface StripRow { key: string; label: string; hits: boolean[]; days: number | null }
export interface SetupRow {
  scan: string; label: string; seq: number | null;
  entryDate: string; entryPrice: number; holdingDays: number | null;
  returnPct: number | null; mfePct: number | null; maePct: number | null;
  status: 'open' | 'closed';
}
export interface StatRow {
  scan: string; label: string;
  /** stage ที่ใช้ (null = ใช้ภาพรวมของสแกนนั้น) */
  stage: string | null;
  /** stage ของ setup ที่เปิดอยู่ (ใช้กำกับเมื่อ fallback) */
  entryStage: string | null;
  n: number; winRate: number | null; avgReturn: number | null; avgMfe: number | null;
}
export interface ScanHistoryCard {
  dates: string[];
  stage: (string | null)[];
  rows: StripRow[];
  setups: SetupRow[];
  stats: StatRow[];
}

/** 30 วันทำการล่าสุดจาก dates ที่มีอยู่ในไฟล์ (ไม่สร้างเองจากจันทร์–ศุกร์) */
export function lastTradingDates(dates: unknown, n = STRIP_DAYS): string[] {
  if (!Array.isArray(dates)) return [];
  const ds = dates.filter((d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)).slice().sort();
  return ds.slice(-n);
}

/** runs [[stage, from, to], …] → stage ของแต่ละวัน */
export function stageByDates(runs: unknown, dates: string[]): (string | null)[] {
  const rs = Array.isArray(runs) ? runs.filter((r): r is [string, string, string] =>
    Array.isArray(r) && r.length >= 3 && typeof r[0] === 'string' && typeof r[1] === 'string' && typeof r[2] === 'string') : [];
  return dates.map(d => rs.find(([, from, to]) => from <= d && d <= to)?.[0] ?? null);
}

export function hitsOnDates(hitDates: unknown, dates: string[]): boolean[] {
  const set = new Set(Array.isArray(hitDates) ? hitDates.filter(d => typeof d === 'string') : []);
  return dates.map(d => set.has(d));
}

type RawSetup = Record<string, unknown>;
type RawSummary = { n_closed?: unknown; win_rate_pct?: unknown; avg_return_pct?: unknown; avg_mfe_pct?: unknown; by_stage?: unknown };
export type RawReportCardScans = Record<string, { setups?: unknown; setup_summary?: RawSummary } | undefined>;

function toSetupRow(scan: string, s: RawSetup): SetupRow | null {
  const entryDate = typeof s.entry_date === 'string' ? s.entry_date : null;
  const entryPrice = num(s.entry_price);
  if (!entryDate || entryPrice == null) return null;
  return {
    scan, label: RC_SCAN_LABEL[scan] ?? scan, seq: num(s.setup_seq),
    entryDate, entryPrice, holdingDays: num(s.holding_days),
    returnPct: num(s.return_pct), mfePct: num(s.mfe_pct), maePct: num(s.mae_pct),
    status: s.status === 'open' ? 'open' : 'closed',
  };
}

/** setup ที่เปิดอยู่ของหุ้นนี้ทุกสแกน + setup ที่ปิดล่าสุด 1 แถว (ตามวันออก) */
export function setupsForTicker(scans: RawReportCardScans | null | undefined, ticker: string): { open: (SetupRow & { stageAtEntry: string | null })[]; lastClosed: SetupRow | null } {
  const open: (SetupRow & { stageAtEntry: string | null })[] = [];
  let lastClosed: { row: SetupRow; exit: string } | null = null;
  if (!scans) return { open, lastClosed: null };
  const keys = [...RC_ORDER.filter(k => k in scans), ...Object.keys(scans).filter(k => !RC_ORDER.includes(k))];
  for (const scan of keys) {
    const list = scans[scan]?.setups;
    if (!Array.isArray(list)) continue;
    for (const s of list as RawSetup[]) {
      if (s?.ticker !== ticker) continue;
      const row = toSetupRow(scan, s);
      if (!row) continue;
      if (row.status === 'open') {
        open.push({ ...row, stageAtEntry: typeof s.stage_at_entry === 'string' ? s.stage_at_entry : null });
      } else {
        const exit = typeof s.exit_date === 'string' ? s.exit_date : row.entryDate;
        if (!lastClosed || exit > lastClosed.exit) lastClosed = { row, exit };
      }
    }
  }
  return { open, lastClosed: lastClosed?.row ?? null };
}

const NO_STAGE = 'ไม่มีข้อมูล';

/** สถิติ Report Card ของ setup ที่เปิดอยู่: by_stage ของ stage ตอนเข้า · n < 30 / ไม่มี stage → ภาพรวมของสแกน */
export function statForSetup(scan: string, stageAtEntry: string | null, summary: RawSummary | null | undefined): StatRow | null {
  if (!summary) return null;
  const label = RC_SCAN_LABEL[scan] ?? scan;
  const byStage = Array.isArray(summary.by_stage) ? (summary.by_stage as Record<string, unknown>[]) : [];
  const hit = stageAtEntry && stageAtEntry !== NO_STAGE ? byStage.find(b => b.stage === stageAtEntry) : undefined;
  const hitN = hit ? num(hit.n) : null;
  if (hit && hitN != null && hitN >= STAT_MIN_N) {
    return { scan, label, stage: stageAtEntry, entryStage: stageAtEntry, n: hitN, winRate: num(hit.win_rate_pct), avgReturn: num(hit.avg_return_pct), avgMfe: num(hit.avg_mfe_pct) };
  }
  const n = num(summary.n_closed);
  if (n == null || n === 0) return null;
  return { scan, label, stage: null, entryStage: stageAtEntry, n, winRate: num(summary.win_rate_pct), avgReturn: num(summary.avg_return_pct), avgMfe: num(summary.avg_mfe_pct) };
}

export interface HistoryInputs {
  ticker: string;
  dates: unknown;
  stageRuns: unknown;
  /** key ของ STRIP_SCANS → hitDates ของหุ้นนี้ (ไม่อยู่ในไฟล์ → undefined) */
  hitDates: Record<string, unknown>;
  scanDays: Record<string, Record<string, unknown> | undefined> | null | undefined;
  reportCard: RawReportCardScans | null | undefined;
}

export function buildScanHistoryCard(inp: HistoryInputs): ScanHistoryCard | null {
  const dates = lastTradingDates(inp.dates);
  const stage = stageByDates(inp.stageRuns, dates);
  const rows: StripRow[] = [];
  for (const s of STRIP_SCANS) {
    const hits = hitsOnDates(inp.hitDates[s.key], dates);
    if (!hits.some(Boolean)) continue;
    rows.push({ key: s.key, label: s.label, hits, days: num(inp.scanDays?.[s.days]?.[inp.ticker]) });
  }
  const { open, lastClosed } = setupsForTicker(inp.reportCard, inp.ticker);
  const stats: StatRow[] = [];
  for (const o of open) {
    if (stats.some(s => s.scan === o.scan)) continue;
    const st = statForSetup(o.scan, o.stageAtEntry, inp.reportCard?.[o.scan]?.setup_summary);
    if (st) stats.push(st);
  }
  const setups: SetupRow[] = [
    ...open.map(o => ({ scan: o.scan, label: o.label, seq: o.seq, entryDate: o.entryDate, entryPrice: o.entryPrice, holdingDays: o.holdingDays, returnPct: o.returnPct, mfePct: o.mfePct, maePct: o.maePct, status: o.status })),
    ...(lastClosed ? [lastClosed] : []),
  ];
  if (dates.length === 0 && setups.length === 0) return null;
  return { dates, stage, rows, setups, stats };
}

/** ประโยคสรุปจากสถิติ — ใช้แถวแรก (ลำดับ SEPA → Kell → Breakout → Lekkung → O'Neil → PPBP) */
export function statsSummary(stats: StatRow[]): { text: string; tone: Tone } | null {
  const s = stats[0];
  if (!s) return null;
  const { avgReturn, avgMfe, winRate } = s;
  if (avgReturn != null && avgMfe != null && avgReturn <= 0 && avgMfe >= 5) {
    return { text: `setup แบบนี้มักวิ่งไปก่อน (${s.label} เฉลี่ย +${avgMfe.toFixed(1)}%) แต่คืนกำไรเมื่อรอหลุดสแกน → ควรมีจุดขายทำกำไร`, tone: 'neutral' };
  }
  if (winRate != null && avgReturn != null && winRate >= 50 && avgReturn > 0) {
    return { text: `สถิติ setup แบบนี้เป็นบวก (${s.label} ชนะ ${winRate.toFixed(0)}% เฉลี่ย ${signed(avgReturn)}%)`, tone: 'good' };
  }
  return { text: 'สถิติ setup แบบนี้ยังไม่ชัด', tone: 'neutral' };
}

// ── ③ แรงเงิน & กลุ่ม (nvdr.json + sector_rs_history.json) ───────────────────

export interface NvdrFlow { buy: number; sell: number; net: number }
export interface GroupRs {
  group: string;
  level: 'subsector' | 'sector';
  latest: number | null;
  prev20: number | null;
  /** 21 จุดล่าสุด (20 วันทำการ) — null = วันที่ไม่มีค่า */
  series: (number | null)[];
}
export interface MoneyFlowCard {
  nvdrDate: string | null;
  today: NvdrFlow | null;
  d5: NvdrFlow | null;
  rs: GroupRs | null;
}

export const RS_STRONG = 70;
export const RS_WEAK = 40;
export const RS_DELTA = 3;
export const RS_LOOKBACK = 20;

function nvdrRow(list: unknown, ticker: string): NvdrFlow | null {
  if (!Array.isArray(list)) return null;
  const r = (list as Record<string, unknown>[]).find(x => x?.Symbol === ticker);
  if (!r) return null;
  const buy = num(r.Buy), sell = num(r.Sell), net = num(r.Net);
  if (buy == null || sell == null || net == null) return null;
  return { buy, sell, net };
}

export function nvdrForTicker(nvdr: { latest_date?: unknown; today?: unknown; '5d'?: unknown } | null | undefined, ticker: string) {
  if (!nvdr) return { nvdrDate: null, today: null, d5: null };
  const today = nvdrRow(nvdr.today, ticker);
  const d5 = nvdrRow(nvdr['5d'], ticker);
  return { nvdrDate: (today || d5) && typeof nvdr.latest_date === 'string' ? nvdr.latest_date : null, today, d5 };
}

type RsNode = { rs_series?: unknown; subsectors?: Record<string, RsNode | undefined> };
export type RawSectorRsHistory = { dates?: unknown; sectors?: Record<string, Record<string, RsNode | undefined> | undefined> };

function seriesOf(node: RsNode | undefined): (number | null)[] | null {
  if (!node || !Array.isArray(node.rs_series)) return null;
  const s = node.rs_series.map(v => num(v));
  return s.some(v => v != null) ? s : null;
}

/** RS กลุ่มย่อย (ไม่มีกลุ่มย่อย / ไม่มีค่า → ระดับ sector) */
export function groupRs(hist: RawSectorRsHistory | null | undefined, market: string | null, sector: string | null, subsector: string | null): GroupRs | null {
  if (!hist?.sectors || !market || !sector) return null;
  const secNode = hist.sectors[market]?.[sector];
  if (!secNode) return null;
  let level: GroupRs['level'] = 'sector';
  let group = sector;
  let s = subsector ? seriesOf(secNode.subsectors?.[subsector]) : null;
  if (s && subsector) { level = 'subsector'; group = subsector; } else { s = seriesOf(secNode); }
  if (!s) return null;
  const series = s.slice(-(RS_LOOKBACK + 1));
  const latest = s[s.length - 1] ?? null;
  const prev20 = s.length > RS_LOOKBACK ? s[s.length - 1 - RS_LOOKBACK] ?? null : null;
  return { group, level, latest, prev20, series };
}

export function moneyFlowSummary(card: MoneyFlowCard): { text: string; tone: Tone } | null {
  const parts: string[] = [];
  let score = 0;
  const rs = card.rs;
  if (rs && rs.latest != null) {
    let p = rs.latest >= RS_STRONG ? `กลุ่ม ${rs.group} ยังแข็ง` : rs.latest <= RS_WEAK ? `กลุ่ม ${rs.group} อ่อน` : `กลุ่ม ${rs.group} กลาง ๆ`;
    score += rs.latest >= RS_STRONG ? 1 : rs.latest <= RS_WEAK ? -1 : 0;
    if (rs.prev20 != null) {
      const d = rs.latest - rs.prev20;
      if (d >= RS_DELTA) p += ' และแข็งขึ้น';
      else if (d <= -RS_DELTA) p += ' แต่อ่อนลง';
    }
    parts.push(p);
  }
  if (card.d5) {
    if (card.d5.net > 0) { parts.push('ต่างชาติซื้อสุทธิ 5 วัน'); score += 1; }
    else if (card.d5.net < 0) { parts.push('ต่างชาติขายสุทธิ 5 วัน'); score -= 1; }
  }
  if (!parts.length) return null;
  return { text: parts.join(' · '), tone: score > 0 ? 'good' : score < 0 ? 'bad' : 'neutral' };
}

/** บาท → ล้านบาท แบบมีจุลภาค (−1,534) */
export function fmtMillion(baht: number, signedOut = true): string {
  const m = Math.round(baht / 1e6);
  const s = Math.abs(m).toLocaleString('en-US');
  if (!signedOut) return s;
  return m > 0 ? `+${s}` : m < 0 ? `−${s}` : '0';
}

/** ทั้งหมดที่หน้า /stock ต้องใช้ — object เล็ก ๆ ของหุ้นตัวเดียว */
export interface StockInsights {
  entryPlan: EntryPlan | null;
  history: ScanHistoryCard | null;
  moneyFlow: MoneyFlowCard | null;
}
