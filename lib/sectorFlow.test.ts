import { describe, it, expect } from 'vitest';
import { flowLabel, flowRows, strengthRows, compareNullLast, formatThaiDay, parseSortKey, parseFlowWindow, type FlowRow } from './sectorFlow';

const mk = (o: Partial<FlowRow> & { subsector: string }): FlowRow => ({
  sector: 'S', n: 5, flow_1d: 1, flow_5d: 1, chg_1d: 0, chg_5d: 0, avg_value_20d: 100,
  ret_1w: 0, ret_1m: 0, ret_3m: 0, excess_1w: 0, excess_1m: 0, excess_3m: 0, status: null, ...o,
});

describe('flowLabel', () => {
  it('money in + price up / down', () => {
    expect(flowLabel(1.3, 0.1)).toBe('เงินเข้า ราคาขึ้น');
    expect(flowLabel(2, -0.1)).toBe('เงินเข้า แต่ราคาลง (แรงขาย)');
  });
  it('money in but flat price → no label', () => {
    expect(flowLabel(1.5, 0.05)).toBeNull();
    expect(flowLabel(1.5, null)).toBeNull();
  });
  it('quiet ≤ 0.7, nothing in the middle, null-safe', () => {
    expect(flowLabel(0.7, 5)).toBe('เงียบ');
    expect(flowLabel(0.71, 5)).toBeNull();
    expect(flowLabel(1.29, 5)).toBeNull();
    expect(flowLabel(null, 5)).toBeNull();
  });
});

describe('flowRows', () => {
  const rows = [
    mk({ subsector: 'A', flow_1d: 1.1, flow_5d: 2 }),
    mk({ subsector: 'B', flow_1d: 2.5, flow_5d: 0.5 }),
    mk({ subsector: 'tiny', flow_1d: 9, avg_value_20d: 5 }),
    mk({ subsector: 'N', flow_1d: null }),
  ];
  it('sorts high → low, null last, hides small groups by default', () => {
    expect(flowRows(rows, '1d', false).map(r => r.subsector)).toEqual(['B', 'A', 'N']);
    expect(flowRows(rows, '1d', true).map(r => r.subsector)).toEqual(['tiny', 'B', 'A', 'N']);
    expect(flowRows(rows, '5d', false).map(r => r.subsector)).toEqual(['A', 'N', 'B']);
  });
});

describe('strengthRows', () => {
  const rows = [
    mk({ subsector: 'weak', status: 'อ่อนต่อเนื่อง', excess_3m: -5, excess_1m: null }),
    mk({ subsector: 'fade', status: 'เริ่มหมดแรง', excess_3m: 3 }),
    mk({ subsector: 'turn', status: 'เพิ่งเริ่มแข็ง', excess_3m: -2 }),
    mk({ subsector: 'strong2', status: 'แข็งต่อเนื่อง', excess_3m: 1 }),
    mk({ subsector: 'strong1', status: 'แข็งต่อเนื่อง', excess_3m: 9 }),
    mk({ subsector: 'nostatus', status: null, excess_3m: null }),
  ];
  it('default order: status then excess_3m, no-status last', () => {
    expect(strengthRows(rows, undefined, 'desc').map(r => r.subsector)).toEqual(['turn', 'strong1', 'strong2', 'fade', 'weak', 'nostatus']);
  });
  it('column sort keeps nulls last in both directions', () => {
    expect(strengthRows(rows, 'excess_1m', 'desc').at(-1)?.subsector).toBe('weak');
    expect(strengthRows(rows, 'excess_1m', 'asc').at(-1)?.subsector).toBe('weak');
    expect(strengthRows(rows, 'excess_3m', 'asc').map(r => r.subsector).at(-1)).toBe('nostatus');
    expect(strengthRows(rows, 'excess_3m', 'asc')[0].subsector).toBe('weak');
  });
  it('does not mutate input', () => {
    const copy = [...rows];
    strengthRows(rows, 'excess_3m', 'asc');
    expect(rows).toEqual(copy);
  });
});

describe('helpers', () => {
  it('compareNullLast', () => {
    expect(compareNullLast(null, 1, 'asc')).toBe(1);
    expect(compareNullLast(1, null, 'desc')).toBe(-1);
    expect(compareNullLast(NaN, NaN, 'asc')).toBe(0);
  });
  it('formatThaiDay', () => {
    expect(formatThaiDay('2026-09-28')).toBe('28 ก.ย. 2569');
    expect(formatThaiDay(null)).toBe('ไม่ทราบวันที่');
  });
  it('param parsing falls back safely', () => {
    expect(parseSortKey('bogus')).toBeUndefined();
    expect(parseSortKey('excess_1m')).toBe('excess_1m');
    expect(parseFlowWindow('5d')).toBe('5d');
    expect(parseFlowWindow('x')).toBe('1d');
  });
});
