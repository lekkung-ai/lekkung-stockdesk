import { describe, it, expect } from 'vitest';
import type { FlowRow } from './sectorFlow';
import {
  flowSummary, fmtNetBaht, netFlowMb, netFlowPct, netLabel, netRows, statusBoxes, NET_LABEL_PCT, NO_STATUS,
} from './sectorFlowNet';

const row = (p: Partial<FlowRow>): FlowRow => ({
  sector: 'S', subsector: 'X', n: 5,
  flow_1d: 1, flow_5d: 1, chg_1d: 0, chg_5d: 0, avg_value_20d: 100,
  value_1d: 100, base_value_1d: 100, value_5d: 100, base_value_5d: 100,
  ret_1w: 0, ret_1m: 0, ret_3m: 0, excess_1w: 0, excess_1m: 0, excess_3m: 0, status: 'แข็งต่อเนื่อง',
  ...p,
});

describe('netFlowMb = value × (1 − 1/flow)', () => {
  it('uses value_1d / flow_1d for today and value_5d (daily average) / flow_5d for 5 days', () => {
    const r = row({ value_1d: 652.2, flow_1d: 0.849, value_5d: 355.47, flow_5d: 0.586 });
    expect(netFlowMb(r, '1d')).toBeCloseTo(652.2 * (1 - 1 / 0.849), 9);
    expect(netFlowMb(r, '5d')).toBeCloseTo(355.47 * (1 - 1 / 0.586), 9);
    expect(netFlowMb(row({ value_1d: 300, flow_1d: 1.5 }), '1d')).toBeCloseTo(100, 9);
    expect(netFlowMb(row({ value_1d: 300, flow_1d: 1 }), '1d')).toBe(0);
  });

  it('is null when flow is null / 0 / non-finite or value is missing', () => {
    expect(netFlowMb(row({ flow_1d: null }), '1d')).toBeNull();
    expect(netFlowMb(row({ flow_1d: 0 }), '1d')).toBeNull();
    expect(netFlowMb(row({ flow_1d: Infinity }), '1d')).toBeNull();
    expect(netFlowMb(row({ value_1d: null }), '1d')).toBeNull();
    expect(netFlowMb(row({ value_5d: undefined }), '5d')).toBeNull();
  });

  it('sums to ~0 across groups when shares sum to 1 (money moves between groups)', () => {
    // market total 1000 today; normal shares 0.5 / 0.3 / 0.2; today's shares 0.6 / 0.25 / 0.15
    const T = 1000, normal = [0.5, 0.3, 0.2], today = [0.6, 0.25, 0.15];
    const rows = today.map((s, i) => row({ subsector: `G${i}`, value_1d: s * T, flow_1d: s / normal[i] }));
    const sum = rows.reduce((a, r) => a + (netFlowMb(r, '1d') as number), 0);
    expect(Math.abs(sum)).toBeLessThan(1e-9);
    expect(netFlowMb(rows[0], '1d')).toBeCloseTo(100, 9); // 600 − 0.5×1000
  });
});

describe('netLabel', () => {
  const at = (pct: number, chg: number) =>
    row({ base_value_1d: 1000, value_1d: 1000 + pct * 10, flow_1d: (1000 + pct * 10) / 1000, chg_1d: chg });
  // value × (1 − 1/flow) with flow = value/base → value − base: pct of base = pct
  it('checks the pct helper first', () => expect(netFlowPct(at(3, 0), '1d')).toBeCloseTo(3, 9));

  it('ไล่ซื้อ: money in ≥ +30% and price ≥ +0.1%', () => {
    expect(netLabel(at(NET_LABEL_PCT, 0.1), '1d')).toBe('ไล่ซื้อ');
    expect(netLabel(at(50, 1.2), '1d')).toBe('ไล่ซื้อ');
  });
  it('เทขาย: money in ≥ +30% and price ≤ −0.1%', () => {
    expect(netLabel(at(35, -0.1), '1d')).toBe('เทขาย');
  });
  it('เลิกสนใจ: money out ≤ −30% regardless of price', () => {
    expect(netLabel(at(-31, 1), '1d')).toBe('เลิกสนใจ');
    expect(netLabel(at(-60, -3), '1d')).toBe('เลิกสนใจ');
  });
  it('no label otherwise', () => {
    expect(netLabel(at(29.9, 2), '1d')).toBeNull();
    expect(netLabel(at(40, 0.05), '1d')).toBeNull();
    expect(netLabel(at(-29.9, -2), '1d')).toBeNull();
    expect(netLabel(row({ flow_1d: null }), '1d')).toBeNull();
    expect(netLabel(row({ base_value_1d: 0, value_1d: 200, flow_1d: 2 }), '1d')).toBeNull();
  });
  it('uses the 5-day fields for the 5-day window', () => {
    const r = row({ base_value_5d: 100, value_5d: 140, flow_5d: 1.4, chg_5d: 0.5, flow_1d: null });
    expect(netLabel(r, '5d')).toBe('ไล่ซื้อ');
    expect(netLabel(r, '1d')).toBeNull();
  });
});

describe('netRows / flowSummary', () => {
  const rows = [
    row({ subsector: 'A', value_1d: 300, flow_1d: 1.5 }),   // +100
    row({ subsector: 'B', value_1d: 200, flow_1d: 0.8 }),   // −50
    row({ subsector: 'C', value_1d: 100, flow_1d: 2 }),     // +50
    row({ subsector: 'D', value_1d: 100, flow_1d: null }),  // null
    row({ subsector: 'E', value_1d: 500, flow_1d: 0.5 }),   // −500
    row({ subsector: 'Tiny', value_1d: 900, flow_1d: 9, avg_value_20d: 5 }), // big inflow but small group
  ];
  it('sorts biggest inflow → biggest outflow, null last, hides small groups unless showAll', () => {
    expect(netRows(rows, '1d', false).map(r => r.subsector)).toEqual(['A', 'C', 'B', 'E', 'D']);
    expect(netRows(rows, '1d', true)[0].subsector).toBe('Tiny');
  });
  it('summary = top 3 in / top 3 out, small groups excluded', () => {
    expect(flowSummary(rows, '1d')).toEqual({ inflow: ['A', 'C'], outflow: ['E', 'B'] });
    expect(flowSummary(rows, '1d', 1)).toEqual({ inflow: ['A'], outflow: ['E'] });
  });
});

describe('fmtNetBaht', () => {
  it('formats million-baht input as ล้าน / พันล้าน with sign', () => {
    expect(fmtNetBaht(1234.5)).toBe('+1.2 พันล้าน');
    expect(fmtNetBaht(-850)).toBe('−850 ล้าน');
    expect(fmtNetBaht(4.26)).toBe('+4.3 ล้าน');
    expect(fmtNetBaht(-0.01)).toBe('0.0 ล้าน');
    expect(fmtNetBaht(null)).toBe('—');
  });
});

describe('statusBoxes', () => {
  it('puts every row in exactly one box, sorted by excess_1m desc, unknown status in the catch-all', () => {
    const rows = [
      row({ subsector: 'a', status: 'แข็งต่อเนื่อง', excess_1m: 1 }),
      row({ subsector: 'b', status: 'แข็งต่อเนื่อง', excess_1m: 3 }),
      row({ subsector: 'c', status: 'อ่อนต่อเนื่อง', excess_1m: -2 }),
      row({ subsector: 'd', status: null, excess_1m: 0 }),
      row({ subsector: 'e', status: 'แข็งต่อเนื่อง', excess_1m: null }),
    ];
    const b = statusBoxes(rows);
    expect(b['แข็งต่อเนื่อง'].map(r => r.subsector)).toEqual(['b', 'a', 'e']);
    expect(b['อ่อนต่อเนื่อง'].map(r => r.subsector)).toEqual(['c']);
    expect(b['เพิ่งเริ่มแข็ง']).toEqual([]);
    expect(b[NO_STATUS].map(r => r.subsector)).toEqual(['d']);
    expect(Object.values(b).flat()).toHaveLength(rows.length);
  });
});
