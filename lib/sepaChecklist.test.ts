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
    expect(items[0].detail).toBe('41.00 > 32.34 / 30.47');
    expect(items[2].detail).toBe('30.47 > 28.89');
    expect(items[5].detail).toBe('+110.8% จากจุดต่ำ');
    expect(items[6].detail).toBe('-4.7% จากจุดสูง');
    expect(items[7].detail).toBe('RS 94');
  });
  it('pass comes from T1..T8, not recomputed', () => {
    const items = sepaChecklistItems({ ...base, T3: false, T8: false, RS_Rating: null, Pass_Count: 6, All_Pass: false });
    expect(items.filter(i => !i.pass).map(i => i.n)).toEqual([3, 8]);
    expect(items[7].detail).toBe('RS —');
  });
});
