import { describe, it, expect } from 'vitest';
import type { EarningsBucket } from './earningsBucket';
import { parseView, withView, groupByDay, summarizeDay, dayLabel, announceDay } from './earningsDays';

type Row = { ticker: string; announceDate: string | null; bucket: EarningsBucket | null; netProfit: number | null; netProfitPrior: number | null };

function r(ticker: string, day: string, bucket: EarningsBucket | null, netProfit: number | null, netProfitPrior: number | null, time = '17:00'): Row {
  return { ticker, announceDate: `${day}T${time}:00+07:00`, bucket, netProfit, netProfitPrior };
}

const ROWS: Row[] = [
  r('AAA', '2026-11-06', 'profit_growth', 150, 100, '18:00'), // +50%
  r('BBB', '2026-11-05', 'profit_shrink', 80, 100),
  r('CCC', '2026-11-06', 'turnaround', 10, -5, '17:30'),     // +300% "growth" - never best
  r('DDD', '2026-11-06', 'profit_growth', 130, 100, '17:10'), // +30%
  r('EEE', '2026-11-06', 'loss_worse', -50, -10, '17:05'),
  r('FFF', '2026-11-06', 'no_base', 5, null, '17:00'),
  r('GGG', '2026-11-06', null, null, null, '16:50'),           // fund: no profit → ไม่มีฐานเทียบ
  r('HHH', '2026-11-04', 'loss_shrink', -5, -10),
];

describe('view in the URL', () => {
  it('?view=day|list, default รายวัน', () => {
    expect(parseView('day')).toBe('day');
    expect(parseView('list')).toBe('list');
    expect(parseView(null)).toBe('day');
    expect(parseView('table')).toBe('day');
  });
  it('sets view and keeps other params', () => {
    expect(withView('', 'list')).toBe('?view=list');
    expect(withView('?view=list', 'day')).toBe('?view=day');
    expect(withView('?q=1&view=day', 'list')).toBe('?q=1&view=list');
  });
});

describe('groupByDay', () => {
  it('newest day first, rows keep the incoming (sort) order', () => {
    const g = groupByDay(ROWS);
    expect(g.map(x => x.day)).toEqual(['2026-11-06', '2026-11-05', '2026-11-04']);
    expect(g[0].rows.map(x => x.ticker)).toEqual(['AAA', 'CCC', 'DDD', 'EEE', 'FFF', 'GGG']);
  });
  it('days stay newest → oldest whatever the row sort is', () => {
    const byTicker = [...ROWS].sort((x, y) => y.ticker.localeCompare(x.ticker)); // HHH..AAA
    const g = groupByDay(byTicker);
    expect(g.map(x => x.day)).toEqual(['2026-11-06', '2026-11-05', '2026-11-04']);
    expect(g[0].rows.map(x => x.ticker)).toEqual(['GGG', 'FFF', 'EEE', 'DDD', 'CCC', 'AAA']);
  });
  it('a row without a date is left out', () => {
    expect(groupByDay([{ ...ROWS[0], announceDate: null }])).toEqual([]);
  });
  it('filter first, then group: a day the filter empties is not shown, counts follow the filter', () => {
    const growth = ROWS.filter(a => a.bucket === 'profit_growth');
    const g = groupByDay(growth);
    expect(g.map(x => x.day)).toEqual(['2026-11-06']);
    const s = summarizeDay(g[0].rows);
    expect(s.n).toBe(2);
    expect(s.counts).toEqual({ profit_growth: 2 });
    expect(s.improved).toBe(2);
    expect(s.improvedPct).toBe(100);
  });
  it('announceDay is the Bangkok date in the ISO string', () => {
    expect(announceDay({ announceDate: '2026-11-06T23:59:00+07:00' })).toBe('2026-11-06');
  });
});

describe('summarizeDay (หัวกลุ่ม)', () => {
  const day = groupByDay(ROWS)[0].rows;
  const s = summarizeDay(day);
  it('counts every bucket; no bucket/no profit → ไม่มีฐานเทียบ', () => {
    expect(s.n).toBe(6);
    expect(s.counts).toEqual({ profit_growth: 2, turnaround: 1, loss_worse: 1, no_base: 2 });
  });
  it('กำไรดีขึ้น = growth + turnaround + loss shrink ÷ rows with a base', () => {
    expect(s.base).toBe(4);
    expect(s.improved).toBe(3);
    expect(s.improvedPct).toBe(75);
  });
  it('no base at all → no %', () => {
    expect(summarizeDay([ROWS[5], ROWS[6]]).improvedPct).toBeNull();
  });
  it('loss_shrink counts as improved', () => {
    expect(summarizeDay([ROWS[7]]).improved).toBe(1);
  });
});

describe('โตสุดของวัน', () => {
  it('highest %YoY among กำไรโต only - a turnaround never wins', () => {
    expect(summarizeDay(groupByDay(ROWS)[0].rows).best).toEqual({ ticker: 'AAA', yoy: 50 });
  });
  it('none when the day has no กำไรโต', () => {
    expect(summarizeDay([ROWS[1], ROWS[2]]).best).toBeNull();
  });
});

describe('dayLabel', () => {
  it('weekday + day + month', () => {
    expect(dayLabel('2026-11-06')).toBe('ศ. 6 พ.ย.');
    expect(dayLabel('2026-11-02')).toBe('จ. 2 พ.ย.');
  });
});
