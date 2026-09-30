import { describe, it, expect } from 'vitest';
import { delayMinutesFromMode, fmtSignedPct, resolveFrontContract, vsFutures, type FuturesRow } from './s50Futures';

const row = (name: string, close: number | null, chg: number | null, volume: number | null): FuturesRow =>
  ({ name, close, chg, volume, updateMode: 'delayed_streaming_900' });

// Real TradingView snapshot 2026-09-30 (day after S50U2026 expired)
const SNAPSHOT: FuturesRow[] = [
  row('S50Z2026', 1046.9, -2.067352666043022, 135061),
  row('S50M2027', 1038.4, -1.9730010384215864, 3228),
  row('S50X2026', 1046.8, -2.095024317246548, 14),
  row('S501!', 1046.9, -2.067352666043022, 135061),
  row('S50V2026', 1046.3, -2.0043083263088968, 185),
  row('S50U2027', 1032, -2.1151474912264017, 628),
  row('S50H2027', 1042.1, -2.0766773162939423, 13121),
];

describe('resolveFrontContract', () => {
  it('finds the real contract behind S501! by identical close + volume', () => {
    expect(resolveFrontContract(SNAPSHOT)?.name).toBe('S50Z2026');
  });

  it('uses the real contract\'s own % change even if S501!\'s differs (cross-contract rollover)', () => {
    const rows = SNAPSHOT.map(r => (r.name === 'S501!' ? { ...r, chg: -9.99 } : r));
    const front = resolveFrontContract(rows);
    expect(front?.name).toBe('S50Z2026');
    expect(front?.chg).toBe(-2.067352666043022);
  });

  it('falls back to S501! when nothing or more than one contract matches', () => {
    expect(resolveFrontContract(SNAPSHOT.filter(r => r.name !== 'S50Z2026'))?.name).toBe('S501!');
    expect(resolveFrontContract([...SNAPSHOT, row('S50Z2099', 1046.9, 0, 135061)])?.name).toBe('S501!');
  });

  it('does not match on volume 0 / missing close', () => {
    expect(resolveFrontContract([row('S501!', 1000, 1, 0), row('S50Z2026', 1000, 1, 0)])?.name).toBe('S501!');
    expect(resolveFrontContract([row('S501!', null, null, 5), row('S50Z2026', null, null, 5)])?.name).toBe('S501!');
  });

  it('returns null without S501!', () => {
    expect(resolveFrontContract(SNAPSHOT.filter(r => r.name !== 'S501!'))).toBeNull();
    expect(resolveFrontContract([])).toBeNull();
  });
});

describe('vsFutures', () => {
  it('is stock % − futures %', () => {
    expect(vsFutures(-1.25, -2.067352666043022)).toBeCloseTo(0.817352666, 8);
    expect(vsFutures(-4.13, -2.07)).toBeCloseTo(-2.06, 10);
  });

  it('is null when either side is missing or not finite', () => {
    expect(vsFutures(null, -2)).toBeNull();
    expect(vsFutures(1, null)).toBeNull();
    expect(vsFutures(undefined, 1)).toBeNull();
    expect(vsFutures(NaN, 1)).toBeNull();
    expect(vsFutures(1, Infinity)).toBeNull();
  });

  it('treats 0% as real data', () => {
    expect(vsFutures(0, -2)).toBe(2);
  });
});

describe('fmtSignedPct', () => {
  it('formats with sign and 2 decimals, U+2212 for negatives', () => {
    expect(fmtSignedPct(1.52)).toBe('+1.52%');
    expect(fmtSignedPct(-0.84)).toBe('−0.84%');
    expect(fmtSignedPct(0)).toBe('+0.00%');
    expect(fmtSignedPct(-0.004)).toBe('+0.00%');
    expect(fmtSignedPct(0.8173526)).toBe('+0.82%');
  });
});

describe('delayMinutesFromMode', () => {
  it('parses the delayed_streaming_<seconds> mode', () => {
    expect(delayMinutesFromMode('delayed_streaming_900')).toBe(15);
    expect(delayMinutesFromMode('streaming')).toBeNull();
    expect(delayMinutesFromMode(null)).toBeNull();
  });
});
