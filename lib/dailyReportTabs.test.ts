import { describe, expect, it } from 'vitest';
import { sepaCompositeScore } from './compositeScore';
import {
  rankSepa, comparePivot, fplusLabel, fyLabel, quarterLabel, maxBy, sumStages, sepaFilterCounts, matchSepa,
  SEPA_FILTERS, type SepaRawRow, type SepaRow,
} from './dailyReportTabs';

const raw = (Ticker: string, RS_Rating: number, fromHigh: string, adtv: number | null, f: boolean | null = null): SepaRawRow =>
  ({ Ticker, RS_Rating, '%_From_High': fromHigh, 'ADTV(MB)': adtv, Fundamental_Pass: f });

describe('rankSepa (same formula as /sepa)', () => {
  const rows = [raw('A', 80, '-10%', 20, true), raw('B', 95, '-2%', 7), raw('C', 99, '-1%', 2), raw('D', 95, '-2%', 9)];

  it('filters by liquidity set and sorts score desc then RS desc, stable on ties', () => {
    const r = rankSepa(rows, 'high');
    expect(r.map(x => x.row.Ticker)).toEqual(['B', 'D', 'A']); // C ตกชุด (ADTV < 6) · B/D เสมอกัน → ลำดับไฟล์
    expect(r.map(x => x.rank)).toEqual([1, 2, 3]);
    const sB = sepaCompositeScore({ RS_Rating: 95, Fundamental_Pass: null, '%_From_High': -2 }).total;
    expect(r[0].score).toBeCloseTo(sB);
    expect(rankSepa(rows, 'all')[0].row.Ticker).toBe('C');
  });
});

describe('pivot sort', () => {
  it('non-negative small→large, then passed pivot (negative), then missing', () => {
    const vals: unknown[] = [null, -3, 4, 0.5, -1, '2.0', undefined];
    const sorted = [...vals].sort(comparePivot);
    expect(sorted.slice(0, 3)).toEqual([0.5, '2.0', 4]);
    expect(sorted.slice(3, 5)).toEqual([-1, -3]);
    expect(sorted.slice(5).every(v => v == null)).toBe(true);
  });
});

describe('labels', () => {
  it('F+ wording', () => {
    expect([fplusLabel(true), fplusLabel(false), fplusLabel(null)]).toEqual(['F+', 'ไม่มี F+', 'ไม่มีข้อมูลงบ']);
  });
  it('growth periods', () => {
    expect(fyLabel('2025-12-31')).toBe('FY68');
    expect(quarterLabel('2026Q3')).toBe('Q3/69');
    expect(fyLabel(null)).toBeNull();
  });
  it('maxBy ignores null', () => {
    expect(maxBy([{ v: null }, { v: -3 }, { v: -1 }], x => x.v)).toEqual({ v: -1 });
  });
  it('sumStages', () => {
    expect(sumStages({ Bull: 2, 'S.Bull': 3 }, ['Bull', 'S.Bull', 'Bear'])).toBe(5);
  });
});

describe('sepa filter counts', () => {
  it('count = rows the filter shows', () => {
    const rows = [
      { ...raw('A', 90, '-1%', 10, true), status: 'new' },
      { ...raw('B', 85, '-5%', 10), status: 'reentry' },
      { ...raw('C', 70, '-20%', 10), status: 'stay' },
    ] as unknown as SepaRow[];
    const ranked = rankSepa(rows, 'all');
    const c = sepaFilterCounts(ranked);
    for (const f of SEPA_FILTERS) expect(c[f]).toBe(ranked.filter(x => matchSepa(x, f)).length);
    expect(c.near_high).toBe(1);
    expect(c.fplus).toBe(1);
  });
});
