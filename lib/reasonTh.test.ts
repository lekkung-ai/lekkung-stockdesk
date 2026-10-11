import { describe, expect, it } from 'vitest';
import { reasonTh } from '../components/IncompletePopover';

describe('lekkung incomplete reason → Thai', () => {
  it('translates the pipeline reasons', () => {
    expect(reasonTh('missing: PE_Ratio')).toBe('ไม่มีค่า P/E');
    expect(reasonTh('missing: PE_Ratio, ROE')).toBe('ไม่มีค่า P/E, ROE');
    expect(reasonTh('missing: not in daily_prices.csv (price/fundamentals fetch failed entirely)')).toBe('ดึงราคาและงบการเงินไม่สำเร็จ');
    expect(reasonTh('something else')).toBe('something else');
  });
});
