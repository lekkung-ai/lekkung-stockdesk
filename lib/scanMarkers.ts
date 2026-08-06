export interface ScanMarkers {
  firstSeen: string | null;
  reentries: string[];
}

// hitDates = ISO ascending (from getScanHistory)
// re-entry = scan hit date after a gap of >7 calendar days from previous hit (dropped for >1 week then returned)
// firstSeen = hitDates[0] always
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
