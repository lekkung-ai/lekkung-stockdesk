import { describe, expect, it } from 'vitest';
import {
  fmtDay, fmtDayRange, fmtPct, fmtPrice, fmtPriceShort, isHalted, lastCumDate, listingCalc, niceNum, parseRatio, pickSummary, rightsExample, xrCalc, xwCalc,
} from './capitalCalc';

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

// ─── v3 ───

describe('v3 helpers', () => {
  it('lastCumDate = working day before xdate (Mon–Fri)', () => {
    expect(lastCumDate('2026-11-27')).toBe('2026-11-26'); // B52, Friday → Thursday
    expect(lastCumDate('2026-11-30')).toBe('2026-11-27'); // Monday → previous Friday
    expect(lastCumDate('2026-11-28')).toBe('2026-11-27'); // Saturday xdate (not real, still safe)
    expect(lastCumDate('2026-11-26')).toBe('2026-11-25'); // SOLAR
  });
  it('rightsExample: 10,000 shares', () => {
    const b = rightsExample({ ratio: '2 : 3', exercise: 0.15 })!;
    expect(b.rights).toBe(15000); expect(b.money).toBeCloseTo(2250, 6); expect(b.totalIfAll).toBe(25000); near(b.holdingIfSkip, 40);
    const s = rightsExample({ ratio: '5.500003 : 1', exercise: 0.32 })!;
    expect(s.rights).toBe(1818); expect(s.money).toBeCloseTo(581.76, 6); expect(Math.round(s.money!)).toBe(582);
    const w = rightsExample({ ratio: '2 : 1' })!;
    expect(w.rights).toBe(5000); expect(w.money).toBeNull();
    expect(rightsExample({ ratio: 'x' })).toBeNull();
  });
  it('niceNum keeps clean numbers, trims noisy decimals', () => {
    expect(niceNum(5.500003)).toBe('5.5');
    expect(niceNum(34.475238)).toBe('34.48');
    expect(niceNum(3.3533)).toBe('3.35');
    expect(niceNum(0.1714)).toBe('0.1714');
    expect(niceNum(2)).toBe('2');
    expect(niceNum(12100)).toBe('12,100');
  });
  it('fmtPriceShort: 3 decimals under 2 baht', () => {
    expect(fmtPriceShort(0.3031)).toBe('0.303');
    expect(fmtPriceShort(0.32)).toBe('0.32');
    expect(fmtPriceShort(0.3)).toBe('0.30');
    expect(fmtPriceShort(0.154)).toBe('0.154');
    expect(fmtPriceShort(2.02)).toBe('2.02');
    expect(fmtPriceShort(null)).toBe('—');
  });
  it('day labels', () => {
    expect(fmtDay('2026-11-27', '2026-11-26')).toBe('27 พ.ย.');
    expect(fmtDay('2027-01-15', '2026-11-26')).toBe('15 ม.ค. 70');
    expect(fmtDayRange('2027-01-15', '2027-01-21', '2026-11-26')).toBe('15–21 ม.ค. 70');
    expect(fmtDayRange('2026-12-30', '2027-01-05', '2026-11-26')).toBe('30 ธ.ค. – 5 ม.ค. 70');
  });
  it('pickSummary priority and fallback', () => {
    const today = '2026-11-26';
    expect(pickSummary({ lastCum: today, today, discountPct: 6, pctNew: 150 })).toEqual([{ kind: 'last_cum', urgent: true, days: 0 }, { kind: 'bigger' }]);
    expect(pickSummary({ lastCum: '2026-11-27', today, discountPct: -6.7, pctNew: 18 })).toEqual([{ kind: 'last_cum', days: 1 }, { kind: 'expensive' }]);
    expect(pickSummary({ lastCum: '2026-11-25', today, discountPct: -6.7, pctNew: 18.2 })).toEqual([{ kind: 'expensive' }]); // SOLAR on 26 Nov
    expect(pickSummary({ lastCum: '2026-11-25', today, discountPct: 6, pctNew: 150 })).toEqual([{ kind: 'bigger' }]);
    expect(pickSummary({ lastCum: '2026-12-10', today, discountPct: 0, pctNew: 10 })).toEqual([{ kind: 'example' }]);
  });
});
