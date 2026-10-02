import { describe, it, expect } from 'vitest';
import { winFlatLoss } from './winFlatLoss';

describe('winFlatLoss', () => {
  it('splits n into win / flat / loss percentages', () => {
    expect(winFlatLoss({ n: 8, n_win: 4, n_flat: 2, n_loss: 2 })).toEqual({ win: 50, flat: 25, loss: 25 });
  });

  it('returns null for an old report_card.json without the new fields', () => {
    expect(winFlatLoss({ n: 10 })).toBeNull();
    expect(winFlatLoss({ n: 10, n_win: 4, n_flat: null, n_loss: 6 })).toBeNull();
  });

  it('returns null when there is nothing to split or the counts disagree with n', () => {
    expect(winFlatLoss({ n: 0, n_win: 0, n_flat: 0, n_loss: 0 })).toBeNull();
    expect(winFlatLoss(undefined)).toBeNull();
    expect(winFlatLoss({ n: 10, n_win: 4, n_flat: 1, n_loss: 4 })).toBeNull();
  });
});
