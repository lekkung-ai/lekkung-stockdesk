// Pure logic for the "แบบใหม่" (new) layout of /sector-flow: net money in/out in baht,
// meaning labels, the top-line summary and the 4 status boxes. No React, no JSON import.

import {
  compareNullLast, flowChg, flowValue, MIN_AVG_VALUE_MB, rowName, STATUSES,
  type FlowRow, type FlowStatus, type FlowWindow,
} from './sectorFlow';

/** Net in/out beyond this % of the group's normal traded value gets a label (30% ≈ ×1.3 / ×0.7, same cut as the classic layout). */
export const NET_LABEL_PCT = 30;
/** Group price move (%) that counts as up / down for the label. */
export const PRICE_MOVE_PCT = 0.1;

export type NetLabel = 'ไล่ซื้อ' | 'เทขาย' | 'เลิกสนใจ' | null;

const finite = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);

/** Traded value (million baht/day) behind the flow ratio: today's value, or the 5-day daily average (value_5d is a mean). */
export function windowValue(r: FlowRow, w: FlowWindow): number | null {
  const v = w === '1d' ? r.value_1d : r.value_5d;
  return finite(v) ? v : null;
}

/** The group's normal daily value (million baht) for the same window - the 20-day base. */
export function baseValue(r: FlowRow, w: FlowWindow): number | null {
  const v = w === '1d' ? r.base_value_1d : r.base_value_5d;
  return finite(v) ? v : null;
}

/**
 * Net money in (+) / out (−), million baht/day: value × (1 − 1/flow).
 * flow = the group's share of market turnover vs its normal share, so value/flow is what the
 * group would have traded at its normal share of today's market; the rest is the net shift.
 * Summed over all groups this is ~0 (shares sum to 1). flow null / 0 / non-finite → null.
 */
export function netFlowMb(r: FlowRow, w: FlowWindow): number | null {
  const v = windowValue(r, w);
  const f = flowValue(r, w);
  if (v == null || !finite(f) || f === 0) return null;
  return v * (1 - 1 / f);
}

/** Net flow as % of the group's normal daily value; null if either is missing / base ≤ 0. */
export function netFlowPct(r: FlowRow, w: FlowWindow): number | null {
  const net = netFlowMb(r, w);
  const base = baseValue(r, w);
  if (net == null || base == null || base <= 0) return null;
  return (net / base) * 100;
}

/** ไล่ซื้อ = money in ≥ +30% of normal and price ≥ +0.1% · เทขาย = money in ≥ +30% and price ≤ −0.1% · เลิกสนใจ = money out ≤ −30%. */
export function netLabel(r: FlowRow, w: FlowWindow): NetLabel {
  const pct = netFlowPct(r, w);
  if (pct == null) return null;
  const chg = flowChg(r, w);
  if (pct >= NET_LABEL_PCT) {
    if (finite(chg) && chg >= PRICE_MOVE_PCT) return 'ไล่ซื้อ';
    if (finite(chg) && chg <= -PRICE_MOVE_PCT) return 'เทขาย';
    return null;
  }
  if (pct <= -NET_LABEL_PCT) return 'เลิกสนใจ';
  return null;
}

const bigEnough = (r: FlowRow) => r.avg_value_20d != null && r.avg_value_20d >= MIN_AVG_VALUE_MB;

/** Rows for the in/out section: same small-group filter as the classic section, biggest inflow → biggest outflow, null last. */
export function netRows(rows: FlowRow[], w: FlowWindow, showAll: boolean): FlowRow[] {
  return rows
    .filter(r => showAll || bigEnough(r))
    .sort((a, b) => compareNullLast(netFlowMb(a, w), netFlowMb(b, w), 'desc'));
}

/** Top-line summary: up to `n` groups with the largest net inflow / outflow (small groups excluded). */
export function flowSummary(rows: FlowRow[], w: FlowWindow, n = 3): { inflow: string[]; outflow: string[] } {
  const scored = rows
    .filter(bigEnough)
    .map(r => ({ name: rowName(r), net: netFlowMb(r, w) }))
    .filter((x): x is { name: string; net: number } => x.net != null);
  const inflow = scored.filter(x => x.net > 0).sort((a, b) => b.net - a.net).slice(0, n).map(x => x.name);
  const outflow = scored.filter(x => x.net < 0).sort((a, b) => a.net - b.net).slice(0, n).map(x => x.name);
  return { inflow, outflow };
}

/** "+1.2 พันล้าน" / "−850 ล้าน" (million-baht input, U+2212 minus); null → "—". */
export function fmtNetBaht(mb: number | null): string {
  if (mb == null || !Number.isFinite(mb)) return '—';
  const a = Math.abs(mb);
  const body = a >= 1000 ? `${(a / 1000).toFixed(1)} พันล้าน` : `${a.toFixed(a < 10 ? 1 : 0)} ล้าน`;
  const zero = Number(body.split(' ')[0]) === 0;
  return `${zero ? '' : mb < 0 ? '−' : '+'}${body}`;
}

export const NO_STATUS = 'ไม่มีสถานะ';
export type BoxKey = FlowStatus | typeof NO_STATUS;

/** Every row into exactly one status box (4 statuses + a catch-all for null / unknown), each sorted by excess_1m high → low. */
export function statusBoxes(rows: FlowRow[]): Record<BoxKey, FlowRow[]> {
  const out = Object.fromEntries([...STATUSES, NO_STATUS].map(k => [k, [] as FlowRow[]])) as Record<BoxKey, FlowRow[]>;
  for (const r of rows) {
    const k = (STATUSES as readonly string[]).includes(r.status ?? '') ? (r.status as FlowStatus) : NO_STATUS;
    out[k].push(r);
  }
  for (const k of Object.keys(out) as BoxKey[]) out[k].sort((a, b) => compareNullLast(a.excess_1m, b.excess_1m, 'desc'));
  return out;
}
