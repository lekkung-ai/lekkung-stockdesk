import rawGeneratedAt from '@/data/scans/generated_at.json';

// Per-scan generation timestamp, written by convert_to_json.py in the same
// run (and with the same single timestamp) that writes each scan's own
// data file - so a page's "updated at" label can never drift from what its
// table actually shows, unlike the old shared combined.json generated_at
// (which silently went stale whenever only some files got copied/pushed -
// see the 2026-07-14/15 "header says yesterday, table says today" incident).
const generatedAtMap = rawGeneratedAt as Record<string, string>;

export function getScanGeneratedAt(scanKey: string): string | null {
  return generatedAtMap[scanKey] ?? null;
}
