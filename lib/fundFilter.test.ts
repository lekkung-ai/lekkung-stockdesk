import { describe, it, expect } from 'vitest';
import {
  FUND_TICKERS, parseAssetType, matchesAssetType, countByAssetType, compareValuesNullLast, rankTopRS,
  type CombinedFundFields,
} from './fundFilter';

const funds = new Set(['WHART', 'CPNREIT']);

describe('FUND_TICKERS (combined.json Is_Fund)', () => {
  it('has the fund rows and no stocks', () => {
    expect(FUND_TICKERS.size).toBeGreaterThan(0);
    expect(FUND_TICKERS.has('PTT')).toBe(false);
  });
});

describe('parseAssetType', () => {
  it('defaults to stock for missing / unknown values', () => {
    expect(parseAssetType(null)).toBe('stock');
    expect(parseAssetType(undefined)).toBe('stock');
    expect(parseAssetType('xyz')).toBe('stock');
  });
  it('keeps valid values', () => {
    expect(parseAssetType('fund')).toBe('fund');
    expect(parseAssetType('all')).toBe('all');
    expect(parseAssetType('stock')).toBe('stock');
  });
});

describe('matchesAssetType / countByAssetType', () => {
  it('splits stock vs fund, all keeps everything', () => {
    expect(matchesAssetType('PTT', 'stock', funds)).toBe(true);
    expect(matchesAssetType('WHART', 'stock', funds)).toBe(false);
    expect(matchesAssetType('WHART', 'fund', funds)).toBe(true);
    expect(matchesAssetType('PTT', 'fund', funds)).toBe(false);
    expect(matchesAssetType('PTT', 'all', funds)).toBe(true);
  });
  it('stock + fund = all', () => {
    const c = countByAssetType(['PTT', 'WHART', 'AOT', 'CPNREIT', 'KBANK'], funds);
    expect(c).toEqual({ stock: 3, fund: 2, all: 5 });
  });
});

describe('compareValuesNullLast', () => {
  const sortBy = (vals: unknown[], dir: 'asc' | 'desc') => [...vals].sort((a, b) => compareValuesNullLast(a, b, dir));
  it('puts null / undefined / NaN last in both directions', () => {
    expect(sortBy([3, null, 1, NaN, 2, undefined], 'asc').slice(0, 3)).toEqual([1, 2, 3]);
    expect(sortBy([3, null, 1, NaN, 2, undefined], 'desc').slice(0, 3)).toEqual([3, 2, 1]);
    expect(sortBy([null, 5], 'asc')).toEqual([5, null]);
    expect(sortBy([null, 5], 'desc')).toEqual([5, null]);
  });
  it('compares strings', () => {
    expect(sortBy(['B', 'A', null], 'asc')).toEqual(['A', 'B', null]);
    expect(sortBy(['B', 'A', null], 'desc')).toEqual(['B', 'A', null]);
  });
});

describe('rankTopRS', () => {
  const r = (ticker: string, rs_score: number | null, RS_Raw: number | null, Is_Fund = false): CombinedFundFields =>
    ({ ticker, rs_score, RS_Raw, Is_Fund });
  it('sorts by rs_score desc, ties by RS_Raw desc (not alphabetical)', () => {
    const out = rankTopRS([r('AAA', 99, 1.1), r('ZZZ', 99, 2.5), r('MMM', 98, 3.0)], 10);
    expect(out.map(x => x.ticker)).toEqual(['ZZZ', 'AAA', 'MMM']);
  });
  it('excludes funds and rows without rs_score, and limits to n', () => {
    const out = rankTopRS([r('WHART', null, 9, true), r('X', null, 9), r('A', 90, 1), r('B', 80, 1), r('C', 70, 1)], 2);
    expect(out.map(x => x.ticker)).toEqual(['A', 'B']);
  });
});
