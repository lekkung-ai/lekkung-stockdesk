import fs from 'fs';
import path from 'path';

// Which day /top-movers/r59 and /r246 open on: the newest data/history/<date>/<file> snapshot that
// holds at least one real filing (the pipeline writes a single "ไม่พบข้อมูล" row on days with none).
// Snapshots land after ~18:00 Bangkok, so before that today has no snapshot yet.

export interface SecLatestDay {
  /** newest snapshot date (YYYY-MM-DD) with real rows, null if none in the last `maxDays` snapshots */
  latest: string | null;
  /** today's snapshot exists (with or without rows) */
  todaySnapshot: boolean;
}

interface SnapshotFile {
  rows?: Record<string, string>[];
}

/** true if the snapshot has at least one row whose `emptyCol` isn't the "ไม่พบข้อมูล" placeholder. */
export function hasRealRows(snap: SnapshotFile | null | undefined, emptyCol: string): boolean {
  return Array.isArray(snap?.rows) && snap.rows.some(r => r && r[emptyCol] !== 'ไม่พบข้อมูล');
}

/** Scan dated folders newest → oldest (today and earlier only), stop at the first one with real rows. */
export function findLatestSecDay(
  historyDir: string,
  fname: string,
  emptyCol: string,
  todayISO: string,
  maxDays = 60,
): SecLatestDay {
  let dates: string[] = [];
  try {
    dates = fs.readdirSync(historyDir)
      .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= todayISO)
      .sort()
      .reverse()
      .slice(0, maxDays);
  } catch {
    return { latest: null, todaySnapshot: false };
  }
  const readSnap = (d: string): SnapshotFile | null => {
    try {
      const p = path.join(historyDir, d, fname);
      return fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, 'utf-8')) as SnapshotFile) : null;
    } catch {
      return null;
    }
  };
  const todaySnapshot = dates[0] === todayISO && readSnap(todayISO) != null;
  for (const d of dates) {
    if (hasRealRows(readSnap(d), emptyCol)) return { latest: d, todaySnapshot };
  }
  return { latest: null, todaySnapshot };
}
