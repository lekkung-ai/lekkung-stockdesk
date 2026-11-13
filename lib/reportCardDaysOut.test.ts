import { describe, expect, it } from 'vitest';
import { openDaysOut } from './reportCard';

describe('openDaysOut', () => {
  it('open setup out 1-4 days -> N', () => {
    expect(openDaysOut({ status: 'open', days_out: 3 })).toBe(3);
  });
  it('open and in the scan today -> 0', () => {
    expect(openDaysOut({ status: 'open', days_out: 0 })).toBe(0);
  });
  it('closed setups never show the badge', () => {
    expect(openDaysOut({ status: 'closed', days_out: 5 })).toBe(0);
  });
  it('old file without days_out -> 0', () => {
    expect(openDaysOut({ status: 'open' })).toBe(0);
  });
});
