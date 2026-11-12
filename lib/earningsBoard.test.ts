import { describe, it, expect } from 'vitest';
import type { EarningsBucket } from './earningsBucket';
import { PEAD_MIN_ADTV_MB } from './earningsMetrics';
import type { PeadExtra } from './peadExtras';
import {
  interestScore, INTEREST_WEIGHTS as W, isLiquid, boardGroup, sectorBoard, SECTOR_MIN, dayHighlights,
  foldRows, boardComparator, parseBoardQuery, boardQueryString, parseSort, DEFAULT_QUERY,
} from './earningsBoard';

interface Row {
  ticker: string; announceDate: string | null; bucket: EarningsBucket | null;
  netProfit: number | null; netProfitPrior: number | null;
  quarter?: string; priorQuarter?: string | null; netProfitPriorQ?: number | null; netProfitPriorQPrior?: number | null;
  auditorOpinion?: string | null; sector?: string; subsector?: string; market?: string;
  x?: PeadExtra;
}

const LIQ: PeadExtra = { adtv: PEAD_MIN_ADTV_MB };
function r(over: Partial<Row>): Row {
  return { ticker: 'AAA', announceDate: '2026-11-11T17:00:00+07:00', bucket: 'profit_shrink', netProfit: 90, netProfitPrior: 100, x: LIQ, ...over };
}
const xOf = (a: Row) => a.x;

describe('interestScore - each condition', () => {
  const base = interestScore(r({}), LIQ); // profit_shrink, liquid, nothing else
  it('a plain liquid กำไรหด scores 0', () => expect(base).toBe(0));
  it('+2 กำไรโต / พลิกกำไร, +1 ขาดทุนลดลง', () => {
    expect(interestScore(r({ bucket: 'profit_growth', netProfit: 110 }), LIQ)).toBe(W.growth);
    expect(interestScore(r({ bucket: 'turnaround', netProfit: 10, netProfitPrior: -5 }), LIQ)).toBe(W.growth);
    expect(interestScore(r({ bucket: 'loss_shrink', netProfit: -5, netProfitPrior: -10 }), LIQ)).toBe(W.lossShrink);
  });
  it('+1 YoY ≥ 20% - off a profit base only (a loss base gives no %)', () => {
    expect(interestScore(r({ bucket: 'profit_growth', netProfit: 120 }), LIQ)).toBe(W.growth + W.bigYoY);
    expect(interestScore(r({ bucket: 'profit_growth', netProfit: 119 }), LIQ)).toBe(W.growth);
    expect(interestScore(r({ bucket: 'loss_shrink', netProfit: -5, netProfitPrior: -100 }), LIQ)).toBe(W.lossShrink);
  });
  it('+2 ⚡ เร่งตัว (existing isAccelerating rule)', () => {
    const acc = r({ bucket: 'profit_growth', netProfit: 110, quarter: 'ไตรมาส 3/2569', priorQuarter: 'ไตรมาส 2/2569', netProfitPriorQ: 100, netProfitPriorQPrior: 100 });
    expect(interestScore(acc, LIQ)).toBe(W.growth + W.accel);
  });
  it('+2 per scan, at most 3 scans', () => {
    expect(interestScore(r({}), { ...LIQ, scans: ['sepa'] })).toBe(W.perScan);
    expect(interestScore(r({}), { ...LIQ, scans: ['sepa', 'kell', 'oneil', 'breakout', 'ppbp'] })).toBe(3 * W.perScan);
  });
  it('+2 S.Bull / Bull, +1 RS ≥ 80', () => {
    expect(interestScore(r({}), { ...LIQ, stage: 'S.Bull' })).toBe(W.stageUp);
    expect(interestScore(r({}), { ...LIQ, stage: 'Bull' })).toBe(W.stageUp);
    expect(interestScore(r({}), { ...LIQ, stage: 'Accumulation' })).toBe(0);
    expect(interestScore(r({}), { ...LIQ, rs: 80 })).toBe(W.rs);
    expect(interestScore(r({}), { ...LIQ, rs: 79 })).toBe(0);
  });
  it('−4 ADTV below the PEAD line or no ADTV', () => {
    expect(interestScore(r({}), { adtv: PEAD_MIN_ADTV_MB - 0.1 })).toBe(W.illiquid);
    expect(interestScore(r({}), undefined)).toBe(W.illiquid);
    expect(interestScore(r({}), {})).toBe(W.illiquid);
  });
  it('−3 auditor มีเงื่อนไข / ไม่แสดงความเห็น; ข้อสังเกต is not penalised', () => {
    expect(interestScore(r({ auditorOpinion: 'มีเงื่อนไข' }), LIQ)).toBe(W.auditorRed);
    expect(interestScore(r({ auditorOpinion: 'ไม่แสดงความเห็น' }), LIQ)).toBe(W.auditorRed);
    expect(interestScore(r({ auditorOpinion: 'ไม่มีเงื่อนไขและมีข้อสังเกต' }), LIQ)).toBe(0);
  });
  it('−1 Weinstein 3', () => {
    expect(interestScore(r({}), { ...LIQ, wein: 'Stage 3 (Topping)' })).toBe(W.weinstein3);
    expect(interestScore(r({}), { ...LIQ, wein: 'Stage 2 (Advancing)' })).toBe(0);
  });
});

describe('isLiquid', () => {
  it('uses PEAD_MIN_ADTV_MB, no ADTV → not liquid', () => {
    expect(isLiquid(PEAD_MIN_ADTV_MB)).toBe(true);
    expect(isLiquid(PEAD_MIN_ADTV_MB - 0.01)).toBe(false);
    expect(isLiquid(null)).toBe(false);
    expect(isLiquid(NaN)).toBe(false);
  });
});

describe('sector box', () => {
  it('group = subsector, mai → "<sector> (mai)"', () => {
    expect(boardGroup({ subsector: 'Banking', sector: 'Financials', market: 'SET' })).toBe('Banking');
    expect(boardGroup({ subsector: '', sector: 'Technology', market: 'MAI' })).toBe('Technology (mai)');
  });
  const g = (sub: string, b: EarningsBucket, n = 1, t = 'X') => Array.from({ length: n }, (_, i) =>
    r({ ticker: `${t}${i}`, subsector: sub, bucket: b }));
  it('minimum per group, no_base left out of count and %', () => {
    const rows = [
      ...g('Good', 'profit_growth', 3), ...g('Good', 'no_base', 4),
      ...g('Small', 'profit_growth', 2), ...g('Small', 'no_base', 3),
    ];
    const { best } = sectorBoard(rows, SECTOR_MIN.day);
    expect(best.map(x => [x.group, x.n, x.pct])).toEqual([['Good', 3, 100]]);
  });
  it('% = improved / with-base; best and worst never repeat', () => {
    const rows = [
      ...g('A', 'profit_growth', 2), ...g('A', 'profit_shrink', 1),   // 67%
      ...g('B', 'loss_shrink', 1), ...g('B', 'loss_worse', 2),        // 33%
      ...g('C', 'turnaround', 3),                                      // 100%
    ];
    const { best, worst } = sectorBoard(rows, 3);
    expect(best.map(x => `${x.group}:${x.pct}`)).toEqual(['C:100', 'A:67', 'B:33']);
    expect(worst).toEqual([]);
  });
  it('mai groups are grouped by sector', () => {
    const rows = [0, 1, 2].map(i => r({ ticker: `M${i}`, subsector: '', sector: 'Services', market: 'MAI', bucket: 'profit_growth' }));
    expect(sectorBoard(rows, 3).best[0].group).toBe('Services (mai)');
  });
});

describe('เด่นของวัน', () => {
  const day = '2026-11-11';
  const rows: Row[] = [
    r({ ticker: 'LOWSCORE', bucket: 'profit_growth', netProfit: 110, x: { adtv: 500 } }),
    r({ ticker: 'TOP', bucket: 'turnaround', netProfit: 5, netProfitPrior: -5, x: { adtv: 10, stage: 'Bull' } }),
    r({ ticker: 'TIE_BIG', bucket: 'profit_growth', netProfit: 110, x: { adtv: 900 } }),
    r({ ticker: 'ILLIQ', bucket: 'profit_growth', netProfit: 200, x: { adtv: 1 } }),
    r({ ticker: 'SHRINK', bucket: 'profit_shrink', x: { adtv: 100 } }),
    r({ ticker: 'OTHERDAY', bucket: 'profit_growth', netProfit: 200, announceDate: '2026-11-10T17:00:00+07:00', x: { adtv: 100 } }),
  ];
  it('กำไรโต / พลิกกำไร + liquid only, score then ADTV; total = all filings of the day', () => {
    const { passed, total } = dayHighlights(rows, day, xOf);
    expect(passed.map(a => a.ticker)).toEqual(['TOP', 'TIE_BIG', 'LOWSCORE']);
    expect(total).toBe(5);
  });
  it('nothing passes → empty', () => {
    expect(dayHighlights(rows, '2026-11-01', xOf).passed).toEqual([]);
  });
});

describe('folds', () => {
  const rows = [
    r({ ticker: 'LIQ', x: { adtv: 50 } }),
    r({ ticker: 'ILL', x: { adtv: 1 } }),
    r({ ticker: 'NOADTV', x: undefined }),
    r({ ticker: 'FUND', netProfit: null, netProfitPrior: null, bucket: null, x: { adtv: 80 } }),
  ];
  const adtv = (a: Row) => a.x?.adtv;
  it('hide on: low liquidity folded, funds always folded', () => {
    const f = foldRows(rows, true, adtv);
    expect(f.shown.map(a => a.ticker)).toEqual(['LIQ']);
    expect(f.illiquid.map(a => a.ticker)).toEqual(['ILL', 'NOADTV']);
    expect(f.funds.map(a => a.ticker)).toEqual(['FUND']);
  });
  it('hide off: low liquidity shown, funds still folded', () => {
    const f = foldRows(rows, false, adtv);
    expect(f.shown.map(a => a.ticker)).toEqual(['LIQ', 'ILL', 'NOADTV']);
    expect(f.illiquid).toEqual([]);
    expect(f.funds.map(a => a.ticker)).toEqual(['FUND']);
  });
});

describe('4 sort orders', () => {
  const rows = [
    r({ ticker: 'G50', bucket: 'profit_growth', netProfit: 150, announceDate: '2026-11-11T10:00:00+07:00', x: { adtv: 20 } }),
    r({ ticker: 'TURN', bucket: 'turnaround', netProfit: 5, netProfitPrior: -5, announceDate: '2026-11-11T12:00:00+07:00', x: { adtv: 8 } }),
    r({ ticker: 'G900', bucket: 'profit_growth', netProfit: 1000, announceDate: '2026-11-11T09:00:00+07:00', x: { adtv: 2 } }),
    r({ ticker: 'LOSS', bucket: 'loss_shrink', netProfit: -5, netProfitPrior: -100, announceDate: '2026-11-11T18:00:00+07:00', x: undefined }),
  ];
  const order = (s: Parameters<typeof boardComparator>[0]) => [...rows].sort(boardComparator(s, xOf)).map(a => a.ticker);
  it('น่าสนใจก่อน: score, then ADTV', () => {
    // G50 2+1=3 · TURN 2 · G900 2+1-4=-1 · LOSS 1-4=-3
    expect(order('score')).toEqual(['G50', 'TURN', 'G900', 'LOSS']);
  });
  it('เวลาประกาศ: newest first', () => expect(order('time')).toEqual(['LOSS', 'TURN', 'G50', 'G900']));
  it('กำไรโตมากสุด: พลิกกำไร on top, then %, no % last', () => expect(order('yoy')).toEqual(['TURN', 'G900', 'G50', 'LOSS']));
  it('สภาพคล่องมากสุด: no ADTV last', () => expect(order('adtv')).toEqual(['G50', 'TURN', 'G900', 'LOSS']));
});

describe('URL', () => {
  it('empty → defaults, and defaults write nothing', () => {
    expect(parseBoardQuery('')).toEqual(DEFAULT_QUERY);
    expect(boardQueryString(DEFAULT_QUERY)).toBe('');
  });
  it('round-trips every parameter', () => {
    const s = '?day=2026-11-10&scope=q&liq=0&sort=adtv&f=acc,scan,pead&tab=turnaround&view=list&q=PTT&quarter=all';
    const q = parseBoardQuery(s);
    expect(q).toEqual({
      day: '2026-11-10', scope: 'q', hideIlliquid: false, sort: 'adtv', filters: ['acc', 'scan', 'pead'],
      tab: 'turnaround', view: 'list', q: 'PTT', quarter: 'all',
    });
    expect(boardQueryString(q)).toBe(s.replace(/,/g, '%2C'));
  });
  it('bad values → defaults', () => {
    expect(parseBoardQuery('?day=11-11&scope=week&liq=x&sort=zzz&f=foo,acc&tab=nope&view=grid')).toEqual({
      ...DEFAULT_QUERY, filters: ['acc'],
    });
  });
  it('old links: ?view=list and the old column-sort keys', () => {
    expect(parseBoardQuery('?view=list').view).toBe('list');
    expect(parseSort('announceDate')).toBe('time');
    expect(parseSort('yoy')).toBe('yoy');
    expect(parseSort('netProfit')).toBe('score');
  });
  it('keeps unknown params', () => {
    expect(boardQueryString({ ...DEFAULT_QUERY, sort: 'time' }, '?utm=x&sort=adtv')).toBe('?utm=x&sort=time');
  });
});
