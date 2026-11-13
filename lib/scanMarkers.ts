export interface ScanMarkers {
  firstSeen: string | null;
  reentries: string[];
}

// Old rule, kept ONLY for /lekkung-daytrade (it is not on the 5-day setup rule):
// re-entry = a hit more than 7 calendar days after the previous hit.
// hitDates = ISO ascending.
export function computeScanMarkers(hitDates: string[] | undefined): ScanMarkers {
  if (!hitDates || hitDates.length === 0) return { firstSeen: null, reentries: [] };
  const firstSeen = hitDates[0];
  const reentries: string[] = [];
  for (let i = 1; i < hitDates.length; i++) {
    const prev = new Date(hitDates[i - 1]).getTime();
    const curr = new Date(hitDates[i]).getTime();
    const gapDays = (curr - prev) / 86400000;
    if (gapDays > 7 && hitDates[i] !== firstSeen) {
      reentries.push(hitDates[i]);
    }
  }
  return { firstSeen, reentries };
}

// lekkung / sepa / kell / breakout / oneil: the setups are decided in Python
// (scripts/scan_setups.py -> setupStarts in *_history.json). This only reads them:
// first start = "เจอครั้งแรก", every later start = "เจอใหม่". No date math here.
// A file written before setupStarts existed falls back to the first hit, no re-entries.
export function markersFromSetupStarts(
  rec: { setupStarts?: string[]; hitDates?: string[] } | undefined,
): ScanMarkers {
  const starts = rec?.setupStarts;
  if (starts && starts.length > 0) return { firstSeen: starts[0], reentries: starts.slice(1) };
  return { firstSeen: rec?.hitDates?.[0] ?? null, reentries: [] };
}
