import rawSectorMap from '@/data/scans/sector_map.json';

export interface SectorEntry {
  sector: string;
  subsector: string;
  tickers: string[];
  count: number;
}

interface SectorMapFile {
  sectors: SectorEntry[];
  ticker_to_sector: Record<string, { sector: string; subsector: string }>;
}

const sectorMap = rawSectorMap as SectorMapFile;

export const allSectorEntries: SectorEntry[] = sectorMap.sectors;
export const tickerToSector: Record<string, { sector: string; subsector: string }> = sectorMap.ticker_to_sector;

export function getSectorForTicker(ticker: string): { sector: string; subsector: string } | null {
  return tickerToSector[ticker] ?? null;
}

export function getSectorsGrouped(): { sector: string; subsectors: SectorEntry[]; totalCount: number }[] {
  const map = new Map<string, SectorEntry[]>();
  for (const entry of allSectorEntries) {
    const list = map.get(entry.sector) ?? [];
    list.push(entry);
    map.set(entry.sector, list);
  }
  return Array.from(map.entries()).map(([sector, subsectors]) => ({
    sector,
    subsectors,
    totalCount: subsectors.reduce((s, e) => s + e.count, 0),
  }));
}

export function sectorToSlug(sector: string): string {
  return sector.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

export function slugToSector(slug: string): string | null {
  const match = allSectorEntries.find(e => sectorToSlug(e.sector) === slug);
  return match?.sector ?? null;
}
