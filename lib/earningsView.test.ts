import { describe, it, expect } from 'vitest';
import { fmtMoney, hasNoProfit, pageBucket, seasonCounts } from './earningsView';
import { classifyBucket, type EarningsBucket } from './earningsBucket';

describe('fmtMoney - one unit style for every amount', () => {
  it('below 1 ล. is shown in ล. with 2 decimals (TPA -585,000)', () => {
    expect(fmtMoney(-585_000)).toBe('-0.59 ล.');
    expect(fmtMoney(585_000)).toBe('0.59 ล.');
    expect(fmtMoney(12_340)).toBe('0.01 ล.');
    expect(fmtMoney(999_999)).toBe('1.00 ล.');
  });
  it('a value that rounds to zero has no minus sign', () => {
    expect(fmtMoney(-1_000)).toBe('0.00 ล.');
    expect(fmtMoney(0)).toBe('0.00 ล.');
  });
  it('millions keep 1 decimal, billions → พันล. (unchanged)', () => {
    expect(fmtMoney(1_234_567)).toBe('1.2 ล.');
    expect(fmtMoney(-41_600_000)).toBe('-41.6 ล.');
    expect(fmtMoney(2_385_896_000)).toBe('2.39 พันล.');
    expect(fmtMoney(-669_143_000)).toBe('-669.1 ล.');
  });
  it('no figure → dash', () => {
    expect(fmtMoney(null)).toBe('—');
    expect(fmtMoney(undefined)).toBe('—');
    expect(fmtMoney(Number.NaN)).toBe('—');
  });
  it('never prints a bare baht number', () => {
    for (const v of [-999_999, -585_000, -1, 1, 4_999, 50_000, 999_999]) expect(fmtMoney(v)).toMatch(/ ล\.$/);
  });
});

describe('pageBucket - rows with no profit figure go to "ไม่มีฐานเทียบ"', () => {
  it('CTARAF-like fund row (no profit at all)', () => {
    const fund = { bucket: null, netProfit: null };
    expect(hasNoProfit(fund)).toBe(true);
    expect(pageBucket(fund)).toBe('no_base');
  });
  it('every classified row keeps its own bucket', () => {
    const cases: [number, number | null, EarningsBucket][] = [
      [120, 100, 'profit_growth'], [80, 100, 'profit_shrink'], [5, -10, 'turnaround'],
      [-5, -10, 'loss_shrink'], [-20, -10, 'loss_worse'], [-5, 10, 'loss_worse'], [50, null, 'no_base'], [50, 0, 'no_base'],
    ];
    for (const [np, prior, want] of cases) {
      const bucket = classifyBucket(np, prior);
      expect(bucket).toBe(want);
      expect(pageBucket({ bucket, netProfit: np })).toBe(want);
    }
  });
  it('classifyBucket itself is unchanged (still null without a profit figure)', () => {
    expect(classifyBucket(null, 100)).toBeNull();
    expect(classifyBucket(null, null)).toBeNull();
  });
});

describe('seasonCounts - no-profit rows are counted as filed, not in the proportion', () => {
  const rows = [
    { bucket: 'profit_growth' as const, netProfit: 10 },
    { bucket: 'turnaround' as const, netProfit: 5 },
    { bucket: 'profit_shrink' as const, netProfit: 3 },
    { bucket: 'no_base' as const, netProfit: 7 },
    { bucket: null, netProfit: null },
    { bucket: null, netProfit: null },
  ];
  it('counts', () => {
    expect(seasonCounts(rows)).toEqual({ n: 6, noProfit: 2, base: 4, up: 2, down: 1, upPct: 50 });
  });
  it('without no-profit rows nothing changes', () => {
    expect(seasonCounts(rows.slice(0, 4))).toEqual({ n: 4, noProfit: 0, base: 4, up: 2, down: 1, upPct: 50 });
  });
  it('empty / only no-profit rows', () => {
    expect(seasonCounts([])).toEqual({ n: 0, noProfit: 0, base: 0, up: 0, down: 0, upPct: 0 });
    expect(seasonCounts([{ bucket: null, netProfit: null }]).upPct).toBe(0);
  });
});
