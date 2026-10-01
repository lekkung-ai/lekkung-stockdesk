import { describe, it, expect } from 'vitest';
import {
  tierOf, toNum, parseTierFilter, inTier, vcpFootprint, vcpTooltip, isVolumeDry, compareNullLast, readMarketStage,
  READY_MIN_T, READY_MAX_TO_PIVOT, WATCH_MIN_RS, WATCH_MAX_FROM_HIGH, type SepaTierFields,
} from './sepaTier';

// baseline row = ready (contracting, 2T, 3% under pivot) and also watch-eligible (RS 90, −5% from high)
const row = (p: Partial<SepaTierFields> = {}): SepaTierFields => ({
  RS_Rating: 90, '%_From_High': '-5.00%',
  VCP_Contracting: true, VCP_T: 2, VCP_ToPivot: 3,
  VCP_Weeks: 9, VCP_MaxDepth: 13.2, VCP_FinalDepth: 4.1, VCP_VolRatio: 0.45, VCP_Footprint: '9W 13/4 2T',
  ...p,
});
// not ready: no base
const noBase = { VCP_Contracting: null, VCP_T: 0, VCP_ToPivot: null, VCP_Footprint: 'no base' };

describe('toNum', () => {
  it('reads numbers and "%"-strings, rejects everything else without throwing', () => {
    expect(toNum(5)).toBe(5);
    expect(toNum('-6.36%')).toBe(-6.36);
    expect(toNum(' 12 ')).toBe(12);
    expect(toNum(null)).toBeNull();
    expect(toNum(undefined)).toBeNull();
    expect(toNum('')).toBeNull();
    expect(toNum('%')).toBeNull();
    expect(toNum('abc')).toBeNull();
    expect(toNum(NaN)).toBeNull();
    expect(toNum(Infinity)).toBeNull();
    expect(toNum(true)).toBeNull();
    expect(toNum({})).toBeNull();
  });
});

describe('tierOf — ready', () => {
  it('contracting + T ≥ 2 + 0 ≤ ToPivot ≤ 5 → ready (ready wins over watch)', () => {
    expect(tierOf(row())).toBe('ready');
    expect(tierOf(row({ VCP_T: READY_MIN_T, VCP_ToPivot: 0 }))).toBe('ready');
    expect(tierOf(row({ VCP_T: 4, VCP_ToPivot: READY_MAX_TO_PIVOT }))).toBe('ready');
    expect(tierOf(row({ RS_Rating: 10, '%_From_High': '-40%' }))).toBe('ready'); // ready ignores RS / high
  });
  it('fails ready on each condition', () => {
    const notWatch = { RS_Rating: 50 };
    expect(tierOf(row({ ...notWatch, VCP_Contracting: false }))).toBe('rest');
    expect(tierOf(row({ ...notWatch, VCP_Contracting: 'true' }))).toBe('rest'); // must be literally true
    expect(tierOf(row({ ...notWatch, VCP_T: 1 }))).toBe('rest');
    expect(tierOf(row({ ...notWatch, VCP_ToPivot: 5.1 }))).toBe('rest');
    expect(tierOf(row({ ...notWatch, VCP_ToPivot: -0.1 }))).toBe('rest'); // already above pivot
  });
  it('null / non-numeric VCP fields fail ready, never throw', () => {
    const notWatch = { RS_Rating: 50 };
    expect(tierOf(row({ ...notWatch, VCP_Contracting: null }))).toBe('rest');
    expect(tierOf(row({ ...notWatch, VCP_T: null }))).toBe('rest');
    expect(tierOf(row({ ...notWatch, VCP_T: 'x' }))).toBe('rest');
    expect(tierOf(row({ ...notWatch, VCP_ToPivot: null }))).toBe('rest');
    expect(tierOf(row({ ...notWatch, VCP_ToPivot: undefined }))).toBe('rest');
    expect(tierOf(row({ ...notWatch, ...noBase }))).toBe('rest');
  });
});

describe('tierOf — watch / rest', () => {
  it('not ready + RS ≥ 80 + %_From_High ≥ −15 → watch', () => {
    expect(tierOf(row({ ...noBase }))).toBe('watch');
    expect(tierOf(row({ ...noBase, RS_Rating: WATCH_MIN_RS, '%_From_High': `-${WATCH_MAX_FROM_HIGH}%` }))).toBe('watch');
    expect(tierOf(row({ ...noBase, '%_From_High': 0 }))).toBe('watch'); // numeric form too
    expect(tierOf(row({ VCP_ToPivot: -2 }))).toBe('watch'); // past pivot → not ready, still watch
  });
  it('fails watch on RS or distance from high', () => {
    expect(tierOf(row({ ...noBase, RS_Rating: 79 }))).toBe('rest');
    expect(tierOf(row({ ...noBase, '%_From_High': '-15.01%' }))).toBe('rest');
  });
  it('null / non-numeric RS or %_From_High → rest, never throw', () => {
    expect(tierOf(row({ ...noBase, RS_Rating: null }))).toBe('rest');
    expect(tierOf(row({ ...noBase, RS_Rating: 'high' }))).toBe('rest');
    expect(tierOf(row({ ...noBase, '%_From_High': null }))).toBe('rest');
    expect(tierOf(row({ ...noBase, '%_From_High': 'n/a' }))).toBe('rest');
    expect(tierOf({})).toBe('rest');
  });
});

describe('parseTierFilter / inTier', () => {
  it('only ready / watch are kept; missing or invalid → all', () => {
    expect(parseTierFilter('ready')).toBe('ready');
    expect(parseTierFilter('watch')).toBe('watch');
    expect(parseTierFilter('xyz')).toBe('all');
    expect(parseTierFilter('READY')).toBe('all');
    expect(parseTierFilter(null)).toBe('all');
    expect(parseTierFilter(undefined)).toBe('all');
  });
  it('all keeps every row; ready / watch keep only that tier', () => {
    expect(inTier(row({ ...noBase, RS_Rating: 1 }), 'all')).toBe(true);
    expect(inTier(row(), 'ready')).toBe(true);
    expect(inTier(row(), 'watch')).toBe(false);
    expect(inTier(row({ ...noBase }), 'watch')).toBe(true);
  });
});

describe('VCP display helpers', () => {
  it('footprint: "no base" / missing → null', () => {
    expect(vcpFootprint(row())).toBe('9W 13/4 2T');
    expect(vcpFootprint(row({ VCP_Footprint: 'no base' }))).toBeNull();
    expect(vcpFootprint(row({ VCP_Footprint: null }))).toBeNull();
  });
  it('tooltip in plain Thai; volume < 1.0 = dry', () => {
    expect(vcpTooltip(row())).toBe('ฐาน 9 สัปดาห์ · ย่อลึกสุด 13% · ย่อรอบสุดท้าย 4% · หดตัว 2 ครั้ง · วอลุ่มรอบสุดท้าย 0.45× ของปกติ (แห้ง)');
    expect(vcpTooltip(row({ VCP_VolRatio: 1.2, VCP_Contracting: false })))
      .toBe('ฐาน 9 สัปดาห์ · ย่อลึกสุด 13% · ย่อรอบสุดท้าย 4% · หดตัว 2 ครั้ง · วอลุ่มรอบสุดท้าย 1.20× ของปกติ · ยังไม่หดตัวเป็นขั้น');
    expect(vcpTooltip(row({ ...noBase }))).toBeNull();
    expect(isVolumeDry(row())).toBe(true);
    expect(isVolumeDry(row({ VCP_VolRatio: 1 }))).toBe(false);
    expect(isVolumeDry(row({ VCP_VolRatio: null }))).toBe(false);
  });
});

describe('compareNullLast', () => {
  it('null last in both directions', () => {
    const vals = [3, null, -1, 5, undefined, 0];
    expect([...vals].sort((a, b) => compareNullLast(a, b, 'asc')).slice(0, 4)).toEqual([-1, 0, 3, 5]);
    expect([...vals].sort((a, b) => compareNullLast(a, b, 'desc')).slice(0, 4)).toEqual([5, 3, 0, -1]);
    expect([...vals].sort((a, b) => compareNullLast(a, b, 'asc')).slice(4).every(v => v == null)).toBe(true);
    expect([...vals].sort((a, b) => compareNullLast(a, b, 'desc')).slice(4).every(v => v == null)).toBe(true);
  });
});

describe('readMarketStage', () => {
  it('reads stage + DD count; Correction / Under Pressure = caution', () => {
    expect(readMarketStage({ market_stage: { stage: 'Correction', dd_count_25d: 8 } })).toEqual({ stage: 'Correction', ddCount: 8, caution: true });
    expect(readMarketStage({ market_stage: { stage: 'Under Pressure', dd_count_25d: 4 } })?.caution).toBe(true);
    expect(readMarketStage({ market_stage: { stage: 'Uptrend', dd_count_25d: 1 } })?.caution).toBe(false);
  });
  it('no data → null (strip hidden)', () => {
    expect(readMarketStage({})).toBeNull();
    expect(readMarketStage(null)).toBeNull();
    expect(readMarketStage({ market_stage: { stage: '' } })).toBeNull();
    expect(readMarketStage({ market_stage: {} })).toBeNull();
  });
});
