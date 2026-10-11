// relative path (ไม่ใช้ @/) ให้ vitest resolve ได้โดยไม่ต้องมี config (เหมือน fundFilter.ts)
import rawSectorMap from '../data/scans/sector_map.json';

export interface SectorEntry {
  sector: string;
  subsector: string;
  market: string;
  tickers: string[];
  count: number;
}

interface SectorMapFile {
  sectors: SectorEntry[];
  ticker_to_sector: Record<string, { sector: string; subsector: string; market: string }>;
}

const sectorMap = rawSectorMap as SectorMapFile;

export const allSectorEntries: SectorEntry[] = sectorMap.sectors;
export const tickerToSector: Record<string, { sector: string; subsector: string; market: string }> = sectorMap.ticker_to_sector;

// ── กองทุน & REIT ── กฎเดียวทั้งเว็บ (คู่กับ data-engine tools/scanner/utils.is_fund_ticker):
// ticker ที่ sector_map จัดเป็น subsector "Property Fund & REITs" = กองทุน ไม่ใช่หุ้นของ sector Property
// → ไม่นับในตัวเลขระดับ sector ใดๆ (% วันนี้, n, EMA50, stage, RS, median PE/PBV) แต่แสดงเป็นกลุ่มของตัวเอง
// sector_map.json เป็นการจัดหมวดทางการ — ห้ามแก้ไฟล์เพื่อย้ายกองทุน ใช้ helper นี้แทน
export const FUND_SUBSECTOR = 'Property Fund & REITs';
export const FUND_GROUP_LABEL = 'กองทุน & REIT';
export const FUND_GROUP_SHORT_LABEL = 'กองทุน/REIT'; // narrow heatmap box

export function isFundSubsector(subsector: string | null | undefined): boolean {
  return subsector === FUND_SUBSECTOR;
}

export function isFundTicker(ticker: string): boolean {
  return isFundSubsector(tickerToSector[ticker]?.subsector);
}

/** sector_map entries of stocks only (fund subsector and any fund ticker removed) — the base of every sector-level number. */
export const stockSectorEntries: SectorEntry[] = allSectorEntries
  .filter(e => !isFundSubsector(e.subsector))
  .map(e => {
    const tickers = e.tickers.filter(t => !isFundTicker(t));
    return tickers.length === e.tickers.length ? e : { ...e, tickers, count: tickers.length };
  });

/** Fund / REIT tickers in sector_map, optionally of one market. */
export function fundTickers(market?: string): string[] {
  return Object.entries(tickerToSector)
    .filter(([t, info]) => isFundTicker(t) && (!market || info.market === market))
    .map(([t]) => t);
}

/**
 * Funds / REITs listed today: sector_map funds that have a TradingView price (a delisted one has none).
 * The one list behind /funds, the heatmap group on /sector and the link on /sector/property, so all three
 * show the same count. quotes = /api/market-quotes (useMarketQuotes).
 */
export function listedFundTickers(quotes: Record<string, { price: number | null } | undefined>, market = 'SET'): string[] {
  return fundTickers(market).filter(t => quotes[t]?.price != null);
}

/** Group a sector_map row is shown under: "กองทุน & REIT" for the fund subsector, otherwise its sector. */
export function displayGroup(sector: string, subsector: string | null | undefined): string {
  return isFundSubsector(subsector) ? FUND_GROUP_LABEL : sector;
}

export function getSectorForTicker(ticker: string): { sector: string; subsector: string; market: string } | null {
  return tickerToSector[ticker] ?? null;
}

/** Sectors of stocks only (funds excluded, see isFundTicker). */
export function getSectorsGrouped(market?: 'SET' | 'MAI'): { sector: string; subsectors: SectorEntry[]; totalCount: number }[] {
  const entries = market ? stockSectorEntries.filter(e => e.market === market) : stockSectorEntries;
  const map = new Map<string, SectorEntry[]>();
  for (const entry of entries) {
    const list = map.get(entry.sector) ?? [];
    list.push(entry);
    map.set(entry.sector, list);
  }
  return Array.from(map.entries()).map(([sector, subsectors]) => ({
    sector,
    subsectors,
    // Count the actual ticker lists — the hand-edited `count` field can drift from them
    totalCount: subsectors.reduce((s, e) => s + e.tickers.length, 0),
  }));
}

export function sectorToSlug(sector: string): string {
  return sector.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

export function slugToSector(slug: string): string | null {
  const match = allSectorEntries.find(e => sectorToSlug(e.sector) === slug);
  return match?.sector ?? null;
}
