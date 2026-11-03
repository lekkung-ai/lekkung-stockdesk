import { describe, it, expect } from 'vitest';
import {
  fixSaraAm, meaningfulYoY, isTurnaround, isPreviousQuarter, isAccelerating,
  isPead, peadRanked, priorQuarterImproved, pricePath, type EarningsFigures,
} from './earningsMetrics';

const AM = String.fromCharCode(0x0e33);
const NIKHAHIT_AA = String.fromCharCode(0x0e4d, 0x0e32);

const Q3 = { quarter: 'ไตรมาส 3/2569', priorQuarter: 'ไตรมาส 2/2569' };

function f(over: Partial<EarningsFigures>): EarningsFigures {
  return { netProfit: 100, netProfitPrior: 80, ...Q3, ...over };
}

describe('fixSaraAm', () => {
  it('joins a stray space before sara am (TNP "จ ำนวน", "ก ำไร")', () => {
    expect(fixSaraAm(`รวมจ ${AM}นวน 929 ล้านบาท ก ${AM}ไร`)).toBe(`รวมจ${AM}นวน 929 ล้านบาท ก${AM}ไร`);
  });
  it('turns nikhahit + sara aa into one sara am code point (CITY "สําคัญ")', () => {
    const fixed = fixSaraAm(`นัยส${NIKHAHIT_AA}คัญ`);
    expect(fixed).toBe(`นัยส${AM}คัญ`);
    expect(fixed).not.toContain(String.fromCharCode(0x0e4d));
  });
  it('leaves correct text alone', () => {
    const ok = `กำไรสุทธิ 57.63 ล้านบาท เพิ่มขึ้นร้อยละ 20.91`;
    expect(fixSaraAm(ok)).toBe(ok);
  });
});

describe('turnaround (พลิกกำไร)', () => {
  it('SCC: loss last year, profit now → turnaround, no %', () => {
    const scc = f({ netProfit: 2_385_896_000, netProfitPrior: -669_143_000 });
    expect(isTurnaround(scc)).toBe(true);
    expect(meaningfulYoY(scc.netProfit, scc.netProfitPrior)).toBeNull();
  });
  it('zero last year counts as turnaround', () => {
    expect(isTurnaround(f({ netProfit: 5, netProfitPrior: 0 }))).toBe(true);
  });
  it('profit both years → %, not turnaround', () => {
    const a = f({ netProfit: 120, netProfitPrior: 100 });
    expect(isTurnaround(a)).toBe(false);
    expect(meaningfulYoY(a.netProfit, a.netProfitPrior)).toBeCloseTo(20);
  });
  it('never ranks in PEAD by % - ranked only by D+2', () => {
    const list = [
      f({ netProfit: 2385, netProfitPrior: -669, drift_d2_pct: 1 }),   // turnaround, +456% "growth"
      f({ netProfit: 130, netProfitPrior: 100, drift_d2_pct: 5 }),      // +30%
    ];
    expect(peadRanked(list).map(a => a.drift_d2_pct)).toEqual([5, 1]);
  });
});

describe('⚡ acceleration', () => {
  it('this quarter YoY > last quarter YoY and > 0', () => {
    // now +25% (125 vs 100), last quarter +10% (110 vs 100)
    expect(isAccelerating(f({ netProfit: 125, netProfitPrior: 100, netProfitPriorQ: 110, netProfitPriorQPrior: 100 }))).toBe(true);
  });
  it('growing but slower than last quarter → no badge', () => {
    expect(isAccelerating(f({ netProfit: 105, netProfitPrior: 100, netProfitPriorQ: 150, netProfitPriorQPrior: 100 }))).toBe(false);
  });
  it('faster than last quarter but still negative → no badge', () => {
    expect(isAccelerating(f({ netProfit: 90, netProfitPrior: 100, netProfitPriorQ: 50, netProfitPriorQPrior: 100 }))).toBe(false);
  });
  it('no last-quarter data → no badge', () => {
    expect(isAccelerating(f({ netProfit: 200, netProfitPrior: 100, netProfitPriorQ: null, netProfitPriorQPrior: null }))).toBe(false);
  });
  it('last quarter not back-to-back (Q1 vs last year Q3) → no badge', () => {
    expect(isAccelerating(f({
      quarter: 'ไตรมาส 1/2569', priorQuarter: 'ไตรมาส 3/2568',
      netProfit: 200, netProfitPrior: 100, netProfitPriorQ: 110, netProfitPriorQPrior: 100,
    }))).toBe(false);
  });
  it('turnaround is never ⚡ (no meaningful %)', () => {
    expect(isAccelerating(f({ netProfit: 200, netProfitPrior: -100, netProfitPriorQ: 110, netProfitPriorQPrior: 100 }))).toBe(false);
  });
  it('isPreviousQuarter only for Q(n-1) of the same year', () => {
    expect(isPreviousQuarter('ไตรมาส 3/2569', 'ไตรมาส 2/2569')).toBe(true);
    expect(isPreviousQuarter('ไตรมาส 1/2569', 'ไตรมาส 2/2569')).toBe(false);
    expect(isPreviousQuarter('ประจำปี 2569', 'ไตรมาส 3/2569')).toBe(false);
  });
});

describe('PEAD', () => {
  it('YoY ≥ 20% and D+2 > 0', () => {
    expect(isPead(f({ netProfit: 120, netProfitPrior: 100, drift_d2_pct: 0.5 }))).toBe(true);
  });
  it('turnaround and D+2 > 0', () => {
    expect(isPead(f({ netProfit: 10, netProfitPrior: -5, drift_d2_pct: 2 }))).toBe(true);
  });
  it('YoY below 20% → out', () => {
    expect(isPead(f({ netProfit: 119, netProfitPrior: 100, drift_d2_pct: 3 }))).toBe(false);
  });
  it('D+2 ≤ 0 or not yet known → out', () => {
    expect(isPead(f({ netProfit: 200, netProfitPrior: 100, drift_d2_pct: 0 }))).toBe(false);
    expect(isPead(f({ netProfit: 200, netProfitPrior: 100, drift_d2_pct: null }))).toBe(false);
  });
  it('sorted by D+2, highest first', () => {
    const list = [1, 9, 4].map(d => f({ netProfit: 200, netProfitPrior: 100, drift_d2_pct: d }));
    expect(peadRanked(list).map(a => a.drift_d2_pct)).toEqual([9, 4, 1]);
  });
});

describe('priorQuarterImproved', () => {
  it('uses last quarter vs its own year-ago', () => {
    expect(priorQuarterImproved(f({ netProfitPriorQ: 110, netProfitPriorQPrior: 100 }))).toBe(true);
    expect(priorQuarterImproved(f({ netProfitPriorQ: 90, netProfitPriorQPrior: 100 }))).toBe(false);
    expect(priorQuarterImproved(f({ netProfitPriorQ: -5, netProfitPriorQPrior: -10 }))).toBe(true);
    expect(priorQuarterImproved(f({ netProfitPriorQ: 90, netProfitPriorQPrior: null }))).toBeNull();
  });
});

describe('pricePath', () => {
  it('uses the stored daily path: pre at x<0 ending on 0%, post from x=0', () => {
    const p = pricePath(f({ price_path: { pre: [-1, 0.5, 0], post: [2, 3, 4] } }));
    expect(p.pre).toEqual([{ x: -3, y: -1 }, { x: -2, y: 0.5 }, { x: -1, y: 0 }]);
    expect(p.post).toEqual([{ x: 0, y: 2 }, { x: 1, y: 3 }, { x: 2, y: 4 }]);
  });
  it('falls back to base 0% → วันแรก / +1 / +2 / +5 when no path stored', () => {
    const p = pricePath(f({ gap_pct: 1, drift_d1_pct: 2, drift_d2_pct: 3, drift_d5_pct: null }));
    expect(p.pre).toEqual([{ x: -1, y: 0 }]);
    expect(p.post).toEqual([{ x: 0, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 3 }]);
  });
});
