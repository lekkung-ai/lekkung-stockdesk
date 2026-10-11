import { describe, expect, it } from 'vitest';
import {
  allSectorEntries, stockSectorEntries, getSectorsGrouped, isFundTicker, isFundSubsector, fundTickers,
  displayGroup, tickerToSector, FUND_SUBSECTOR, FUND_GROUP_LABEL,
} from './sectorData';
import { computeSectorSummary, type SectorSummaryInputs } from './sectorSummary';
import rawStages from '../data/scans/market_stage.json';
import rawSectorRS from '../data/scans/sector_rs.json';

const funds = fundTickers();

describe('fund / REIT rule (sector_map subsector "Property Fund & REITs")', () => {
  it('flags exactly the fund subsector tickers', () => {
    expect(funds.length).toBeGreaterThan(0);
    for (const [t, info] of Object.entries(tickerToSector)) {
      expect(isFundTicker(t)).toBe(info.subsector === FUND_SUBSECTOR);
    }
    expect(isFundTicker('NOT_A_TICKER')).toBe(false);
    expect(isFundSubsector(FUND_SUBSECTOR)).toBe(true);
    expect(isFundSubsector('Property Development')).toBe(false);
  });

  it('stockSectorEntries holds no fund subsector and no fund ticker', () => {
    expect(stockSectorEntries.some(e => isFundSubsector(e.subsector))).toBe(false);
    expect(stockSectorEntries.flatMap(e => e.tickers).some(isFundTicker)).toBe(false);
  });

  it('getSectorsGrouped: Property loses only its funds, other sectors unchanged', () => {
    for (const m of ['SET', 'MAI'] as const) {
      const before = new Map(
        [...new Set(allSectorEntries.filter(e => e.market === m).map(e => e.sector))].map(s => [
          s,
          allSectorEntries.filter(e => e.market === m && e.sector === s).flatMap(e => e.tickers),
        ]),
      );
      for (const g of getSectorsGrouped(m)) {
        const old = before.get(g.sector)!;
        const nFunds = old.filter(isFundTicker).length;
        expect(g.totalCount).toBe(old.length - nFunds);
        if (nFunds === 0) expect(g.subsectors.flatMap(s => s.tickers)).toEqual(old);
      }
    }
  });

  it('displayGroup puts the fund subsector under "กองทุน & REIT"', () => {
    expect(displayGroup('Property', FUND_SUBSECTOR)).toBe(FUND_GROUP_LABEL);
    expect(displayGroup('Property', 'Property Development')).toBe('Property');
    expect(displayGroup('Property', undefined)).toBe('Property');
  });
});

describe('sector summary before → after (same data)', () => {
  const stages = rawStages as SectorSummaryInputs['stages'];
  // synthetic quotes for every ticker so % today / n are exercised too
  const quotes = Object.fromEntries(
    Object.keys(tickerToSector).map((t, i) => [t, { chg: ((i % 9) - 4) * 0.5, mcap: 1e9 + i * 1e7 }]),
  );
  const common = { quotes, rs: (rawSectorRS as { sectors: SectorSummaryInputs['rs'] }).sectors, flow: null, stages };

  it('non-fund sectors identical, Property total drops by the fund count, NaN never appears', () => {
    for (const m of ['SET', 'MAI'] as const) {
      const before = computeSectorSummary(m, { ...common, sectors: allSectorEntries });
      const after = computeSectorSummary(m, { ...common, sectors: stockSectorEntries });
      expect(after.map(r => r.name)).toEqual(before.map(r => r.name));
      for (const a of after) {
        const b = before.find(r => r.name === a.name)!;
        const nFunds = fundTickers(m).filter(t => tickerToSector[t].sector === a.name).length;
        if (nFunds === 0) expect(a).toEqual(b);
        else {
          expect(a.total).toBe(b.total - nFunds);
          expect(a.n).toBe((b.n ?? 0) - nFunds);
        }
        for (const v of Object.values(a)) if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
      }
    }
  });
});

describe('listedFundTickers (/funds = heatmap group = /sector/property link)', () => {
  it('keeps sector_map funds that have a TradingView price only', async () => {
    const { listedFundTickers } = await import('./sectorData');
    const all = fundTickers('SET');
    const quotes = Object.fromEntries(all.map((t, i) => [t, { price: i === 0 ? null : 10 }]));
    quotes['PTT'] = { price: 30 }; // a stock never counts
    expect(listedFundTickers(quotes)).toEqual(all.slice(1));
    expect(listedFundTickers({})).toEqual([]);
  });
});
