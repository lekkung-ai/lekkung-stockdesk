import { describe, expect, it } from 'vitest';
import { fmtDist, kellChecklistItems, parseKellChecklistRow, type KellChecklistRow } from './kellChecklist';
import { techSummary } from './stockSummary';

const base: KellChecklistRow = {
  Ticker: 'KBANK', Price: 250, SMA_50: 244.22, SMA_200: 210.5, SMA_200_20D_Ago: 205.1,
  EMA_10: 249.41, EMA_20: 247.1, EMA_10_5D_Ago: 246.3, EMA_20_5D_Ago: 244.9,
  Dist_EMA10_Pct: 0.24, Dist_EMA20_Pct: 1.17,
  K1: true, K2: true, K3: true, K4: true, K5: true, K6: true, K7: true, Pass_Count: 7, All_Pass: true,
};

describe('parseKellChecklistRow', () => {
  it('accepts a full row', () => {
    expect(parseKellChecklistRow(base)).toEqual(base);
  });
  it('rejects missing / wrong-typed fields', () => {
    expect(parseKellChecklistRow(undefined)).toBeNull();
    expect(parseKellChecklistRow({ ...base, K6: 'true' })).toBeNull();
    expect(parseKellChecklistRow({ ...base, EMA_20: null })).toBeNull();
    expect(parseKellChecklistRow({ ...base, Dist_EMA10_Pct: Number.NaN })).toBeNull();
    const noAllPass: Record<string, unknown> = { ...base };
    delete noAllPass.All_Pass;
    expect(parseKellChecklistRow(noAllPass)).toBeNull();
  });
});

describe('kellChecklistItems', () => {
  it('7 rows in code order with real numbers', () => {
    const items = kellChecklistItems(base);
    expect(items.map(i => i.n)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(items[0].detail).toBe('250.00 > 244.22');
    expect(items[2].detail).toBe('210.50 > 205.10 (20 วันก่อน)');
    expect(items[3].detail).toBe('250.00 > 249.41 / > 247.10');
    expect(items[4].detail).toBe('249.41 > 247.10');
    expect(items[5].detail).toBe('EMA10 249.41 > 246.30 (5 วันก่อน)\nEMA20 247.10 > 244.90 (5 วันก่อน)');
    expect(items[6].detail).toBe('EMA10 0.2% · EMA20 1.2%');
    expect(items.every(i => i.pass)).toBe(true);
  });
  it('pass comes from K1..K7, not recomputed', () => {
    const items = kellChecklistItems({ ...base, K3: false, K7: false, Pass_Count: 5, All_Pass: false });
    expect(items.filter(i => !i.pass).map(i => i.n)).toEqual([3, 7]);
  });
  it('failing rows show the real operator, red only on the failed comparison', () => {
    const row = { ...base, Price: 50.5, EMA_10: 56.85, EMA_20: 55, EMA_10_5D_Ago: 60.84, K1: false, K4: false, K6: false, K7: false,
      Dist_EMA10_Pct: 5.06, Dist_EMA20_Pct: 4.2, Pass_Count: 3, All_Pass: false };
    const items = kellChecklistItems(row);
    expect(items[3].detail).toBe('50.50 < 56.85 / < 55.00');
    expect(items[3].parts.filter(p => p.kind === 'opfail')).toHaveLength(2);
    expect(items[3].parts[0].kind).toBe('price');
    expect(items[5].detail.split(String.fromCharCode(10))[0]).toBe('EMA10 56.85 < 60.84 (5 วันก่อน)');
    expect(items[6].detail).toBe('EMA10 5.1% · EMA20 4.2% (เกณฑ์ ≤ 3.5%)');
    expect(items[6].parts.filter(p => p.kind === 'fail')).toHaveLength(2);
  });
  it('K7 passing with one wide EMA never goes red', () => {
    const items = kellChecklistItems({ ...base, Dist_EMA10_Pct: 6, Dist_EMA20_Pct: 1 });
    expect(items[6].parts.some(p => p.kind === 'fail' || p.text.includes('เกณฑ์'))).toBe(false);
  });
  it('a failing distance never shows as 3.5%', () => {
    expect(fmtDist(3.54)).toBe('3.54');
    expect(fmtDist(3.5)).toBe('3.5');
    expect(fmtDist(5.06)).toBe('5.1');
  });
});

describe('techSummary with Kell count', () => {
  it('appends Kell N/7 only when Kell fails and the count is known', () => {
    expect(techSummary({ sepaPassCount: 6, sepaPass: false, kellPass: false, kellPassCount: 5, stage: 'Warning' })?.text)
      .toBe('ผ่าน SEPA 6/8 · Stage Warning · Kell 5/7');
    expect(techSummary({ sepaPassCount: 8, sepaPass: true, kellPass: false, kellPassCount: 6, stage: 'S.Bull' }))
      .toEqual({ text: 'ผ่าน SEPA 8/8 · Stage S.Bull · Kell 6/7', tone: 'good' });
    expect(techSummary({ sepaPassCount: 6, sepaPass: false, kellPass: false, kellPassCount: null, stage: 'Warning' })?.text)
      .toBe('ผ่าน SEPA 6/8 · Stage Warning');
  });
  it('Kell pass keeps the old wording even with a count', () => {
    expect(techSummary({ sepaPassCount: 8, sepaPass: true, kellPass: true, kellPassCount: 7, stage: 'S.Bull' })?.text)
      .toBe('แนวโน้มขาขึ้นครบ · ผ่าน SEPA 8/8 และ Kell');
    expect(techSummary({ sepaPassCount: 5, sepaPass: false, kellPass: true, kellPassCount: 7, stage: 'Bull' })?.text)
      .toBe('ผ่าน SEPA 5/8 · Stage Bull · Kell ผ่าน');
  });
  it('Kell count alone still makes a line', () => {
    expect(techSummary({ sepaPassCount: null, sepaPass: false, kellPass: false, kellPassCount: 3, stage: null })?.text)
      .toBe('Kell 3/7');
  });
});
