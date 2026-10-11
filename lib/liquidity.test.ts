import { describe, expect, it } from 'vitest';
import { inLiqSet, parseLiq, LIQ_DEFAULT } from './liquidity';

describe('liquidity sets (/sepa /kell /breakout)', () => {
  it('bounds: high ≥ 6, mid 3–<6, low < 3, null only in all', () => {
    expect([inLiqSet(6, 'high'), inLiqSet(5.99, 'high'), inLiqSet(3, 'mid'), inLiqSet(2.99, 'low')]).toEqual([true, false, true, true]);
    expect([inLiqSet(null, 'all'), inLiqSet(null, 'high'), inLiqSet(undefined, 'low')]).toEqual([true, false, false]);
  });
  it('?liq= parsing falls back to high', () => {
    expect(LIQ_DEFAULT).toBe('high');
    expect([parseLiq('mid'), parseLiq('all'), parseLiq('x'), parseLiq(null)]).toEqual(['mid', 'all', 'high', 'high']);
  });
});
