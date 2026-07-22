import rawMacro from '@/data/scans/macro_commodities.json';

export type MacroZone = 'energy' | 'agri' | 'industrial' | 'financial';

export interface MacroSeriesPoint {
  date: string;
  close: number;
}

export interface MacroCommodity {
  symbol: string;
  name_th: string;
  name_en: string;
  unit: string;
  zone: MacroZone;
  tickers: string[];
  latest: { date: string; close: number };
  pct_1d: number | null;
  pct_1m: number | null;
  series: MacroSeriesPoint[];
}

interface MacroCommoditiesJson {
  generated_at: string;
  series_days: number;
  zones: Record<MacroZone, string>;
  methodology: string;
  palm_oil_note: string;
  commodities: Record<string, Omit<MacroCommodity, 'symbol'>>;
}

const macro = rawMacro as unknown as MacroCommoditiesJson;

export const macroGeneratedAt: string = macro.generated_at;
export const macroSeriesDays: number = macro.series_days;
export const macroZoneLabels: Record<MacroZone, string> = macro.zones;
export const macroMethodology: string = macro.methodology;
export const macroPalmOilNote: string = macro.palm_oil_note;

export const macroCommodities: MacroCommodity[] = Object.entries(macro.commodities).map(
  ([symbol, data]) => ({ symbol, ...data })
);

const ZONE_ORDER: MacroZone[] = ['energy', 'agri', 'industrial', 'financial'];

export function macroCommoditiesByZone(): { zone: MacroZone; label: string; items: MacroCommodity[] }[] {
  return ZONE_ORDER.map(zone => ({
    zone,
    label: macroZoneLabels[zone],
    items: macroCommodities.filter(c => c.zone === zone),
  })).filter(group => group.items.length > 0);
}

// ticker -> commodities that affect it (a ticker can appear under more than
// one commodity, e.g. none currently do, but CPF/TFG/GFPT/TVO appear under
// both ZS=F and ZM=F)
export function macroCommoditiesForTicker(ticker: string): MacroCommodity[] {
  const t = ticker.toUpperCase();
  return macroCommodities.filter(c => c.tickers.includes(t));
}
