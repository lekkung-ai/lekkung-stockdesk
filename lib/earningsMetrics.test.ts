import { describe, it, expect } from 'vitest';
import {
  fixSaraAm, meaningfulYoY, isTurnaround, isPreviousQuarter, isAccelerating,
  isPead, peadRanked, PEAD_MIN_D2_PCT, PEAD_MIN_ADTV_MB, priorQuarterImproved, pricePath, isTableLikeReason, reasonPreview, compareProfit, type EarningsFigures,
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
    expect(peadRanked(list, () => 20).map(a => a.drift_d2_pct)).toEqual([5, 1]);
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
  const LIQ = 20; // ADTV ล./วัน, comfortably liquid
  it('thresholds (ค่าทดลอง 7 พ.ย. 2569)', () => {
    expect(PEAD_MIN_D2_PCT).toBe(1);
    expect(PEAD_MIN_ADTV_MB).toBe(5);
  });
  it('YoY ≥ 20% and D+2 ≥ 1% and ADTV ≥ 5', () => {
    expect(isPead(f({ netProfit: 120, netProfitPrior: 100, drift_d2_pct: 3 }), LIQ)).toBe(true);
  });
  it('D+2 exactly 1.0 is in, 0.99 / 0.5 are out (was "> 0")', () => {
    expect(isPead(f({ netProfit: 200, netProfitPrior: 100, drift_d2_pct: 1.0 }), LIQ)).toBe(true);
    expect(isPead(f({ netProfit: 200, netProfitPrior: 100, drift_d2_pct: 0.99 }), LIQ)).toBe(false);
    expect(isPead(f({ netProfit: 200, netProfitPrior: 100, drift_d2_pct: 0.5 }), LIQ)).toBe(false);
  });
  it('ADTV exactly 5 is in, below 5 is out', () => {
    const a = f({ netProfit: 200, netProfitPrior: 100, drift_d2_pct: 4 });
    expect(isPead(a, 5)).toBe(true);
    expect(isPead(a, 4.99)).toBe(false);
    expect(isPead(a, 2.5)).toBe(false); // SPVI 7 พ.ย.: +7.88% but ADTV 2.5
  });
  it('no ADTV (not in market_stage) → out', () => {
    const a = f({ netProfit: 200, netProfitPrior: 100, drift_d2_pct: 4 });
    expect(isPead(a, undefined)).toBe(false);
    expect(isPead(a, null)).toBe(false);
    expect(isPead(a, NaN)).toBe(false);
  });
  it('turnaround and D+2 ≥ 1 and liquid', () => {
    expect(isPead(f({ netProfit: 10, netProfitPrior: -5, drift_d2_pct: 2 }), LIQ)).toBe(true);
    expect(isPead(f({ netProfit: 10, netProfitPrior: -5, drift_d2_pct: 2 }), 1)).toBe(false);
  });
  it('YoY below 20% → out', () => {
    expect(isPead(f({ netProfit: 119, netProfitPrior: 100, drift_d2_pct: 3 }), LIQ)).toBe(false);
  });
  it('D+2 ≤ 0 or not yet known → out', () => {
    expect(isPead(f({ netProfit: 200, netProfitPrior: 100, drift_d2_pct: 0 }), LIQ)).toBe(false);
    expect(isPead(f({ netProfit: 200, netProfitPrior: 100, drift_d2_pct: null }), LIQ)).toBe(false);
  });
  it('sorted by D+2, highest first; illiquid ones dropped', () => {
    const list = [1, 9, 4, 7].map(d => ({ ...f({ netProfit: 200, netProfitPrior: 100, drift_d2_pct: d }), adtv: d === 7 ? 2 : LIQ }));
    expect(peadRanked(list, a => a.adtv).map(a => a.drift_d2_pct)).toEqual([9, 4, 1]);
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

// Real MD&A texts from earnings_feed.json (2026-11-03).
const REASON = {
  CREDIT: 'รวมรายได้จากการดำเนินงานสุทธิ 4,604.7 4,112.0 12.0 3,821.4 20.5 12,510.5 10,978.7 14.0 รวมค่าใช้จ่ายจากการดำเนินงานอื่น ๆ 1,823.7 1,745.8 4.5 1,614.4 13.0 5,236.2 4,672.9 12.1 ผลขาดทุนด้านเครดิตที่คาดว่าจะเกิดขึ้น 1,227.7',
  SO: '68 ล้านบาท % ล้านบาท % ล้านบาท % รายได้ รายได้ค่าบริการจัดหาบุคลากรและบริการอื่น 1,726.00 79.53% 1,730.06 79.92% (4.06) (0.23)% รายได้ค่าเช่าและบริการ 417.65 19.25% 367.18 16.96% 50.47 13.75% กำไรจากการจำหน่ายสินทรัพย์ให้เช่ารอการขายและอุปกรณ์ 17.09 0.79% 58.88 2.72% (41.79) (70.97)% รายได้อื่น /1 9.41 0.43% 8.57 0.40% 0.84 9.80% รวมรายได้ 2,170.15 100.00% 2,164.69 100.00% 5.46 0.25% ค่าใช้จ่าย',
  TNP: 'บริษัทมีรายได้จากการขายรวมทั้ง 3 ช่องทางรวมจำนวน 929.27 ล้านบาท เพิ่มขึ้นร้อยละ 27.11 เมื่อ เทียบจากงวดเดียวกันของปีก่อน และมีกำไรสุทธิจำนวน 57.63 ล้านบาท เพิ่มขึ้นร้อยละ 20.91 เมื่อเทียบกับช่วงเดียวกันของปี ก่อน สำหรับงวด 9',
  GLOBAL: 'มีปัจจัยหลักมาจากการปรับตัวดีขึ้นของอัตรากำไรขั้นต้น อันเป็นผลจากการเพิ่มสัดส่วนยอดขายสินค้า House Brand ร่วมกับการบริหารจัดการต้นทุนและควบคุมค่าใช้จ่ายในการดำเนินงานอย่างมีประสิทธิภาพ แม้ว่าภาวะเศรษฐกิจโดยรวมและกำลังซื้อ',
};

describe('isTableLikeReason / reasonPreview', () => {
  it('hides the table-like texts (CREDIT, SO)', () => {
    expect(isTableLikeReason(REASON.CREDIT)).toBe(true);
    expect(isTableLikeReason(REASON.SO)).toBe(true);
    expect(reasonPreview(REASON.CREDIT)).toBe('');
  });
  it('keeps real sentences (TNP, GLOBAL), even with figures inside', () => {
    expect(isTableLikeReason(REASON.TNP)).toBe(false);
    expect(isTableLikeReason(REASON.GLOBAL)).toBe(false);
    expect(reasonPreview(REASON.TNP)).toBe(REASON.TNP);
  });
  it('more than 4 numbers side by side hides; exactly 4 does not', () => {
    expect(isTableLikeReason('กำไรสุทธิ ยอดขายรวมทั้งปีเพิ่มขึ้นจากการขยายสาขาใหม่และการบริหารต้นทุนที่ดีขึ้น 1.0 2.0 3.0 4.0 5.0 จากปีก่อน')).toBe(true);
    expect(isTableLikeReason('กำไรสุทธิ ยอดขายรวมทั้งปีเพิ่มขึ้นจากการขยายสาขาใหม่และการบริหารต้นทุนที่ดีขึ้น 1.0 2.0 3.0 4.0 จากปีก่อน')).toBe(false);
  });
  it('character ratio over 35% hides', () => {
    expect(isTableLikeReason('กำไร 1,234.56 7,890.12%')).toBe(true);
  });
  it('empty / missing -> no preview, no placeholder', () => {
    expect(reasonPreview('')).toBe('');
    expect(reasonPreview(null)).toBe('');
    expect(isTableLikeReason(undefined)).toBe(false);
  });
  it('applies the sara-am fix to what it shows', () => {
    expect(reasonPreview(`รวมจ ${AM}นวนเพิ่มขึ้นจากปีก่อนอย่างมีนัยสำคัญ`)).toBe(`รวมจ${AM}นวนเพิ่มขึ้นจากปีก่อนอย่างมีนัยสำคัญ`);
  });
});

describe('compareProfit', () => {
  it('profit both periods → %', () => {
    expect(compareProfit(120, 100)).toEqual({ kind: 'pct', pct: 20 });
    expect(compareProfit(0, 100)).toEqual({ kind: 'pct', pct: -100 });
  });
  it('sign flips and loss-vs-loss are labels, never a %', () => {
    expect(compareProfit(2386, -669)).toEqual({ kind: 'turnaround' });   // SCC
    expect(compareProfit(5, 0)).toEqual({ kind: 'turnaround' });
    expect(compareProfit(-56, 9)).toEqual({ kind: 'to_loss' });
    expect(compareProfit(-253, -20)).toEqual({ kind: 'loss_more' });     // SAMCO
    expect(compareProfit(-10, -30)).toEqual({ kind: 'loss_less' });
  });
  it('nothing to compare → null', () => {
    expect(compareProfit(100, null)).toBeNull();
    expect(compareProfit(null, 100)).toBeNull();
    expect(compareProfit(-5, 0)).toBeNull();
  });
});
