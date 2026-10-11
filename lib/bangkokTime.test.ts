import { describe, expect, it } from 'vitest';
import { bangkokDateKey, bangkokHHMM, bangkokParts, formatBangkokHHMM, formatShortThaiDate, formatThaiDate } from './utils';

// Must give the same answer whatever TZ the process runs in (run with TZ=UTC, TZ=Asia/Bangkok, TZ=America/New_York)
describe('Asia/Bangkok date/time helpers (machine-zone independent)', () => {
  const late = '2026-10-08T20:30:00Z'; // 9 Oct 03:30 in Bangkok, still 8 Oct in UTC / New York
  it('bangkokParts / bangkokHHMM', () => {
    expect(bangkokParts(new Date(late))).toEqual({ year: 2026, month: 10, day: 9, hour: 3, minute: 30 });
    expect(bangkokHHMM(new Date(late))).toBe('03:30');
    expect(formatBangkokHHMM(late)).toBe('03:30');
  });
  it('bangkokDateKey', () => {
    expect(bangkokDateKey(Date.parse(late))).toBe('2026-10-09');
    expect(bangkokDateKey(new Date('2026-12-31T17:00:00Z'))).toBe('2027-01-01');
  });
  it('formatShortThaiDate / formatThaiDate', () => {
    expect(formatShortThaiDate(late)).toBe('9 ต.ค.');
    expect(formatThaiDate(late)).toBe('9 ต.ค. 2569 เวลา 03:30 น.');
  });
});
