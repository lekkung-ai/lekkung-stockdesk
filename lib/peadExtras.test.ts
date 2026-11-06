import { describe, it, expect } from 'vitest';
import { auditorWarn, buildPeadExtras, groupLabel, liquidityWarn, peadWarnings, weinsteinWarn } from './peadExtras';

describe('auditorWarn (4 shapes)', () => {
  it('มีเงื่อนไข → red, text = the part before "และ"', () => {
    const w = auditorWarn('มีเงื่อนไขและมีข้อสังเกต/เรื่องอื่น')!;
    expect(w.level).toBe('red');
    expect(w.text).toBe('ผู้สอบบัญชี: มีเงื่อนไข');
    expect(w.title).toContain('มีเงื่อนไขและมีข้อสังเกต/เรื่องอื่น');
  });
  it('ไม่แสดงความ… → red (both spellings seen in the feed)', () => {
    expect(auditorWarn('ไม่แสดงความเห็นและมีข้อสังเกต/เรื่องอื่น')!.text).toBe('ผู้สอบบัญชี: ไม่แสดงความเห็น');
    expect(auditorWarn('ไม่แสดงความเชื่อมั่นและมีข้อสังเกต/เรื่องอื่น')!.level).toBe('red');
  });
  it('ข้อสังเกต without a condition → light orange', () => {
    const w = auditorWarn('ไม่มีเงื่อนไขและมีข้อสังเกต/เรื่องอื่น')!;
    expect(w.level).toBe('amber');
    expect(w.text).toBe('ผู้สอบบัญชีมีข้อสังเกต');
  });
  it('ไม่มีเงื่อนไข / empty → no badge ("ไม่มี" must not read as "มีเงื่อนไข")', () => {
    expect(auditorWarn('ไม่มีเงื่อนไข')).toBeNull();
    expect(auditorWarn('')).toBeNull();
    expect(auditorWarn(null)).toBeNull();
    expect(auditorWarn(undefined)).toBeNull();
  });
});

describe('liquidity / Weinstein', () => {
  it('ADTV < 5 warns, 5 and above does not, unknown does not', () => {
    expect(liquidityWarn(2.34)!.text).toBe('สภาพคล่องต่ำ 2.3 ล./วัน');
    expect(liquidityWarn(4.99)).not.toBeNull();
    expect(liquidityWarn(5)).toBeNull();
    expect(liquidityWarn(120)).toBeNull();
    expect(liquidityWarn(null)).toBeNull();
    expect(liquidityWarn(NaN)).toBeNull();
  });
  it('only Stage 3 warns', () => {
    expect(weinsteinWarn('Stage 3 (Topping)')!.text).toBe('Weinstein 3 ทำยอด');
    expect(weinsteinWarn('Stage 2 (Advancing)')).toBeNull();
    expect(weinsteinWarn('Stage 2A (Breakout)')).toBeNull();
    expect(weinsteinWarn(undefined)).toBeNull();
  });
  it('peadWarnings: auditor first, then liquidity, then Weinstein; none without data', () => {
    const w = peadWarnings('มีเงื่อนไข', { adtv: 1, wein: 'Stage 3 (Topping)' });
    expect(w.map(x => x.key)).toEqual(['auditor', 'liquidity', 'weinstein']);
    expect(peadWarnings(null, undefined)).toEqual([]);
  });
});

describe('buildPeadExtras', () => {
  const src = {
    marketStage: [{ Ticker: 'AAA', Stage: 'Bull', 'ADTV(MB)': 3.2 }, { Ticker: 'BBB', Stage: 'Bear' }],
    weinstein: [{ Ticker: 'AAA', Stage: 'Stage 3 (Topping)' }],
    rsRanking: [{ Ticker: 'AAA', RS_Rating: 88 }],
    scans: { sepa: [{ Ticker: 'AAA' }], ppbp: [{ Ticker: 'AAA' }, { Ticker: 'BBB' }] },
  };
  it('only the asked tickers, with every field it has', () => {
    const r = buildPeadExtras(['AAA', 'BBB', 'ZZZ'], src);
    expect(Object.keys(r).sort()).toEqual(['AAA', 'BBB']);
    expect(r.AAA).toEqual({ stage: 'Bull', adtv: 3.2, wein: 'Stage 3 (Topping)', rs: 88, scans: ['sepa', 'ppbp'] });
    expect(r.BBB).toEqual({ stage: 'Bear', scans: ['ppbp'] });
  });
  it('missing files / stock not found → no crash, no entry', () => {
    expect(buildPeadExtras(['AAA'], {})).toEqual({});
    expect(buildPeadExtras(['AAA'], { marketStage: null, weinstein: undefined, scans: { sepa: null } })).toEqual({});
    expect(buildPeadExtras(['AAA'], { marketStage: 'oops' as never })).toEqual({});
    expect(buildPeadExtras([], src)).toEqual({});
  });
  it('ignores non-finite / wrong-typed values', () => {
    const r = buildPeadExtras(['A'], { marketStage: [{ Ticker: 'A', Stage: 'Bull', 'ADTV(MB)': NaN }], rsRanking: [{ Ticker: 'A', RS_Rating: '9' }] });
    expect(r.A).toEqual({ stage: 'Bull' });
  });
});

describe('groupLabel', () => {
  it('subsector, unless longer than 22 characters → sector', () => {
    expect(groupLabel({ subsector: 'Agribusiness', sector: 'Agro' })).toBe('Agribusiness');
    expect(groupLabel({ subsector: 'Petrochemicals & Chemicals', sector: 'Industrials' })).toBe('Industrials');
    expect(groupLabel({ subsector: 'A'.repeat(22), sector: 'S' })).toBe('A'.repeat(22));
    expect(groupLabel({ subsector: 'A'.repeat(23), sector: 'S' })).toBe('S');
  });
  it('empty subsector → sector; both empty → empty; long subsector without sector keeps it', () => {
    expect(groupLabel({ subsector: '', sector: 'Services' })).toBe('Services');
    expect(groupLabel({})).toBe('');
    expect(groupLabel({ subsector: 'A'.repeat(30), sector: null })).toBe('A'.repeat(30));
  });
});
