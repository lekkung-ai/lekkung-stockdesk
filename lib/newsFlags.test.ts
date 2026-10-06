import { describe, it, expect } from 'vitest';
import { flagsFor, safeLink, splitVisible, type NewsFlag } from './newsFlags';

const f = (severity: NewsFlag['severity'], label = severity): NewsFlag => ({ type: 'x', label, severity, date: '2026-10-01', title: 't', link: null });

describe('newsFlags', () => {
  it('sorts red first and drops malformed rows', () => {
    const file = { flags: { AAA: [f('green'), f('red'), { bad: true } as unknown as NewsFlag, f('orange')] } };
    expect(flagsFor(file, 'AAA').map(x => x.severity)).toEqual(['red', 'orange', 'green']);
  });

  it('returns [] for a missing file or ticker', () => {
    expect(flagsFor(null, 'AAA')).toEqual([]);
    expect(flagsFor({}, 'AAA')).toEqual([]);
    expect(flagsFor({ flags: {} }, 'AAA')).toEqual([]);
  });

  it('shows at most 3 and folds the rest into +n', () => {
    const { shown, more } = splitVisible([f('red'), f('orange'), f('blue'), f('purple'), f('gray')]);
    expect(shown).toHaveLength(3);
    expect(more.map(x => x.severity)).toEqual(['purple', 'gray']);
  });

  it('only opens http(s) links', () => {
    expect(safeLink('https://www.set.or.th/x')).toBe('https://www.set.or.th/x');
    expect(safeLink('javascript:alert(1)')).toBeNull();
    expect(safeLink(null)).toBeNull();
  });
});
