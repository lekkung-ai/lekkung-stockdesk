import { describe, expect, it } from 'vitest';
import { livePriceTitle, tvPriceNote } from './priceSource';
import { formatBangkokHHMM } from './utils';

describe('price source wording', () => {
  it('formats the update time in Asia/Bangkok', () => {
    expect(formatBangkokHHMM('2026-10-09T09:05:00Z')).toBe('16:05');
    expect(formatBangkokHHMM(null)).toBe('');
    expect(formatBangkokHHMM('bad')).toBe('');
  });
  it('builds the TradingView note with / without a time', () => {
    expect(tvPriceNote('2026-10-09T09:05:00Z')).toBe('ราคา TradingView ล่าช้า 15 นาที · อัปเดต 16:05');
    expect(tvPriceNote(null)).toBe('ราคา TradingView ล่าช้า 15 นาที');
    expect(livePriceTitle(null)).toContain('ราคาปิด ณ วันสแกน');
  });
});
