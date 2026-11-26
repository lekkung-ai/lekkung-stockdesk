import { describe, expect, it } from 'vitest';
import { fmtPct, fmtPrice, isHalted, listingCalc, parseRatio, xrCalc, xwCalc } from './capitalCalc';

// expected values: mock calendar-capital-v2 + the 2026-11-26 study (close = scan 25 Nov)
const near = (v: number | null | undefined, want: number, tol = 0.1) => {
  expect(v).not.toBeNull();
  expect(Math.abs((v as number) - want)).toBeLessThanOrEqual(tol);
};

describe('parseRatio', () => {
  it('reads Settrade ratios', () => {
    expect(parseRatio('5.500003 : 1')).toEqual({ old: 5.500003, new: 1 });
    expect(parseRatio('1 : 12,100')).toEqual({ old: 1, new: 12100 });
    expect(parseRatio('')).toBeNull();
    expect(parseRatio('0 : 1')).toBeNull();
  });
});

describe('xrCalc', () => {
  it('SOLAR 5.500003:1 @0.32, close 0.32', () => {
    const c = xrCalc({ ratio: '5.500003 : 1', exercise: 0.32, close: 0.32, allotShare: 261424000, upcoming: true })!;
    near(c.pctNew, 18.2); near(c.holdingIfSkip, 84.6); near(c.terp, 0.32, 0.0005); near(c.discountPct, 0);
    expect(Math.abs(c.oldShares! - 1437832744)).toBeLessThan(100);
    expect(c.warn).toBe(false);
  });
  it('B52 2:3 @0.15, close 0.16 → ⚠', () => {
    const c = xrCalc({ ratio: '2 : 3', exercise: 0.15, close: 0.16, allotShare: 1509420294, upcoming: true })!;
    near(c.pctNew, 150); near(c.holdingIfSkip, 40); near(c.terp, 0.154, 0.0005); near(c.terpChgPct, -3.75);
    expect(c.oldShares).toBe(1006280196);
    expect(c.warn).toBe(true);
  });
  it('past XR never warns; halted / no close → ratio numbers only', () => {
    expect(xrCalc({ ratio: '2 : 3', exercise: 0.15, close: 0.16, upcoming: false })!.warn).toBe(false);
    const h = xrCalc({ ratio: '2 : 3', exercise: 0.15, close: 0.16, upcoming: true, halted: true })!;
    expect(h.terp).toBeNull(); expect(h.discountPct).toBeNull(); near(h.pctNew, 150);
    expect(xrCalc({ ratio: '2 : 3', exercise: 0.15, close: null, upcoming: true })!.terp).toBeNull();
  });
});

describe('listingCalc', () => {
  it('KGEN PP 200M on 2,225.7M @1.35, close 2.02 → ⚠', () => {
    const c = listingCalc({ old: 2225726175, added: 200000000, price: 1.35, close: 2.02 })!;
    near(c.pctNew, 9.0); near(c.holderGainPct, 49.6); near(c.newShare, 8.2); expect(c.warn).toBe(true);
  });
  it('STPI RO above the market → no ⚠', () => {
    const c = listingCalc({ old: 1812272387, added: 27374050, price: 5.55, close: 4.28 })!;
    near(c.pctNew, 1.5); expect(c.discountPct!).toBeLessThan(0); expect(c.warn).toBe(false);
  });
  it('IROYAL W +25.2% / 13.6% below → ⚠', () => {
    const c = listingCalc({ old: 230000000, added: 58033232, price: 2.92, close: 3.38 })!;
    near(c.pctNew, 25.2); near(c.discountPct, 13.6); expect(c.warn).toBe(true);
  });
  it('RWI PP +33.3% → ⚠ · AJA CB +0.22% → no ⚠', () => {
    const r = listingCalc({ old: 915277061, added: 304929659, price: 0.2, close: 0.45 })!;
    near(r.pctNew, 33.3); expect(r.warn).toBe(true);
    const a = listingCalc({ old: 5755838869, added: 12626262, price: 0.099, close: 0.1 })!;
    near(a.pctNew, 0.22, 0.01); expect(a.warn).toBe(false);
  });
  it('ROH halted → no price numbers, no ⚠', () => {
    const c = listingCalc({ old: 938917233, added: 280000000, price: 0.6, close: 0.14, halted: true })!;
    expect(c.discountPct).toBeNull(); expect(c.holderGainPct).toBeNull(); expect(c.warn).toBe(false);
  });
});

describe('helpers', () => {
  it('isHalted reads news_flags mark labels', () => {
    expect(isHalted(['เครื่องหมาย SP'])).toBe(true);
    expect(isHalted(['เครื่องหมาย CB, SP, CS'])).toBe(true);
    expect(isHalted(['เครื่องหมาย H'])).toBe(true);
    expect(isHalted(['เครื่องหมาย CB', 'เครื่องหมาย NR'])).toBe(false);
  });
  it('xwCalc / formatting', () => {
    near(xwCalc('2 : 1')!.pctNewMax, 50);
    expect(xwCalc('1 : 12,100')).toBeNull(); // not shares : warrants
    expect(fmtPct(18.18)).toBe('+18.2%');
    expect(fmtPct(150)).toBe('+150%');
    expect(fmtPct(0.219)).toBe('+0.22%');
    expect(fmtPct(-3.75)).toBe('−3.8%');
    expect(fmtPrice(0.154)).toBe('0.154');
    expect(fmtPrice(5.5)).toBe('5.50');
  });
});
