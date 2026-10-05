import { describe, it, expect } from 'vitest';
import { computeSectorSummary, divergingWidth, parseSecMarket, sortByChg, type SectorSummaryInputs } from './sectorSummary';
import { weightedChange } from './sectorChange';

const inputs = (p: Partial<SectorSummaryInputs> = {}): SectorSummaryInputs => ({
  sectors: [
    { sector: 'Agro', market: 'SET', tickers: ['A1', 'A2'] },
    { sector: 'Agro', market: 'SET', tickers: ['A3'] },
    { sector: 'Consump', market: 'SET', tickers: ['C1'] },
    { sector: 'Consumer', market: 'MAI', tickers: ['M1', 'M2'] },
  ],
  quotes: {
    A1: { chg: 1, mcap: 101 },
    A2: { chg: -1, mcap: 99 },
    A3: { chg: null, mcap: 50 },
    C1: { chg: 2, mcap: 10 },
    M1: { chg: 5, mcap: 1 },
  },
  rs: { SET: { Agro: { rsScore: 61 } }, MAI: { Consumer: { rsScore: 40 } } },
  flow: [{ sector: 'Agro', status: 'แข็งต่อเนื่อง' }, { sector: 'Consumer', status: 'อ่อนต่อเนื่อง' }],
  stages: [
    { Ticker: 'A1', Stage: 'S.Bull', Price: 10, EMA50: 9 },
    { Ticker: 'A2', Stage: 'Warning', Price: 8, EMA50: 9 },
    { Ticker: 'C1', Stage: 'Recovery', Price: 5, EMA50: 4 },
    { Ticker: 'M1', Stage: 'Bear', Price: 1, EMA50: 2 },
    { Ticker: 'M2', Stage: 'Weird', Price: 3, EMA50: 2 },
  ],
  ...p,
});

describe('computeSectorSummary', () => {
  it('keeps markets apart and merges subsectors of one sector', () => {
    const set = computeSectorSummary('SET', inputs());
    expect(set.map(r => r.name)).toEqual(['Agro', 'Consump']);
    expect(computeSectorSummary('MAI', inputs()).map(r => r.name)).toEqual(['Consumer']);
    expect(set[0].total).toBe(3);
  });

  it('uses the existing market-cap weighting for % today', () => {
    const agro = computeSectorSummary('SET', inputs())[0];
    const expected = weightedChange([{ mcap: 101, chg: 1 }, { mcap: 99, chg: -1 }, { mcap: 50, chg: null }]);
    expect(agro.chg).toBe(expected.pct);
    expect(agro.n).toBe(2);
  });

  it('takes RS per market and trend status for SET only', () => {
    const [agro, consump] = computeSectorSummary('SET', inputs());
    expect(agro.rs).toBe(61);
    expect(agro.status).toBe('แข็งต่อเนื่อง');
    expect(consump.rs).toBeNull();
    expect(consump.status).toBeNull();
    const [mai] = computeSectorSummary('MAI', inputs());
    expect(mai.rs).toBe(40);
    expect(mai.status).toBeNull(); // sector_flow is SET-only even if a name matches
  });

  it('computes stage 2, EMA50 and the stage split', () => {
    const agro = computeSectorSummary('SET', inputs())[0];
    expect(agro.stage2Pct).toBe(50); // 1 bull of 2 with a stage (A3 has none)
    expect([agro.emaAbove, agro.emaDenom, agro.emaPct]).toEqual([1, 2, 50]);
    const s = agro.stageSplit!;
    expect(s.bull + s.accum + s.warning + s.distribution + s.bear + s.unknown).toBeCloseTo(100);
    expect(s.unknown).toBeCloseTo(100 / 3);
    const [mai] = computeSectorSummary('MAI', inputs());
    expect(mai.stageSplit!.unknown).toBe(50); // unrecognised stage name
    expect(mai.stage2Pct).toBe(0);
  });

  it('returns null, never NaN, when data is missing', () => {
    const rows = computeSectorSummary('SET', inputs({ quotes: null, rs: null, flow: null, stages: [] }));
    for (const r of rows) {
      expect(r.chg).toBeNull();
      expect(r.n).toBeNull();
      expect(r.rs).toBeNull();
      expect(r.status).toBeNull();
      expect(r.stage2Pct).toBeNull();
      expect(r.emaPct).toBeNull();
      expect(Object.values(r).some(v => typeof v === 'number' && Number.isNaN(v))).toBe(false);
    }
    const noPrice = computeSectorSummary('SET', inputs({ quotes: {} }));
    expect(noPrice[0].chg).toBeNull();
    expect(noPrice[0].n).toBe(0);
  });
});

describe('helpers', () => {
  it('sorts by % today with nulls last', () => {
    const rows = computeSectorSummary('SET', inputs());
    expect(sortByChg(rows).map(r => r.name)).toEqual(['Consump', 'Agro']);
    const withNull = [{ ...rows[0], chg: null }, rows[1]];
    expect(sortByChg(withNull).map(r => r.chg === null)).toEqual([false, true]);
  });

  it('parses ?secmkt', () => {
    expect(parseSecMarket('mai')).toBe('MAI');
    expect(parseSecMarket('MAI')).toBe('MAI');
    expect(parseSecMarket('set')).toBe('SET');
    expect(parseSecMarket(null)).toBe('SET');
    expect(parseSecMarket('x')).toBe('SET');
  });

  it('diverging bar saturates at ±2%', () => {
    expect(divergingWidth(1)).toBe(25);
    expect(divergingWidth(-3)).toBe(50);
    expect(divergingWidth(null)).toBe(0);
  });
});
