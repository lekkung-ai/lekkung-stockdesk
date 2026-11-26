// Capital-event numbers for /calendar (mock calendar-capital-v2 "กติกาคำนวณ"). Pure functions, no AI, no I/O.
// Facts come from public/data/capital_events.json (scripts/build_capital_events.py) and /api/corporate-action;
// the price is the latest scan close (data/scans/combined.json) and is applied only here, at render time.

export type CapitalSource = 'PP' | 'RO' | 'W' | 'CB' | 'ESOP' | string;

export interface CapitalShares { old: number | null; new: number | null; total?: number | null; basis: 'max' | 'actual'; actual_new?: number | null }
export interface CapitalResult { news_id: string | null; allotted: number; sold: number; take_up_pct: number; from?: string }

export interface CapitalEvent {
  id: string;
  kind: 'listing' | 'ro_result' | 'board' | 'XR' | 'XW';
  ticker: string;
  date: string;
  announce_date?: string | null;
  source_type?: CapitalSource;
  shares?: CapitalShares;
  price?: number | null;
  prices?: { price: number | null; shares: number | null }[] | null;
  ratio?: { a?: number | null; b?: number | null; old?: number | null; new?: number | null; text?: string | null } | null;
  allottees?: { name: string; shares: number }[];
  result?: CapitalResult;
  tags?: string[];
  title?: string;
  note?: string | null;
  take_up_pct?: number; // ro_result
  allotted?: number;    // ro_result
  sold?: number;        // ro_result
  linked?: string[] | null;
  origin?: { source: string; news_id?: string | null; link?: string | null; pdf?: string | null };
}

export interface CapitalEventsFile {
  generated_at?: string;
  as_of?: string;
  warnings?: string[];
  events?: CapitalEvent[];
}

/** "5.500003 : 1" → {old: 5.500003, new: 1}; null when it is not two positive numbers. */
export function parseRatio(text: string | null | undefined): { old: number; new: number } | null {
  const nums = (text ?? '').match(/\d[\d,]*(?:\.\d+)?/g)?.map(s => Number(s.replace(/,/g, ''))) ?? [];
  if (nums.length !== 2 || !(nums[0] > 0) || !(nums[1] > 0)) return null;
  return { old: nums[0], new: nums[1] };
}

/** true when the stock is suspended (SP or H mark in news_flags) - prices then mean nothing. */
export function isHalted(markLabels: string[]): boolean {
  return markLabels.some(l => /(^|[\s,])(SP|H)(?=$|[\s,])/.test(l.replace(/^เครื่องหมาย\s*/, '')));
}

export const RO_WARN_PCT = 50;          // XR (not yet past): new shares >= 50% of old
export const LISTING_WARN_PCT = 5;      // new shares in: >= 5% of old ...
export const LISTING_WARN_DISCOUNT = 10; // ... and got them >= 10% below the close

export interface XrCalc {
  pctNew: number;            // new ÷ old × 100
  holdingIfSkip: number;     // old ÷ (old + new) × 100
  newShare: number;          // 100 − holdingIfSkip
  discountPct: number | null; // (1 − exercise ÷ close) × 100 (negative = above the market)
  terp: number | null;        // (close×old + exercise×new) ÷ (old+new)
  terpChgPct: number | null;  // terp ÷ close − 1
  oldShares: number | null;   // allotShare × old/new
  newSharesMax: number | null;
  moneyMax: number | null;    // baht, new × exercise
  warn: boolean;
}

/** XR (rights offering) from the ratio; price-based numbers only when close is known and the stock trades. */
export function xrCalc(o: {
  ratio: string | null | undefined; exercise: number | null | undefined; close: number | null | undefined;
  allotShare?: number | null; upcoming: boolean; halted?: boolean;
}): XrCalc | null {
  const r = parseRatio(o.ratio);
  if (!r) return null;
  const pctNew = (r.new / r.old) * 100;
  const holdingIfSkip = (r.old / (r.old + r.new)) * 100;
  const close = !o.halted && o.close && o.close > 0 ? o.close : null;
  const ex = o.exercise != null && o.exercise >= 0 ? o.exercise : null;
  const terp = close != null && ex != null ? (close * r.old + ex * r.new) / (r.old + r.new) : null;
  const allot = o.allotShare && o.allotShare > 0 ? o.allotShare : null;
  return {
    pctNew, holdingIfSkip, newShare: 100 - holdingIfSkip,
    discountPct: close != null && ex != null ? (1 - ex / close) * 100 : null,
    terp, terpChgPct: terp != null && close != null ? (terp / close - 1) * 100 : null,
    oldShares: allot != null ? (allot * r.old) / r.new : null,
    newSharesMax: allot,
    moneyMax: allot != null && ex != null ? allot * ex : null,
    warn: o.upcoming && pctNew >= RO_WARN_PCT,
  };
}

/** XW: most new shares if every warrant converts (1 warrant = 1 share assumed; exercise terms are in the announcement). */
export const XW_MAX_PLAUSIBLE_PCT = 1000; // above this the ratio is not "shares : warrants" (e.g. a bond unit : warrants)

export function xwCalc(ratio: string | null | undefined): { pctNewMax: number; newShareMax: number } | null {
  const r = parseRatio(ratio);
  if (!r || (r.new / r.old) * 100 > XW_MAX_PLAUSIBLE_PCT) return null;
  return { pctNewMax: (r.new / r.old) * 100, newShareMax: (r.new / (r.old + r.new)) * 100 };
}

export interface ListingCalc {
  pctNew: number;            // new ÷ old × 100
  newShare: number;          // new ÷ total × 100
  discountPct: number | null; // (1 − price ÷ close) × 100
  holderGainPct: number | null; // close ÷ price − 1
  warn: boolean;
}

/** New shares that started trading (any source PP/RO/W/CB/ESOP). */
export function listingCalc(o: {
  old: number | null | undefined; added: number | null | undefined; price: number | null | undefined;
  close: number | null | undefined; halted?: boolean;
}): ListingCalc | null {
  if (!o.old || !o.added || o.old <= 0 || o.added <= 0) return null;
  const pctNew = (o.added / o.old) * 100;
  const close = !o.halted && o.close && o.close > 0 ? o.close : null;
  const price = o.price != null && o.price > 0 ? o.price : null;
  const discountPct = close != null && price != null ? (1 - price / close) * 100 : null;
  return {
    pctNew,
    newShare: (o.added / (o.old + o.added)) * 100,
    discountPct,
    holderGainPct: close != null && price != null ? (close / price - 1) * 100 : null,
    warn: pctNew >= LISTING_WARN_PCT && discountPct != null && discountPct >= LISTING_WARN_DISCOUNT,
  };
}

/** Percent with sign, 1 decimal ("+18.2%"); ≥ 100 → no decimals ("+150%"). */
export function fmtPct(v: number | null | undefined, signed = true): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  const s = abs >= 100 ? abs.toFixed(0) : abs < 1 && abs > 0 ? abs.toFixed(2) : abs.toFixed(1);
  return `${signed ? (v < 0 ? '−' : '+') : v < 0 ? '−' : ''}${s}%`;
}

/** Shares in millions ("2,225.7 ล้าน"). */
export function fmtMillion(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${(n / 1e6).toLocaleString('en-US', { maximumFractionDigits: 1, minimumFractionDigits: n >= 1e8 ? 1 : 0 })} ล้าน`;
}

/** Price with 2–4 decimals as needed (0.154, 0.1127, 5.55). */
export function fmtPrice(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const s = v.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  const dec = s.includes('.') ? s.split('.')[1].length : 0;
  return dec < 2 ? v.toFixed(2) : s;
}

export const SOURCE_LABEL: Record<string, string> = {
  PP: 'PP (เสนอขายเฉพาะเจาะจง)', RO: 'RO (ผู้ถือหุ้นเดิม)', W: 'แปลง Warrant', CB: 'แปลงหุ้นกู้แปลงสภาพ', ESOP: 'ESOP (กรรมการ/พนักงาน)',
};
