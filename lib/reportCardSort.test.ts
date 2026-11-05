import { describe, expect, it } from 'vitest';
import type { SetupEntry } from './reportCard';
import { nextSort, parseSort, presetFor, sortParams, sortSetups, type SortKey } from './reportCardSort';

let n = 0;
function su(p: Partial<SetupEntry> & { ticker: string }): SetupEntry {
  n += 1;
  return {
    entry_date: '2026-10-01', entry_price: 10, exit_date: '2026-10-05', exit_price: 10, holding_days: 3,
    return_pct: 0, mfe_pct: 1, mae_pct: -1, status: 'closed', stage_at_entry: 'Bull', exit_reason: 'left_scan',
    ...p,
  } as SetupEntry;
}
const order = (l: SetupEntry[]) => l.map(s => s.ticker).join(',');

describe('parseSort', () => {
  it('keeps old links working', () => {
    expect(parseSort('giveback', null)).toEqual({ key: 'giveback', dir: 'desc' });
    expect(parseSort('best', null)).toEqual({ key: 'ret', dir: 'desc' });
    expect(parseSort('worst', null)).toEqual({ key: 'ret', dir: 'asc' });
    expect(parseSort('latest', null)).toEqual({ key: 'entry', dir: 'desc' });
    expect(parseSort('giveback', 'asc')).toEqual({ key: 'giveback', dir: 'asc' });
  });
  it('falls back to latest entry first on junk', () => {
    expect(parseSort(null, null)).toEqual({ key: 'entry', dir: 'desc' });
    expect(parseSort('nope', 'asc')).toEqual({ key: 'entry', dir: 'desc' });
    expect(parseSort('ret', 'sideways')).toEqual({ key: 'ret', dir: 'desc' });
  });
  it('first direction: ordered columns asc, the rest desc', () => {
    for (const k of ['ticker', 'stage', 'reason'] as SortKey[]) expect(parseSort(k, null).dir).toBe('asc');
    for (const k of ['entry', 'exit', 'hold', 'ret', 'mfe', 'mae'] as SortKey[]) expect(parseSort(k, null).dir).toBe('desc');
  });
});

describe('header click / url round trip', () => {
  it('flips on the same column and resets on another', () => {
    const a = nextSort({ key: 'entry', dir: 'desc' }, 'ret');
    expect(a).toEqual({ key: 'ret', dir: 'desc' });
    expect(nextSort(a, 'ret')).toEqual({ key: 'ret', dir: 'asc' });
    expect(nextSort({ key: 'ret', dir: 'asc' }, 'stage')).toEqual({ key: 'stage', dir: 'asc' });
  });
  it('params survive parse(sortParams(x)) for every state', () => {
    for (const key of ['ticker', 'entry', 'exit', 'hold', 'ret', 'mfe', 'mae', 'stage', 'reason', 'giveback'] as SortKey[])
      for (const dir of ['asc', 'desc'] as const) {
        const p = sortParams({ key, dir });
        expect(parseSort(p.sort, p.dir)).toEqual({ key, dir });
      }
  });
  it('dropdown presets match their column states', () => {
    expect(presetFor({ key: 'ret', dir: 'desc' })?.value).toBe('best');
    expect(presetFor({ key: 'ret', dir: 'asc' })?.value).toBe('worst');
    expect(presetFor({ key: 'entry', dir: 'desc' })?.value).toBe('latest');
    expect(presetFor({ key: 'giveback', dir: 'desc' })?.value).toBe('giveback');
    expect(presetFor({ key: 'hold', dir: 'desc' })).toBeUndefined();
    expect(presetFor({ key: 'entry', dir: 'asc' })).toBeUndefined();
  });
});

describe('sortSetups', () => {
  it('stage follows the stage order, not the alphabet', () => {
    const l = [
      su({ ticker: 'A', stage_at_entry: 'Warning' }), su({ ticker: 'B', stage_at_entry: 'ไม่มีข้อมูล' }),
      su({ ticker: 'C', stage_at_entry: 'S.Bull' }), su({ ticker: 'D', stage_at_entry: 'Bear' }),
      su({ ticker: 'E', stage_at_entry: 'Accumulation' }), su({ ticker: 'F', stage_at_entry: 'Bull' }),
      su({ ticker: 'G', stage_at_entry: 'Distribution' }), su({ ticker: 'H', stage_at_entry: 'Recovery' }),
    ];
    expect(order(sortSetups(l, { key: 'stage', dir: 'asc' }))).toBe('C,F,E,H,A,G,D,B');
    expect(order(sortSetups(l, { key: 'stage', dir: 'desc' }))).toBe('B,D,G,A,H,E,F,C');
  });
  it('reason: open > left scan > single day', () => {
    const l = [
      su({ ticker: 'S', exit_reason: 'single_day' }), su({ ticker: 'L', exit_reason: 'left_scan' }),
      su({ ticker: 'O', exit_reason: 'open', status: 'open' }),
    ];
    expect(order(sortSetups(l, { key: 'reason', dir: 'asc' }))).toBe('O,L,S');
    expect(order(sortSetups(l, { key: 'reason', dir: 'desc' }))).toBe('S,L,O');
  });
  it('ties fall back to latest entry first in both directions', () => {
    const l = [
      su({ ticker: 'A', return_pct: 1, entry_date: '2026-10-01' }),
      su({ ticker: 'B', return_pct: 1, entry_date: '2026-10-09' }),
      su({ ticker: 'C', return_pct: 1, entry_date: '2026-10-05' }),
    ];
    expect(order(sortSetups(l, { key: 'ret', dir: 'desc' }))).toBe('B,C,A');
    expect(order(sortSetups(l, { key: 'ret', dir: 'asc' }))).toBe('B,C,A');
  });
  it('numbers, dates, ticker; empty values always last', () => {
    const l = [
      su({ ticker: 'B', return_pct: -2, mfe_pct: null, entry_date: '2026-10-02', exit_date: '2026-10-20', holding_days: 5 }),
      su({ ticker: 'A', return_pct: 3, mfe_pct: 4, entry_date: '2026-10-03', exit_date: '2026-10-10', holding_days: 9 }),
      su({ ticker: 'C', return_pct: 0, mfe_pct: 2, entry_date: '2026-10-01', exit_date: '2026-10-15', holding_days: 0 }),
    ];
    expect(order(sortSetups(l, { key: 'ret', dir: 'desc' }))).toBe('A,C,B');
    expect(order(sortSetups(l, { key: 'ret', dir: 'asc' }))).toBe('B,C,A');
    expect(order(sortSetups(l, { key: 'mfe', dir: 'desc' }))).toBe('A,C,B');
    expect(order(sortSetups(l, { key: 'mfe', dir: 'asc' }))).toBe('C,A,B'); // null stays last
    expect(order(sortSetups(l, { key: 'hold', dir: 'desc' }))).toBe('A,B,C');
    expect(order(sortSetups(l, { key: 'entry', dir: 'asc' }))).toBe('C,B,A');
    expect(order(sortSetups(l, { key: 'exit', dir: 'desc' }))).toBe('B,C,A');
    expect(order(sortSetups(l, { key: 'ticker', dir: 'asc' }))).toBe('A,B,C');
    expect(order(sortSetups(l, { key: 'ticker', dir: 'desc' }))).toBe('C,B,A');
  });
  it('giveback = MFE − result, missing MFE last', () => {
    const l = [
      su({ ticker: 'A', mfe_pct: 5, return_pct: 4 }), su({ ticker: 'B', mfe_pct: 6, return_pct: -3 }),
      su({ ticker: 'C', mfe_pct: null, return_pct: -9 }),
    ];
    expect(order(sortSetups(l, { key: 'giveback', dir: 'desc' }))).toBe('B,A,C');
  });
  it('does not mutate the input', () => {
    const l = [su({ ticker: 'B', return_pct: 1 }), su({ ticker: 'A', return_pct: 2 })];
    sortSetups(l, { key: 'ret', dir: 'desc' });
    expect(order(l)).toBe('B,A');
  });
});
