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
  ticker_impacts?: Record<string, 'revenue' | 'cost' | 'margin'>;
  latest: { date: string; close: number };
  pct_1d: number | null;
  pct_1m: number | null;
  series: MacroSeriesPoint[];
  // สถานะความสด/ครบของ series (merge-guard) — optional เพราะ JSON เก่าไม่มี field
  is_stale_fallback?: boolean;
  series_empty?: boolean;
  last_success_date?: string | null;
  never_fetched?: boolean;
  // แหล่งราคาจริงของรอบที่ได้ราคานี้ (data-engine fetch_macro ตั้งแต่ 2026-10-16) — JSON เก่า / ค่าที่ค้างจาก
  // ก่อนมี field นี้ = null → หน้าเว็บแสดง key เดิมและไม่ใส่ป้ายแหล่ง (ไม่เดา)
  source?: string | null;         // "TradingView continuous" | "TradingView scanner" | "TradingView TA" | "Yahoo Finance"
  source_symbol?: string | null;  // เช่น "ICEEUR:BRN1!" · Yahoo = key เดิม (เช่น "HG=F")
}

/** ป้ายแหล่งแบบสั้นบนการ์ด · ไม่มีข้อมูลแหล่ง → null */
export function macroSourceLabel(source: string | null | undefined): string | null {
  if (!source) return null;
  if (source === 'TradingView continuous') return 'TradingView continuous';
  if (source.startsWith('TradingView')) return 'TradingView';
  if (source.startsWith('Yahoo')) return 'Yahoo';
  return source;
}

interface MacroCommoditiesJson {
  generated_at: string;
  series_days: number;
  zones: Record<MacroZone, string>;
  methodology: string;
  palm_oil_note: string;
  commodities: Record<string, Omit<MacroCommodity, 'symbol'>>;
}

const m = (rawMacro as any)?.default ?? rawMacro ?? {};
const macro = m as unknown as MacroCommoditiesJson;

export const macroGeneratedAt: string = macro.generated_at || new Date().toISOString();
export const macroSeriesDays: number = macro.series_days || 180;
export const macroZoneLabels: Record<MacroZone, string> = macro.zones || {
  energy: 'พลังงาน',
  agri: 'เกษตร-อาหาร',
  industrial: 'โลหะ-อุตสาหกรรม',
  financial: 'การเงิน-ดอกเบี้ย',
};
export const macroMethodology: string = macro.methodology || '';
export const macroPalmOilNote: string = macro.palm_oil_note || '';

const rawEntries = Object.entries(macro.commodities || {});

export const macroCommodities: MacroCommodity[] = rawEntries.map(
  ([symbol, data]) => ({
    symbol,
    name_th: data.name_th || symbol,
    name_en: data.name_en || symbol,
    unit: data.unit || '',
    zone: data.zone || 'financial',
    tickers: data.tickers || [],
    ticker_impacts: data.ticker_impacts || {},
    latest: data.latest || { date: '', close: 0 },
    pct_1d: data.pct_1d ?? null,
    pct_1m: data.pct_1m ?? null,
    series: data.series || [],
    is_stale_fallback: data.is_stale_fallback ?? false,
    series_empty: data.series_empty ?? false,
    last_success_date: data.last_success_date ?? null,
    never_fetched: data.never_fetched ?? false,
    source: data.source ?? null,
    source_symbol: data.source_symbol ?? null,
  })
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
