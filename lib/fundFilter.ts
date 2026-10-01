// relative path (ไม่ใช้ @/) ให้ vitest resolve ได้โดยไม่ต้องมี config
import rawCombined from '../data/scans/combined.json';
import { compareNullLast } from './sepaTier';

// กองทุน / REIT — data-engine แยกออกจาก scanner หุ้น (SEPA, Kell, Breakout ฯลฯ) และไม่จัดอันดับ RS
// (rs_score = null) แต่ยังอยู่ใน scanner ด้าน stage · ที่มา = combined.json field Is_Fund
// (sector_map subsector "Property Fund & REITs")

export interface CombinedFundFields {
  ticker: string;
  rs_score: number | null;
  RS_Raw?: number | null;
  Is_Fund?: boolean;
}

type CombinedJson = CombinedFundFields[] | { generated_at?: string; data: CombinedFundFields[] };
const combined = rawCombined as unknown as CombinedJson;
const combinedRows: CombinedFundFields[] = Array.isArray(combined) ? combined : combined.data;

export const FUND_TICKERS: ReadonlySet<string> = new Set(
  combinedRows.filter(r => r.Is_Fund === true).map(r => r.ticker),
);

export const isFund = (ticker: string, funds: ReadonlySet<string> = FUND_TICKERS): boolean => funds.has(ticker);

// ── ปุ่มแยกประเภท หุ้น / กองทุน & REIT / ทั้งหมด (?type=) ─────────────────────
export type AssetType = 'stock' | 'fund' | 'all';
export const ASSET_TYPES: readonly AssetType[] = ['stock', 'fund', 'all'];
export const DEFAULT_ASSET_TYPE: AssetType = 'stock';

export function parseAssetType(raw: string | null | undefined): AssetType {
  return raw === 'fund' || raw === 'all' || raw === 'stock' ? raw : DEFAULT_ASSET_TYPE;
}

export function matchesAssetType(ticker: string, type: AssetType, funds: ReadonlySet<string> = FUND_TICKERS): boolean {
  if (type === 'all') return true;
  return type === 'fund' ? funds.has(ticker) : !funds.has(ticker);
}

export function countByAssetType(
  tickers: readonly string[],
  funds: ReadonlySet<string> = FUND_TICKERS,
): Record<AssetType, number> {
  let fund = 0;
  for (const t of tickers) if (funds.has(t)) fund += 1;
  return { stock: tickers.length - fund, fund, all: tickers.length };
}

// ── เรียงลำดับ: ค่าว่าง (null / undefined / NaN) อยู่ท้ายเสมอทั้ง asc และ desc ───────
// ตัวเลขใช้ compareNullLast (sepaTier) · string เทียบด้วย localeCompare
export function compareValuesNullLast(a: unknown, b: unknown, dir: 'asc' | 'desc'): number {
  if (typeof a === 'string' && typeof b === 'string') {
    const cmp = a.localeCompare(b);
    return dir === 'asc' ? cmp : -cmp;
  }
  return compareNullLast(a, b, dir);
}

// ── Top RS Leaders (หน้าแรก) ────────────────────────────────────────────────
// rs_score มาก→น้อย · เท่ากันใช้ RS_Raw มาก→น้อย (เดิมเท่ากันแล้วออกตามตัวอักษรจาก combined.json)
// · กองทุนและแถวที่ไม่มี rs_score ไม่ติดอันดับ
export function rankTopRS<T extends CombinedFundFields>(rows: readonly T[], n: number): T[] {
  return rows
    .filter(r => r.Is_Fund !== true && r.rs_score != null)
    .sort((a, b) => compareNullLast(a.rs_score, b.rs_score, 'desc') || compareNullLast(a.RS_Raw, b.RS_Raw, 'desc'))
    .slice(0, n);
}
