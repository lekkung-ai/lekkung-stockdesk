import { describe, expect, it } from 'vitest';
import { classifyMfe, groupMfe, mfeHeadline } from './mfeGroups';

describe('classifyMfe', () => {
  it('MFE below 3 = never, exactly 3 is not', () => {
    expect(classifyMfe(2.99, 5)).toBe('never');
    expect(classifyMfe(3, -1)).toBe('gaveAll');
  });
  it('MFE zero or negative = never', () => {
    expect(classifyMfe(0, -2)).toBe('never');
    expect(classifyMfe(-1, -3)).toBe('never');
  });
  it('sold exactly 0 with MFE>=3 = gaveAll', () => {
    expect(classifyMfe(6, 0)).toBe('gaveAll');
  });
  it('exactly half of MFE = kept; just below = gaveHalf', () => {
    expect(classifyMfe(10, 5)).toBe('kept');
    expect(classifyMfe(10, 4.99)).toBe('gaveHalf');
    expect(classifyMfe(10, 0.01)).toBe('gaveHalf');
  });
  it('profit with MFE<3 stays in never', () => {
    expect(classifyMfe(2, 2)).toBe('never');
  });
});

describe('groupMfe', () => {
  const pts: [number, number][] = [[1, -4], [2, 1], [6, -3], [8, -1], [10, 2], [10, 5], [12, 12], [0, -2]];
  const g = groupMfe(pts);
  it('sums to the number of points and 100%', () => {
    expect(g.total).toBe(8);
    expect(g.groups.reduce((s, x) => s + x.n, 0)).toBe(8);
    expect(g.groups.reduce((s, x) => s + x.pct, 0)).toBeCloseTo(100);
  });
  it('counts and averages', () => {
    expect(g.groups.map(x => x.n)).toEqual([3, 2, 1, 2]);
    expect(g.groups[1].avgMfe).toBeCloseTo(7);
    expect(g.groups[1].avgRet).toBeCloseTo(-2);
  });
  it('small sample flag and empty', () => {
    expect(g.small).toBe(true);
    expect(groupMfe([]).main).toBeNull();
    expect(groupMfe([]).groups[0].avgMfe).toBeNull();
  });
  it('headline picks the bigger of never / gaveAll', () => {
    const h = mfeHeadline(g)!;
    expect(h.main).toBe('เลือกหุ้น/จังหวะเข้า');
    expect(h.mainPct).toBeCloseTo(37.5);
    expect(h.otherPct).toBeCloseTo(25);
    const g2 = groupMfe([[5, -1], [5, -1], [1, 0]]);
    expect(mfeHeadline(g2)!.main).toBe('จุดขาย');
  });
});
