import { describe, it, expect } from 'vitest';
import { heatColor, NO_DATA_COLOR } from './heatColor';

describe('heatColor', () => {
  it('hits the anchors exactly', () => {
    expect(heatColor(-3)).toBe('#F23645');
    expect(heatColor(-2)).toBe('#C62A36');
    expect(heatColor(-1)).toBe('#8E2530');
    expect(heatColor(-0.1)).toBe('#5A2A32');
    expect(heatColor(0.1)).toBe('#214A38');
    expect(heatColor(1)).toBe('#1F7A4D');
    expect(heatColor(2)).toBe('#22A45D');
    expect(heatColor(3)).toBe('#2ECC71');
  });
  it('uses the neutral colour for |pct| < 0.1, including exactly 0', () => {
    expect(heatColor(0)).toBe('#3A3F4B');
    expect(heatColor(0.09)).toBe('#3A3F4B');
    expect(heatColor(-0.09)).toBe('#3A3F4B');
  });
  it('clamps beyond the ends', () => {
    expect(heatColor(-10)).toBe('#F23645');
    expect(heatColor(33.3)).toBe('#2ECC71');
  });
  it('interpolates linearly between anchors', () => {
    // midway between #8E2530 (-1) and #C62A36 (-2) at -1.5
    expect(heatColor(-1.5)).toBe('#AA2833');
    expect(heatColor(-1.36)).not.toBe('#8E2530');
  });
  it('null / NaN → no-data colour, distinct from 0%', () => {
    expect(heatColor(null)).toBe(NO_DATA_COLOR);
    expect(heatColor(undefined)).toBe(NO_DATA_COLOR);
    expect(heatColor(NaN)).toBe(NO_DATA_COLOR);
    expect(heatColor(0)).not.toBe(NO_DATA_COLOR);
  });
});
