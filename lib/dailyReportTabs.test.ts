import { describe, expect, it } from 'vitest';
import { sepaCompositeScore } from './compositeScore';
import {
  rankSepa, comparePivot, fplusLabel, fyLabel, quarterLabel, maxBy, sumStages, sepaFilterCounts, matchSepa,
  SEPA_FILTERS, sepaHeadline, sepaWatch, type SepaRawRow, type SepaRow,
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

describe('SEPA sentences (rule-based)', () => {
  const row = (t: string, o: Partial<SepaRow>) =>
    ({ Ticker: t, RS_Rating: 90, '%_From_High': '-5%', 'ADTV(MB)': 10, Fundamental_Pass: true, status: 'stay', price_stale: false, ...o }) as unknown as SepaRow;
  const readyRow = (t: string, toPivot: number, rs = 90) =>
    row(t, { RS_Rating: rs, VCP_Contracting: true, VCP_T: 2, VCP_ToPivot: toPivot, VCP_Pivot: 20, VCP_Footprint: '9W 13/4 2T' });

  it('headline: ready count · nearest pivot among ready · rank 1 with score', () => {
    const ranked = rankSepa([readyRow('AAA', 3.2, 99), readyRow('BBB', 1.5, 80), row('CCC', {})], 'all');
    const h = sepaHeadline(ranked);
    expect(h.startsWith('พร้อมยิง 2 ตัว · BBB ห่าง Pivot แค่ 1.5% · อันดับ 1 ')).toBe(true);
    expect(h).toContain(`Score ${Math.round(ranked[0].score)}`);
    expect(h).toContain(`อันดับ 1 ${ranked[0].row.Ticker}`);
  });

  it('headline when nothing is ready / empty view', () => {
    const ranked = rankSepa([row('CCC', {})], 'all');
    expect(sepaHeadline(ranked).startsWith('ยังไม่มีตัวพร้อมยิง · อันดับ 1 CCC')).toBe(true);
    expect(sepaHeadline([])).toBe('วันนี้ไม่มีหุ้นผ่าน SEPA ในมุมมองนี้');
  });

  it('watch lines by priority (≤ 2)', () => {
    const [r] = rankSepa([readyRow('A', 2.5)], 'all');
    expect(sepaWatch(r)[0]).toBe('ห่าง Pivot 20.00 อีก 2.5% — เบรคพร้อมวอลุ่ม = จุดซื้อ');
    const [at] = rankSepa([readyRow('Z', 0)], 'all');
    expect(sepaWatch(at)[0]).toBe('อยู่ที่ Pivot 20.00 พอดี — เบรคพร้อมวอลุ่ม = จุดซื้อ');
    expect(sepaHeadline([at])).toContain('Z อยู่ที่ Pivot พอดี');
    const [p] = rankSepa([row('B', { VCP_ToPivot: -4, VCP_Pivot: 10, VCP_Footprint: '6W 10/3 2T' })], 'all');
    expect(sepaWatch(p)[0]).toBe('ผ่าน Pivot ไปแล้ว 4.0% — ไม่ไล่ รอฐานใหม่');
    const [n] = rankSepa([row('C', { VCP_Footprint: 'no base', '%_From_High': '-1%' })], 'all');
    expect(sepaWatch(n)).toEqual(['ยังไม่มีฐาน — เฝ้าดู', 'ชิด High รอบปี']);
    const [st] = rankSepa([row('D', { price_stale: true, VCP_Footprint: 'no base', '%_From_High': '-1%' })], 'all');
    expect(sepaWatch(st)).toEqual(['⚠️ ราคาค้าง', 'ยังไม่มีฐาน — เฝ้าดู']);
  });
});
