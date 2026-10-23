// Period end (ISO date) of a growth figure → short label shown next to the number.
// The pipeline (data-engine 2_download_history.apply_growth_freshness) writes these
// columns and only keeps a growth value whose period is the latest one due.

/** "2026-06-30" → "Q2/26" (calendar quarter of the period end month) */
export function quarterShort(periodEnd: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})/.exec(periodEnd ?? '');
  if (!m) return null;
  return `Q${Math.floor((Number(m[2]) - 1) / 3) + 1}/${m[1].slice(2)}`;
}

/** "2025-12-31" → "FY25" */
export function fyShort(periodEnd: string | null | undefined): string | null {
  const m = /^(\d{4})-/.exec(periodEnd ?? '');
  return m ? `FY${m[1].slice(2)}` : null;
}
