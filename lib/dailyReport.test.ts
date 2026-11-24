import { describe, expect, it } from 'vitest';
import { DT_FILTERS, filterCounts, matchFilter, groupCalendar, latestScanDate, longDate, shortDate, type DtRow } from './dailyReport';

const row = (ticker: string, status: DtRow['status'], rv: DtRow['rv_tier']) => ({ ticker, status, rv_tier: rv }) as DtRow;

describe('dailyReport filters', () => {
  const rows = [row('A', 'new', 'lo'), row('B', 'reentry', 'hi'), row('C', 'reentry', 'mid'), row('D', 'stay', 'lo')];

  it('button count equals the rows the filter shows', () => {
    const c = filterCounts(rows);
    for (const f of DT_FILTERS) expect(c[f]).toBe(rows.filter(r => matchFilter(r, f)).length);
    expect(c).toMatchObject({ all: 4, new: 1, reentry: 2, stay: 1, 'rv-hi': 1, 'rv-mid': 1, 'rv-lo': 2 });
  });
});

describe('dailyReport dates', () => {
  it('formats Thai dates from ISO', () => {
    expect(shortDate('2026-11-23')).toBe('23 พ.ย.');
    expect(longDate('2026-11-23')).toBe('จันทร์ 23 พ.ย. 2569');
    expect(shortDate(null)).toBe('—');
  });

  it('latest scan date = newest value in generated_at.json', () => {
    expect(latestScanDate({ a: '2026-11-20T18:00:00+07:00', b: '2026-11-23T18:06:51+07:00', c: 5 })).toBe('2026-11-23');
  });

  it('groups calendar by date ascending', () => {
    const g = groupCalendar([
      { date: '2026-11-26', type: 'XD', ticker: 'X', amount: 1, note: '' },
      { date: '2026-11-24', type: 'XD', ticker: 'Y', amount: null, note: '' },
      { date: '2026-11-24', type: 'XR', ticker: 'Z', amount: null, note: '' },
    ]);
    expect(g.map(x => [x.date, x.items.length])).toEqual([['2026-11-24', 2], ['2026-11-26', 1]]);
  });
});
