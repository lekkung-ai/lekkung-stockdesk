import { describe, expect, it } from 'vitest';
import { computeScanMarkers, markersFromSetupStarts } from './scanMarkers';

describe('markersFromSetupStarts', () => {
  it('first start is firstSeen, later starts are re-entries', () => {
    expect(markersFromSetupStarts({ setupStarts: ['2026-07-31', '2026-09-08', '2026-10-07'], hitDates: ['2026-08-17'] }))
      .toEqual({ firstSeen: '2026-07-31', reentries: ['2026-09-08', '2026-10-07'] });
  });
  it('one setup -> no re-entries', () => {
    expect(markersFromSetupStarts({ setupStarts: ['2026-10-07'] })).toEqual({ firstSeen: '2026-10-07', reentries: [] });
  });
  it('old file without setupStarts falls back to the first hit', () => {
    expect(markersFromSetupStarts({ hitDates: ['2026-10-07', '2026-10-30'] })).toEqual({ firstSeen: '2026-10-07', reentries: [] });
  });
  it('no record', () => {
    expect(markersFromSetupStarts(undefined)).toEqual({ firstSeen: null, reentries: [] });
  });
});

describe('computeScanMarkers (daytrade only)', () => {
  it('re-entry after > 7 calendar days', () => {
    expect(computeScanMarkers(['2026-10-01', '2026-10-05', '2026-10-20'])).toEqual({ firstSeen: '2026-10-01', reentries: ['2026-10-20'] });
  });
});
