import { describe, it, expect } from 'vitest';
import { weightedChange, formatPct } from './sectorChange';
import { squarify } from './treemap';
import { topNWithOther } from './heatmapGroups';

describe('weightedChange', () => {
  it('weights by previous-day market cap', () => {
    // A: prev 100 (+10% → now 110), B: prev 300 (0% → 300)
    const r = weightedChange([{ mcap: 110, chg: 10 }, { mcap: 300, chg: 0 }]);
    expect(r.pct).toBeCloseTo((100 * 10) / 400, 10);
    expect(r).toMatchObject({ n: 2, total: 2 });
  });
  it('skips missing / bad values and never returns NaN', () => {
    const r = weightedChange([
      { mcap: null, chg: 1 }, { mcap: 100, chg: undefined }, { mcap: 0, chg: 1 },
      { mcap: 100, chg: -100 }, { mcap: NaN, chg: 1 }, { mcap: 100, chg: 2 },
    ]);
    expect(r.n).toBe(1);
    expect(r.total).toBe(6);
    expect(Number.isFinite(r.pct)).toBe(true);
  });
  it('returns null pct for an empty group', () => {
    expect(weightedChange([])).toEqual({ pct: null, n: 0, total: 0 });
  });
});

describe('formatPct', () => {
  it('signs and handles null', () => {
    expect(formatPct(1.234)).toBe('+1.23%');
    expect(formatPct(-0.5)).toBe('−0.50%');
    expect(formatPct(0)).toBe('0.00%');
    expect(formatPct(null)).toBe('—');
  });
});

describe('squarify', () => {
  it('fills the box with area proportional to value', () => {
    const rects = squarify([1, 2, 3, 4, 10].map(v => ({ item: v, value: v })), 0, 0, 200, 100);
    const area = rects.reduce((a, r) => a + r.w * r.h, 0);
    expect(area).toBeCloseTo(200 * 100, 6);
    const r10 = rects.find(r => r.item === 10)!;
    expect(r10.w * r10.h).toBeCloseTo(20000 * 0.5, 6);
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(-1e-9);
      expect(r.x + r.w).toBeLessThanOrEqual(200 + 1e-9);
      expect(r.y + r.h).toBeLessThanOrEqual(100 + 1e-9);
    }
  });
  it('ignores non-positive values', () => {
    expect(squarify([{ item: 'a', value: 0 }, { item: 'b', value: NaN }], 0, 0, 10, 10)).toEqual([]);
  });
});



describe('topNWithOther', () => {
  const mk = (ticker: string, mcap: number, chg: number | null) => ({ ticker, mcap, chg, price: 1, rs: null, stage: null });
  it('keeps top n by mcap and folds the rest', () => {
    const stocks = [mk('A', 100, 1), mk('B', 50, -1), mk('C', 30, 2), mk('D', 10, -4), mk('E', 10, 0)];
    const r = topNWithOther(stocks, 2, '/sector/x');
    expect(r.map(s => s.ticker)).toEqual(['A', 'B', 'อื่นๆ (3 ตัว)']);
    const o = r[2];
    expect(o.mcap).toBe(50);
    expect(o.other?.count).toBe(3);
    expect(o.other?.movers[0].ticker).toBe('D');
    expect(o.chg).toBe(o.other?.pct);
  });
  it('adds no other box when n covers everything', () => {
    expect(topNWithOther([mk('A', 1, 0)], 15, '/x')).toHaveLength(1);
  });
});
