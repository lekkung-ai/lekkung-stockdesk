import { describe, it, expect } from 'vitest';
import { buildNewListingMap, newListingLabel } from './newListing';

describe('buildNewListingMap', () => {
  it('badges only stocks with fewer than 200 days of history', () => {
    const m = buildNewListingMap([
      { ticker: 'FLE', History_Days: 26, Is_New_Listing: true },
      { ticker: 'NTF', History_Days: 199, Is_New_Listing: true },
      { ticker: 'EDGE', History_Days: 200, Is_New_Listing: true }, // full history (RS / stage) → not IPO
      { ticker: 'Y1', History_Days: 230, Is_New_Listing: true },
      { ticker: 'PTT', History_Days: 726, Is_New_Listing: false },
      { ticker: 'BAD', History_Days: null, Is_New_Listing: true },
      { ticker: 'ZERO', History_Days: 0, Is_New_Listing: true },
    ]);
    expect([...m.entries()]).toEqual([['FLE', 26], ['NTF', 199]]);
  });

  it('old combined.json without the fields → no badges, no crash', () => {
    expect(buildNewListingMap([{ ticker: 'PTT' }]).size).toBe(0);
    expect(buildNewListingMap(null).size).toBe(0);
  });

  it('labels with the day count', () => {
    expect(newListingLabel(34)).toBe('IPO · 34 วัน');
  });
});
