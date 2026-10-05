// Per-sector summary for one market (SET / MAI never mixed). Pure: every input is passed in,
// no JSON import, so the home page and Sector Map compute the same numbers the same way.
//
// chg       = market-cap-weighted % today (lib/sectorChange.weightedChange, same as Sector Map)
// rs        = sector_rs.json → sectors[market][sector].rsScore
// status    = sector_flow.json → sectors[].status (SET only; MAI → null)
// stage2Pct = (S.Bull + Bull) ÷ stocks that have a stage
// emaPct    = % of stocks with Price > EMA50 (same rule as the old home sector card)
// stageSplit= share of ALL stocks in the sector; no stage row / unrecognised stage → unknown
import { weightedChange } from './sectorChange';

export type SectorMarket = 'SET' | 'MAI';

export interface SectorEntryInput {
  sector: string;
  market: string;
  tickers: string[];
}

export interface QuoteInput {
  chg: number | null;
  mcap: number | null;
}

export interface StageInput {
  Ticker: string;
  Stage?: string | null;
  Price?: number | null;
  EMA50?: number | null;
}

export interface SectorSummaryInputs {
  sectors: SectorEntryInput[];
  quotes: Record<string, QuoteInput> | null; // null = live prices unavailable
  rs: Record<string, Record<string, { rsScore?: number | null }>> | null; // sector_rs.json → sectors
  flow: { sector: string; status?: string | null }[] | null; // sector_flow.json → sectors (SET)
  stages: StageInput[];
}

export interface StageSplit {
  bull: number;
  accum: number;
  warning: number;
  distribution: number;
  bear: number;
  unknown: number;
}

export interface SectorSummaryRow {
  name: string;
  total: number; // stocks in the sector (sector_map)
  n: number | null; // stocks counted in chg (have price + market cap); null = no live prices
  chg: number | null;
  rs: number | null;
  status: string | null;
  stage2Pct: number | null;
  emaPct: number | null;
  emaAbove: number;
  emaDenom: number;
  stageSplit: StageSplit | null;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function stageBucket(stage: string | null | undefined): keyof StageSplit {
  switch (stage) {
    case 'S.Bull':
    case 'Bull':
      return 'bull';
    case 'Accumulation':
    case 'Recovery':
      return 'accum';
    case 'Warning':
      return 'warning';
    case 'Distribution':
      return 'distribution';
    case 'Bear':
      return 'bear';
    default:
      return 'unknown';
  }
}

export function computeSectorSummary(market: SectorMarket, inputs: SectorSummaryInputs): SectorSummaryRow[] {
  const byTicker = new Map(inputs.stages.map(s => [s.Ticker, s]));
  const flowStatus = new Map((inputs.flow ?? []).map(f => [f.sector, f.status ?? null]));

  const grouped = new Map<string, string[]>();
  for (const e of inputs.sectors) {
    if (e.market !== market) continue;
    grouped.set(e.sector, [...(grouped.get(e.sector) ?? []), ...e.tickers]);
  }

  return [...grouped.entries()].map(([name, tickers]) => {
    const change = inputs.quotes
      ? weightedChange(tickers.map(t => ({ mcap: inputs.quotes?.[t]?.mcap, chg: inputs.quotes?.[t]?.chg })))
      : null;

    const counts: StageSplit = { bull: 0, accum: 0, warning: 0, distribution: 0, bear: 0, unknown: 0 };
    let withStage = 0;
    let emaAbove = 0;
    let emaDenom = 0;
    for (const t of tickers) {
      const s = byTicker.get(t);
      const bucket = stageBucket(s?.Stage);
      counts[bucket] += 1;
      if (bucket !== 'unknown') withStage += 1;
      if (s && finite(s.Price) && finite(s.EMA50)) {
        emaDenom += 1;
        if (s.Price > s.EMA50) emaAbove += 1;
      }
    }
    const pct = (k: number, d: number) => (d > 0 ? (k / d) * 100 : null);
    const rsScore = inputs.rs?.[market]?.[name]?.rsScore;

    return {
      name,
      total: tickers.length,
      n: change ? change.n : null,
      chg: change && finite(change.pct) ? change.pct : null,
      rs: finite(rsScore) ? rsScore : null,
      status: market === 'SET' ? flowStatus.get(name) ?? null : null,
      stage2Pct: pct(counts.bull, withStage),
      emaPct: pct(emaAbove, emaDenom),
      emaAbove,
      emaDenom,
      stageSplit: tickers.length > 0
        ? (Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, (v / tickers.length) * 100])) as unknown as StageSplit)
        : null,
    };
  });
}

/** Rows sorted by % today high → low; rows without a % keep their order at the end. */
export function sortByChg(rows: SectorSummaryRow[]): SectorSummaryRow[] {
  return [...rows].sort((a, b) => {
    if (a.chg == null || b.chg == null) return a.chg == null ? (b.chg == null ? 0 : 1) : -1;
    return b.chg - a.chg;
  });
}

/** ?secmkt=set|mai → market; anything else → SET. */
export function parseSecMarket(v: string | null | undefined): SectorMarket {
  return v?.toLowerCase() === 'mai' ? 'MAI' : 'SET';
}

/** Diverging bar for % today: half-width share (0–50) of the bar, saturating at ±maxPct. */
export function divergingWidth(chg: number | null, maxPct = 2): number {
  if (chg == null || !Number.isFinite(chg)) return 0;
  return (Math.min(Math.abs(chg), maxPct) / maxPct) * 50;
}
