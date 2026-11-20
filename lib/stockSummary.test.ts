import { describe, it, expect } from 'vitest';
import { techSummary, fundSummary, rsRankInGroup } from './stockSummary';

describe('techSummary', () => {
  it('SEPA 8/8 + Kell → full uptrend line, good', () => {
    expect(techSummary({ sepaPassCount: 8, sepaPass: true, kellPass: true, stage: 'S.Bull' }))
      .toEqual({ text: 'แนวโน้มขาขึ้นครบ · ผ่าน SEPA 8/8 และ Kell', tone: 'good' });
  });
  it('not passing SEPA → N/8 + stage, neutral', () => {
    expect(techSummary({ sepaPassCount: 6, sepaPass: false, kellPass: false, stage: 'Warning' }))
      .toEqual({ text: 'ผ่าน SEPA 6/8 · Stage Warning', tone: 'neutral' });
  });
  it('appends Kell ผ่าน when only Kell passes', () => {
    expect(techSummary({ sepaPassCount: 5, sepaPass: false, kellPass: true, stage: 'Bull' })?.text)
      .toBe('ผ่าน SEPA 5/8 · Stage Bull · Kell ผ่าน');
  });
  it('sepa.json pass wins over a stale checklist count', () => {
    expect(techSummary({ sepaPassCount: 7, sepaPass: true, kellPass: false, stage: 'Bull' }))
      .toEqual({ text: 'ผ่าน SEPA 8/8 · Stage Bull', tone: 'good' });
  });
  it('Bear stage → bad', () => {
    expect(techSummary({ sepaPassCount: 1, sepaPass: false, kellPass: false, stage: 'Bear' })?.tone).toBe('bad');
  });
  it('drops missing parts; nothing known → null', () => {
    expect(techSummary({ sepaPassCount: null, sepaPass: false, kellPass: false, stage: 'IPO' })?.text).toBe('Stage IPO');
    expect(techSummary({ sepaPassCount: null, sepaPass: false, kellPass: false, stage: null })).toBeNull();
  });
});

describe('fundSummary', () => {
  it('price above fair value > 10% and flat profit', () => {
    expect(fundSummary({ fairUpsidePct: -18.0, profitYoYPct: -2.2 }))
      .toEqual({ text: 'ราคาสูงกว่ามูลค่าประเมิน ~18% · กำไรทรงตัว', tone: 'bad' });
  });
  it('price below fair value and growing profit → good', () => {
    expect(fundSummary({ fairUpsidePct: 25.4, profitYoYPct: 12 }))
      .toEqual({ text: 'ราคาต่ำกว่ามูลค่าประเมิน ~25% · กำไรโต', tone: 'good' });
  });
  it('mixed signals → neutral', () => {
    expect(fundSummary({ fairUpsidePct: 30, profitYoYPct: -10 }))
      .toEqual({ text: 'ราคาต่ำกว่ามูลค่าประเมิน ~30% · กำไรลด', tone: 'neutral' });
  });
  it('within ±10% → near fair value; boundaries', () => {
    expect(fundSummary({ fairUpsidePct: 10, profitYoYPct: 10 })?.text).toBe('ราคาใกล้มูลค่าประเมิน · กำไรโต');
    expect(fundSummary({ fairUpsidePct: -10, profitYoYPct: -9.9 })?.text).toBe('ราคาใกล้มูลค่าประเมิน · กำไรทรงตัว');
  });
  it('drops missing parts', () => {
    expect(fundSummary({ fairUpsidePct: null, profitYoYPct: -15 })).toEqual({ text: 'กำไรลด', tone: 'bad' });
    expect(fundSummary({ fairUpsidePct: null, profitYoYPct: null })).toBeNull();
  });
});

describe('rsRankInGroup', () => {
  const peers = [
    { ticker: 'A', rs: 95 }, { ticker: 'B', rs: 87 }, { ticker: 'C', rs: null }, { ticker: 'D', rs: 92 },
  ];
  it('ranks among peers with RS', () => {
    expect(rsRankInGroup('B', peers)).toEqual({ rank: 3, n: 3 });
    expect(rsRankInGroup('A', peers)).toEqual({ rank: 1, n: 3 });
  });
  it('no RS for the stock or a lone stock → null', () => {
    expect(rsRankInGroup('C', peers)).toBeNull();
    expect(rsRankInGroup('A', [{ ticker: 'A', rs: 50 }])).toBeNull();
  });
});
