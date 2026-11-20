import { describe, expect, it } from 'vitest';
import { parseSepaChecklistRow, sepaChecklistItems, type SepaChecklistRow } from './sepaChecklist';

const base: SepaChecklistRow = {
  Ticker: 'KTB', Price: 41, SMA_50: 37.05, SMA_150: 32.34, SMA_200: 30.47, SMA_200_1M_Ago: 28.89,
  '52W_Low': 19.45, '52W_High': 43, RS_Rating: 94,
  T1: true, T2: true, T3: true, T4: true, T5: true, T6: true, T7: true, T8: true, Pass_Count: 8, All_Pass: true,
};

describe('parseSepaChecklistRow', () => {
  it('accepts a full row and a null RS', () => {
    expect(parseSepaChecklistRow(base)).toEqual(base);
    expect(parseSepaChecklistRow({ ...base, RS_Rating: null })?.RS_Rating).toBeNull();
  });
  it('rejects missing / wrong-typed fields', () => {
    expect(parseSepaChecklistRow(undefined)).toBeNull();
    expect(parseSepaChecklistRow({ ...base, T3: 'true' })).toBeNull();
    expect(parseSepaChecklistRow({ ...base, SMA_150: null })).toBeNull();
    const noAllPass: Record<string, unknown> = { ...base };
    delete noAllPass.All_Pass;
    expect(parseSepaChecklistRow(noAllPass)).toBeNull();
  });
});

describe('sepaChecklistItems', () => {
  it('8 rows in Minervini order with real numbers', () => {
    const items = sepaChecklistItems(base);
    expect(items.map(i => i.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(items[0].detail).toBe('41.00 > 32.34 / > 30.47');
    expect(items[2].detail).toBe('30.47 > 28.89 (1 เดือนก่อน)');
    expect(items[5].detail).toBe('+110.8% จากจุดต่ำ');
    expect(items[6].detail).toBe('−4.7% จากจุดสูง');
    expect(items[7].detail).toBe('RS 94');
  });
  it('failing rows show the real operator and the threshold note', () => {
    const row = { ...base, Price: 50.5, SMA_50: 67.28, SMA_150: 48.89, SMA_200: 41.52, '52W_Low': 15.4, '52W_High': 81.45,
      T5: false, T7: false, T8: false, RS_Rating: 45, Pass_Count: 5, All_Pass: false };
    const items = sepaChecklistItems(row);
    expect(items[4].detail).toBe('50.50 < 67.28');
    expect(items[4].parts.map(p => p.kind)).toEqual(['price', 'val', 'opfail', 'val']);
    expect(items[0].parts.some(p => p.kind === 'opfail')).toBe(false);
    expect(items[3].detail).toBe('67.28 > 48.89 / > 41.52');
    expect(items[6].detail).toBe('−38.0% จากจุดสูง (เกณฑ์ ≤ 25%)');
    expect(items[6].parts[0].kind).toBe('fail');
    expect(items[7].detail).toBe('RS 45 (เกณฑ์ ≥ 70)');
  });
  it('one-sided failure keeps the true side normal', () => {
    const items = sepaChecklistItems({ ...base, Price: 31, SMA_150: 30, SMA_200: 32, T1: false });
    expect(items[0].detail).toBe('31.00 > 30.00 / < 32.00');
    expect(items[0].parts.filter(p => p.kind === 'opfail')).toHaveLength(1);
  });
  it('equal after rounding shows = and never red on a passing row', () => {
    const items = sepaChecklistItems({ ...base, Price: 41.001, SMA_50: 41.004, T5: true });
    expect(items[4].detail).toBe('41.00 = 41.00');
    expect(items[4].parts.some(p => p.kind === 'opfail')).toBe(false);
  });
  it('pass comes from T1..T8, not recomputed', () => {
    const items = sepaChecklistItems({ ...base, T3: false, T8: false, RS_Rating: null, Pass_Count: 6, All_Pass: false });
    expect(items.filter(i => !i.pass).map(i => i.n)).toEqual([3, 8]);
    expect(items[7].detail).toBe('RS — (เกณฑ์ ≥ 70)');
  });
});
