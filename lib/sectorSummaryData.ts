// Binds the scan JSON files to computeSectorSummary so every page feeds it the same data.
import rawSectorMap from '@/data/scans/sector_map.json';
import rawSectorRS from '@/data/scans/sector_rs.json';
import rawSectorFlow from '@/data/scans/sector_flow.json';
import rawStages from '@/data/scans/market_stage.json';
import { computeSectorSummary, type QuoteInput, type SectorMarket, type SectorSummaryInputs, type SectorSummaryRow } from './sectorSummary';

const base: Omit<SectorSummaryInputs, 'quotes'> = {
  sectors: (rawSectorMap as { sectors: SectorSummaryInputs['sectors'] }).sectors ?? [],
  rs: (rawSectorRS as { sectors?: SectorSummaryInputs['rs'] }).sectors ?? null,
  flow: (rawSectorFlow as { sectors?: SectorSummaryInputs['flow'] }).sectors ?? null,
  stages: rawStages as SectorSummaryInputs['stages'],
};

/** quotes = live quotes from /api/market-quotes, or null when they are unavailable. */
export function sectorSummary(market: SectorMarket, quotes: Record<string, QuoteInput> | null): SectorSummaryRow[] {
  return computeSectorSummary(market, { ...base, quotes });
}
