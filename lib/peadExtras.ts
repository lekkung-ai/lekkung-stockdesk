// Per-stock extras for the /earnings PEAD section ("ราคาวิ่งต่อหลังงบ"): market stage,
// liquidity, RS, Weinstein stage and the scans a stock currently sits in. Built on the
// server for the few PEAD stocks only (never ship the 860-row scan files to the client);
// every source is optional - a missing file or a missing stock simply gives no badge.
// Display only: ⚡ / PEAD / bucket rules stay in earningsMetrics.ts.

export interface PeadExtra {
  /** market_stage.json Stage (S.Bull, Bull, ...) */
  stage?: string;
  /** ADTV in million baht (market_stage.json "ADTV(MB)") */
  adtv?: number;
  /** rs_ranking.json RS_Rating */
  rs?: number;
  /** weinstein.json Stage, e.g. "Stage 3 (Topping)" */
  wein?: string;
  /** scan keys the stock is in right now */
  scans?: ScanKey[];
}

export type ScanKey = 'sepa' | 'lekkung' | 'kell' | 'breakout' | 'ppbp' | 'oneil';

/** scan file -> label shown on the page and the page it links to */
export const SCAN_META: Record<ScanKey, { label: string; href: string }> = {
  sepa: { label: 'SEPA', href: '/sepa' },
  lekkung: { label: 'Lekkung Growth', href: '/lekkung' },
  kell: { label: 'Oliver Kell', href: '/kell' },
  breakout: { label: 'Breakout', href: '/breakout' },
  ppbp: { label: 'PPBP', href: '/scanner' },
  oneil: { label: 'CAN SLIM', href: '/oneil' },
};

/** Same palette the stock tables already use for Market Stage. */
export const STAGE_COLORS: Record<string, string> = {
  'S.Bull': '#1b5e20', Bull: '#4caf50', Accumulation: '#00bcd4',
  Recovery: '#9e9e9e', Warning: '#FFEB3B', Distribution: '#ff9800', Bear: '#ef5350',
};

type Row = { Ticker?: string; [k: string]: unknown };

export interface PeadSources {
  marketStage?: Row[] | null;
  weinstein?: Row[] | null;
  rsRanking?: Row[] | null;
  scans?: Partial<Record<ScanKey, Row[] | null>>;
}

function indexBy(rows: Row[] | null | undefined): Map<string, Row> {
  const m = new Map<string, Row>();
  if (!Array.isArray(rows)) return m;
  for (const r of rows) if (r && typeof r.Ticker === 'string') m.set(r.Ticker, r);
  return m;
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

/** Lookup for exactly the given tickers. A ticker that no file knows is left out. */
export function buildPeadExtras(tickers: string[], src: PeadSources): Record<string, PeadExtra> {
  const ms = indexBy(src.marketStage);
  const wn = indexBy(src.weinstein);
  const rs = indexBy(src.rsRanking);
  const scanIdx = (Object.keys(SCAN_META) as ScanKey[]).map(k => [k, indexBy(src.scans?.[k])] as const);
  const out: Record<string, PeadExtra> = {};
  for (const t of new Set(tickers)) {
    const e: PeadExtra = {};
    const m = ms.get(t);
    if (m) {
      const stage = str(m.Stage);
      const adtv = num(m['ADTV(MB)']);
      if (stage) e.stage = stage;
      if (adtv != null) e.adtv = adtv;
    }
    const w = str(wn.get(t)?.Stage);
    if (w) e.wein = w;
    const r = num(rs.get(t)?.RS_Rating);
    if (r != null) e.rs = r;
    const scans = scanIdx.filter(([, idx]) => idx.has(t)).map(([k]) => k);
    if (scans.length) e.scans = scans;
    if (Object.keys(e).length) out[t] = e;
  }
  return out;
}

// ── Warning badges ───────────────────────────────────────────────────────────

export const LOW_LIQUIDITY_ADTV = 5; // million baht per day

export interface Warn {
  key: 'liquidity' | 'weinstein' | 'auditor';
  level: 'red' | 'amber';
  text: string;
  title: string;
}

/** ADTV < 5 ล./วัน → "สภาพคล่องต่ำ". No ADTV → no badge. */
export function liquidityWarn(adtv: number | null | undefined): Warn | null {
  if (adtv == null || !Number.isFinite(adtv) || adtv >= LOW_LIQUIDITY_ADTV) return null;
  const v = adtv < 10 ? adtv.toFixed(1) : String(Math.round(adtv));
  return {
    key: 'liquidity', level: 'amber',
    text: `สภาพคล่องต่ำ ${v} ล./วัน`,
    title: `มูลค่าซื้อขายเฉลี่ยต่อวัน ${adtv.toFixed(2)} ล้านบาท (น้อยกว่า ${LOW_LIQUIDITY_ADTV} ล./วัน)`,
  };
}

/** Weinstein "Stage 3 ..." → "Weinstein 3 ทำยอด". */
export function weinsteinWarn(stage: string | null | undefined): Warn | null {
  if (!stage || !stage.startsWith('Stage 3')) return null;
  return { key: 'weinstein', level: 'amber', text: 'Weinstein 3 ทำยอด', title: `Weinstein: ${stage}` };
}

/** Auditor opinion:
 *  - starts with "มีเงื่อนไข" or "ไม่แสดงความ" → red, text = the part before "และ"
 *  - mentions "ข้อสังเกต" without a condition → light-orange "ผู้สอบบัญชีมีข้อสังเกต"
 *  - "ไม่มีเงื่อนไข" or empty → none. The title always carries the full value. */
export function auditorWarn(opinion: string | null | undefined): Warn | null {
  const o = (opinion ?? '').trim();
  if (!o) return null;
  if (o.startsWith('มีเงื่อนไข') || o.startsWith('ไม่แสดงความ')) {
    const head = o.split('และ')[0].trim();
    return { key: 'auditor', level: 'red', text: `ผู้สอบบัญชี: ${head}`, title: `ความเห็นผู้สอบบัญชี: ${o}` };
  }
  if (o.includes('ข้อสังเกต')) {
    return { key: 'auditor', level: 'amber', text: 'ผู้สอบบัญชีมีข้อสังเกต', title: `ความเห็นผู้สอบบัญชี: ${o}` };
  }
  return null;
}

/** All warnings of one stock, in display order (auditor first - the most serious). */
export function peadWarnings(opinion: string | null | undefined, extra: PeadExtra | undefined): Warn[] {
  return [auditorWarn(opinion), liquidityWarn(extra?.adtv), weinsteinWarn(extra?.wein)].filter((w): w is Warn => w != null);
}

/** Group label: the subsector, unless it is longer than 22 characters (then the sector). */
export const GROUP_MAX_LEN = 22;
export function groupLabel(a: { subsector?: string | null; sector?: string | null }): string {
  const sub = (a.subsector ?? '').trim();
  const sec = (a.sector ?? '').trim();
  if (sub && sub.length <= GROUP_MAX_LEN) return sub;
  return sec || sub;
}
