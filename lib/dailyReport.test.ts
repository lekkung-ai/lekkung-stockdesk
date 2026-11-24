import { describe, expect, it } from 'vitest';
import { scanTagLabel, scanKeyOf, DT_FILTERS, filterCounts, matchFilter, groupCalendar, splitCalendar, latestScanDate, longDate, shortDate, type DtRow } from './dailyReport';

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
      { date: '2026-11-26', type: 'XD', ticker: 'X', amount: 1, note: '', in_scans: [] },
      { date: '2026-11-24', type: 'XD', ticker: 'Y', amount: null, note: '', in_scans: [] },
      { date: '2026-11-24', type: 'XR', ticker: 'Z', amount: null, note: '', in_scans: [] },
    ]);
    expect(g.map(x => [x.date, x.items.length])).toEqual([['2026-11-24', 2], ['2026-11-26', 1]]);
  });
});

describe('splitCalendar', () => {
  const ci = (date: string, ticker: string, in_scans: string[]) => ({ date, type: 'XD', ticker, amount: null, note: '', in_scans });
  it('tomorrow: in-scan first; week: only in-scan shown, rest hidden (nothing dropped)', () => {
    const items = [ci('d2', 'A', []), ci('d2', 'B', ['sepa']), ci('d3', 'C', []), ci('d4', 'D', ['growth']), ci('d3', 'E', ['sepa']), ci('d1', 'F', [])];
    const r = splitCalendar(items, 'd2');
    expect(splitCalendar([ci('d2', 'S', ['market_stage:Bull'])], 'd2').tomorrow.other.map(i => i.ticker)).toEqual(['S']); // Stage ไม่ทำให้ตัวหนา
    expect(r.tomorrow.inScan.map(i => i.ticker)).toEqual(['B']);
    expect(r.tomorrow.other.map(i => i.ticker)).toEqual(['A']);
    expect(r.week.shown.map(i => i.ticker)).toEqual(['E', 'D']);
    expect(r.week.hidden.map(i => i.ticker)).toEqual(['C']);
  });
});

describe('scanTagLabel', () => {
  it('stage tag shows the real stage; plain scans keep their name', () => {
    expect(scanTagLabel('market_stage:S.Bull')).toBe('Stage: S.Bull');
    expect(scanTagLabel('sepa')).toBe('SEPA');
    expect(scanKeyOf('market_stage:Bull')).toBe('market_stage');
    expect(scanKeyOf('growth')).toBe('growth');
  });
});
