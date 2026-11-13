import { describe, expect, it } from 'vitest';
import { GRADE_RULES, gradeScan, verdictFor, whatIfLines } from './reportCardGrade';
import type { ScanReport, SetupSummary } from './reportCard';

const hz = (e5: number | null, e10: number | null, e20: number | null) => {
  const m = (v: number | null) => ({ n: 10, avg_return_pct: 0, median_return_pct: 0, win_rate_pct: 50, avg_set_return_pct: 0, excess_return_pct: v });
  return { '5': m(e5), '10': m(e10), '20': m(e20) };
};
const sum = (o: Partial<SetupSummary>): SetupSummary => ({
  n_closed: 100, n_open: 5, avg_return_pct: 1, win_rate_pct: 40, avg_holding_days: 8, avg_mfe_pct: 5, avg_mae_pct: -3,
  n_win: 40, n_flat: 10, n_loss: 50, avg_win_pct: 4, avg_loss_pct: -2, payoff_ratio: 2, ...o,
});
const scan = (h: ReturnType<typeof hz>, s: SetupSummary): Pick<ScanReport, 'horizons' | 'setup_summary'> => ({ horizons: h, setup_summary: s });

describe('card 1 เลือกหุ้นถูกไหม', () => {
  it('ดี = beats SET at every horizon', () => expect(gradeScan(scan(hz(0.1, 0.2, 0.3), sum({}))).pick).toBe('g'));
  it('พอใช้ = at least half', () => expect(gradeScan(scan(hz(0.1, -0.2, 0.3), sum({}))).pick).toBe('m'));
  it('ต้องแก้ = fewer than half', () => expect(gradeScan(scan(hz(0.1, -0.2, -0.3), sum({}))).pick).toBe('b'));
  it('missing horizons are not counted', () => {
    const g = gradeScan(scan(hz(0.1, null, -0.3), sum({})));
    expect([g.pick, g.nUp, g.excess.length]).toEqual(['m', 1, 2]);
  });
});

describe('card 2 ถือตามสแกนแล้วได้กำไรไหม', () => {
  it('break-even = 1/(1+payoff), win share leaves flats out', () => {
    const g = gradeScan(scan(hz(1, 1, 1), sum({ payoff_ratio: 1.5, n_win: 40, n_loss: 50 })));
    expect(g.breakEven).toBeCloseTo(40);
    expect(g.winShare).toBeCloseTo(44.444, 2);
  });
  it('ดี = avg > 0 and win share ≥ break-even', () =>
    expect(gradeScan(scan(hz(1, 1, 1), sum({ avg_return_pct: 0.5, payoff_ratio: 2, n_win: 40, n_loss: 60 }))).profit).toBe('g'));
  it('avg > 0 but below break-even is not ดี', () =>
    expect(gradeScan(scan(hz(1, 1, 1), sum({ avg_return_pct: 0.5, payoff_ratio: 1, n_win: 40, n_loss: 60 }))).profit).toBe('m'));
  it('พอใช้ = small loss', () =>
    expect(gradeScan(scan(hz(1, 1, 1), sum({ avg_return_pct: -0.2, payoff_ratio: 0.5, n_win: 10, n_loss: 90 }))).profit).toBe('m'));
  it('ต้องแก้ = clear loss, far below break-even', () =>
    expect(gradeScan(scan(hz(1, 1, 1), sum({ avg_return_pct: -1.5, payoff_ratio: 1, n_win: 20, n_loss: 80 }))).profit).toBe('b'));
});

describe('card 3 ขายถูกจังหวะไหม', () => {
  it('ดี = kept ≥ 40% of MFE', () => expect(gradeScan(scan(hz(1, 1, 1), sum({ avg_return_pct: 2, avg_mfe_pct: 5 }))).exit).toBe('g'));
  it('พอใช้ = sold at ≥ 0', () => expect(gradeScan(scan(hz(1, 1, 1), sum({ avg_return_pct: 0.5, avg_mfe_pct: 5 }))).exit).toBe('m'));
  it('ต้องแก้ = sold at a loss', () => expect(gradeScan(scan(hz(1, 1, 1), sum({ avg_return_pct: -0.1, avg_mfe_pct: 5 }))).exit).toBe('b'));
  it('threshold constant', () => expect(GRADE_RULES.exitCaptureGood).toBe(0.4));
});

describe('summary sentence', () => {
  it('positive average', () => {
    const v = verdictFor(scan(hz(0.1, 0.2, 0.3), sum({ avg_return_pct: 0.71, avg_win_pct: 4.5, avg_loss_pct: -2 })));
    expect(v.head).toBe('เลือกหุ้นได้ดีกว่าตลาด และทำกำไรเฉลี่ย +0.71% ต่อไม้');
    expect(v.why).toBe('ชนะทีได้เฉลี่ย +4.50% แพ้ทีเสีย -2.00% จึงยังคุ้มแม้ไม้ที่กำไรมีแค่ 44% ของไม้ที่มีผล');
    expect(v.smallSample).toBe(false);
  });
  it('positive average with most setups winning', () => {
    const v = verdictFor(scan(hz(0.1, 0.2, 0.3), sum({ avg_return_pct: 2.35, n_win: 16, n_loss: 9, avg_win_pct: 6.68, avg_loss_pct: -5.34 })));
    expect(v.why).toBe('ชนะทีได้เฉลี่ย +6.68% แพ้ทีเสีย -5.34% และไม้ที่กำไรมี 64% ของไม้ที่มีผล');
  });
  it('negative average but picks beat SET', () => {
    const v = verdictFor(scan(hz(0.1, -0.2, 0.3), sum({ avg_return_pct: -0.87, payoff_ratio: 1.22, n_win: 34, n_loss: 66 })));
    expect(v.head).toBe('เลือกหุ้นได้พอ ๆ กับตลาด แต่ยังไม่ทำกำไร (เฉลี่ย -0.87% ต่อไม้)');
    expect(v.why).toContain('ชนะ SET 2 จาก 3 ระยะถือ');
    expect(v.why).toContain('ไม้ที่กำไรมี 34%');
    expect(v.why).toContain('อย่างน้อย 45%');
  });
  it('negative average and picks lose to SET', () => {
    const v = verdictFor(scan(hz(-0.1, -0.2, 0.3), sum({ avg_return_pct: -1 })));
    expect(v.head).toBe('หุ้นที่เลือกยังแพ้ตลาด แต่ยังไม่ทำกำไร (เฉลี่ย -1.00% ต่อไม้)');
    expect(v.why).toBe('หุ้นที่สแกนเลือกชนะ SET 1 จาก 3 ระยะถือ และผลเฉลี่ยต่อไม้ยังติดลบ ดูรายละเอียดใน 3 ช่องด้านล่าง');
  });
  it('small sample flag', () => {
    expect(verdictFor(scan(hz(1, 1, 1), sum({ n_closed: 25 }))).smallSample).toBe(true);
    expect(verdictFor(scan(hz(1, 1, 1), sum({ n_closed: 30 }))).smallSample).toBe(false);
  });
  it('nothing closed yet', () => {
    expect(verdictFor(scan(hz(1, 1, 1), sum({ n_closed: 0, avg_return_pct: null }))).head).toContain('ยังสรุปผลไม่ได้');
  });
});

describe('what-if rows', () => {
  const row = (avg: number, diff: number | null, n = 100, extra: object = {}) => ({
    n, avg_return_pct: avg, win_rate_pct: 40, current_same_avg_pct: diff == null ? avg : avg - diff, diff_pct: diff, ...extra,
  });
  it('diff comes from diff_pct (same setups), not from the whole-set average', () => {
    // hold_20 looks +1.5 better than the whole set (avg −0.5), but on its own setups the main rule is −0.2 → diff 0.1 → no badge
    const l = whatIfLines({ current: row(-0.5, null), hold_20: row(1.0, 0.1) });
    const h = l.find(x => x.key === 'hold_20')!;
    expect(h.diff).toBe(0.1);
    expect(h.sameAvg).toBeCloseTo(0.9);
    expect(h.best).toBe(false);
  });
  it('only the top row with diff_pct ≥ 0.2 and n ≥ 30 is ดีสุด', () => {
    const l = whatIfLines({ current: row(-0.87, null), hold_10: row(0.59, 1.49), tp_5: row(0.32, 1.2), sl_3: row(-0.61, 0.26) });
    expect(l.filter(x => x.best).map(x => x.key)).toEqual(['hold_10']);
  });
  it('exactly 0.2 counts, 0.19 does not', () => {
    expect(whatIfLines({ current: row(0, null), hold_5: row(0.2, 0.2) }).some(x => x.best)).toBe(true);
    expect(whatIfLines({ current: row(0, null), hold_5: row(0.19, 0.19) }).some(x => x.best)).toBe(false);
  });
  it('n < 30 never gets the badge and is flagged as a small sample', () => {
    const l = whatIfLines({ current: row(1, null, 25), hold_20: row(6.42, 2.89, 22), hold_10: row(2, 0.3, 30) });
    const h20 = l.find(x => x.key === 'hold_20')!;
    expect([h20.best, h20.lowSample]).toEqual([false, true]);
    // next best (n = 30) gets it instead
    expect(l.find(x => x.key === 'hold_10')!.best).toBe(true);
  });
  it('a different-set row (exit_on_drop) never gets ดีสุด even with a big diff', () => {
    const l = whatIfLines({ current: row(0, null), exit_on_drop: row(3, 3, 900, { different_set: true }), hold_5: row(0.5, 0.5) });
    expect(l.find(x => x.key === 'exit_on_drop')!.differentSet).toBe(true);
    expect(l.filter(x => x.best).map(x => x.key)).toEqual(['hold_5']);
  });
  it('old file without diff_pct: no diff, no badge', () => {
    const l = whatIfLines({ current: { n: 100, avg_return_pct: 0, win_rate_pct: 40 }, hold_5: { n: 100, avg_return_pct: 2, win_rate_pct: 50 } });
    expect(l[1].diff).toBeNull();
    expect(l.some(x => x.best)).toBe(false);
  });
  it('missing what_if', () => expect(whatIfLines(undefined)).toEqual([]));
});
