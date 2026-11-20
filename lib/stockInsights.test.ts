import { describe, expect, it } from 'vitest';
import {
  buildScanHistoryCard,
  entryNumbers,
  entryPlanFromSepaRow,
  entrySummary,
  fmtMillion,
  groupRs,
  hitsOnDates,
  lastTradingDates,
  moneyFlowSummary,
  nvdrForTicker,
  setupsForTicker,
  stageByDates,
  statForSetup,
  statsSummary,
  type EntryPlan,
  type StatRow,
} from './stockInsights';

const KBANK_SEPA = {
  Ticker: 'KBANK', Price: 250.0, 'SL(-8%)': 230.0, 'TP(+16%)': 290.0,
  VCP_Weeks: 8.0, VCP_T: 3, VCP_MaxDepth: 13.4, VCP_FinalDepth: 3.5, VCP_Contracting: true,
  VCP_VolRatio: 1.09, VCP_Pivot: 258.0, VCP_ToPivot: 3.1, VCP_Footprint: '8W 13/3 3T',
};

describe('entry plan (card 1)', () => {
  const plan = entryPlanFromSepaRow(KBANK_SEPA) as EntryPlan;

  it('parses a sepa.json row', () => {
    expect(plan).toMatchObject({ footprint: '8W 13/3 3T', pivot: 258, sl: 230, tp: 290, scanPrice: 250, volRatio: 1.09, contracting: true });
  });

  it('returns null when the stock is not in sepa.json or SL/TP is missing', () => {
    expect(entryPlanFromSepaRow(undefined)).toBeNull();
    expect(entryPlanFromSepaRow({ Ticker: 'X', Price: 10 })).toBeNull();
  });

  it('treats "no base" as no VCP base', () => {
    const p = entryPlanFromSepaRow({ ...KBANK_SEPA, VCP_Footprint: 'no base', VCP_Pivot: null }) as EntryPlan;
    expect(p.footprint).toBeNull();
    expect(p.pivot).toBeNull();
    expect(entrySummary(p, 250)).toBe('ยังไม่มีฐาน VCP · ซื้อที่ 250 เสี่ยง 8.0% ได้ 16.0% (R:R 1:2.0)');
  });

  it('below pivot + volume not dry', () => {
    expect(entrySummary(plan, 250)).toBe('ยังไม่เบรก Pivot 258 (อีก +3.2%) · วอลุ่มยังไม่แห้ง · ซื้อที่ 250 เสี่ยง 8.0% ได้ 16.0% (R:R 1:2.0)');
  });

  it('inside the 5% buy zone above pivot (boundary inclusive) + dry volume', () => {
    const dry = { ...plan, volRatio: 0.8 };
    expect(entrySummary(dry, 258)).toMatch(/^เบรก Pivot แล้ว อยู่ในระยะซื้อ · วอลุ่มแห้ง · /);
    expect(entrySummary(dry, 258 * 1.05)).toMatch(/^เบรก Pivot แล้ว อยู่ในระยะซื้อ/);
  });

  it('past the buy zone', () => {
    expect(entrySummary(plan, 272)).toMatch(/^เลยระยะซื้อแล้ว \(เกิน 5% จาก Pivot\)/);
  });

  it('R:R rounds to 1 decimal from the live price', () => {
    const n = entryNumbers(plan, 240);
    expect(n.riskPct).toBeCloseTo(4.17, 2);
    expect(n.rewardPct).toBeCloseTo(20.83, 2);
    expect(n.rr).toBe(5);
  });

  it('price below SL / above TP has no R:R', () => {
    expect(entrySummary(plan, 225)).toMatch(/ราคาต่ำกว่าจุดตัดขาดทุน 230 แล้ว$/);
    expect(entrySummary(plan, 295)).toMatch(/ราคาถึงเป้า 290 แล้ว$/);
  });
});

describe('scan history (card 2)', () => {
  const dates = Array.from({ length: 35 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`).slice(0, 31);

  it('takes the last 30 trading dates from the file (no weekday guessing)', () => {
    const d = lastTradingDates(['2026-11-03', '2026-11-01', 'x', 5, '2026-11-02'], 2);
    expect(d).toEqual(['2026-11-02', '2026-11-03']);
    expect(lastTradingDates(dates)).toHaveLength(30);
    expect(lastTradingDates(null)).toEqual([]);
  });

  it('maps stage runs and hits onto dates', () => {
    const ds = ['2026-11-01', '2026-11-02', '2026-11-03'];
    expect(stageByDates([['Bull', '2026-10-01', '2026-11-01'], ['Warning', '2026-11-03', '2026-11-03']], ds)).toEqual(['Bull', null, 'Warning']);
    expect(hitsOnDates(['2026-11-02'], ds)).toEqual([false, true, false]);
  });

  const summary = {
    n_closed: 496, win_rate_pct: 29.23, avg_return_pct: -1.31, avg_mfe_pct: 8.41,
    by_stage: [{ stage: 'S.Bull', n: 269, avg_return_pct: -1.72, win_rate_pct: 23.42, avg_mfe_pct: 10.37 }, { stage: 'Bear', n: 1, avg_return_pct: -8, win_rate_pct: 0, avg_mfe_pct: 8 }],
  };

  it('uses by_stage of the entry stage when n >= 30, else the scan overall', () => {
    expect(statForSetup('sepa', 'S.Bull', summary)).toMatchObject({ stage: 'S.Bull', n: 269, avgMfe: 10.37 });
    expect(statForSetup('sepa', 'Bear', summary)).toMatchObject({ stage: null, entryStage: 'Bear', n: 496, avgMfe: 8.41 });
    expect(statForSetup('sepa', 'ไม่มีข้อมูล', summary)).toMatchObject({ stage: null, n: 496 });
    expect(statForSetup('sepa', 'S.Bull', undefined)).toBeNull();
  });

  const rc = {
    sepa: {
      setups: [
        { ticker: 'KBANK', entry_date: '2026-06-25', entry_price: 212, exit_date: '2026-10-05', holding_days: 69, return_pct: 11.32, mfe_pct: 23.11, mae_pct: 0.47, status: 'closed', setup_seq: 1, stage_at_entry: 'S.Bull' },
        { ticker: 'KBANK', entry_date: '2026-10-28', entry_price: 250, holding_days: 16, return_pct: 0, mfe_pct: 3.2, mae_pct: -4.4, status: 'open', setup_seq: 2, stage_at_entry: 'S.Bull' },
        { ticker: 'OTHER', entry_date: '2026-10-28', entry_price: 9, status: 'open', setup_seq: 1 },
      ],
      setup_summary: summary,
    },
    kell: {
      setups: [{ ticker: 'KBANK', entry_date: '2026-09-16', entry_price: 250, exit_date: '2026-09-30', status: 'closed', setup_seq: 2, return_pct: -6.4 }],
      setup_summary: summary,
    },
  };

  it('keeps open setups of this ticker + the latest closed one', () => {
    const { open, lastClosed } = setupsForTicker(rc, 'KBANK');
    expect(open.map(o => `${o.scan}#${o.seq}`)).toEqual(['sepa#2']);
    expect(lastClosed).toMatchObject({ scan: 'sepa', seq: 1, status: 'closed' });
    expect(setupsForTicker(rc, 'NONE')).toEqual({ open: [], lastClosed: null });
  });

  it('builds the card for one ticker (with data)', () => {
    const ds = ['2026-11-18', '2026-11-19'];
    const card = buildScanHistoryCard({
      ticker: 'KBANK', dates: ds, stageRuns: [['S.Bull', '2026-11-10', '2026-11-19']],
      hitDates: { sepa: ['2026-11-19'], kell: [], breakout: undefined },
      scanDays: { sepa: { KBANK: 18 }, kell: { KBANK: 16 } }, reportCard: rc,
    });
    expect(card?.rows.map(r => [r.key, r.days, r.hits])).toEqual([['sepa', 18, [false, true]]]);
    expect(card?.setups.map(s => s.status)).toEqual(['open', 'closed']);
    expect(card?.stats.map(s => s.scan)).toEqual(['sepa']);
    expect(card?.stage).toEqual(['S.Bull', 'S.Bull']);
  });

  it('builds an empty card for a ticker with no data (stage row + message)', () => {
    const card = buildScanHistoryCard({ ticker: 'NONE', dates: ['2026-11-19'], stageRuns: undefined, hitDates: {}, scanDays: null, reportCard: null });
    expect(card).toEqual({ dates: ['2026-11-19'], stage: [null], rows: [], setups: [], stats: [] });
    expect(buildScanHistoryCard({ ticker: 'NONE', dates: undefined, stageRuns: undefined, hitDates: {}, scanDays: null, reportCard: null })).toBeNull();
  });

  const stat = (o: Partial<StatRow>): StatRow => ({ scan: 'sepa', label: 'SEPA', stage: 'S.Bull', entryStage: 'S.Bull', n: 269, winRate: 23.4, avgReturn: -1.72, avgMfe: 10.37, ...o });

  it('summary rules', () => {
    expect(statsSummary([stat({})])?.text).toBe('setup แบบนี้มักวิ่งไปก่อน (SEPA เฉลี่ย +10.4%) แต่คืนกำไรเมื่อรอหลุดสแกน → ควรมีจุดขายทำกำไร');
    expect(statsSummary([stat({ avgReturn: 0, avgMfe: 5 })])?.text).toMatch(/^setup แบบนี้มักวิ่งไปก่อน/);
    expect(statsSummary([stat({ winRate: 50, avgReturn: 0.5, avgMfe: 4 })])?.text).toMatch(/^สถิติ setup แบบนี้เป็นบวก/);
    expect(statsSummary([stat({ winRate: 49.9, avgReturn: 0.5, avgMfe: 4 })])?.text).toBe('สถิติ setup แบบนี้ยังไม่ชัด');
    expect(statsSummary([stat({ avgReturn: -0.2, avgMfe: 4.9 })])?.text).toBe('สถิติ setup แบบนี้ยังไม่ชัด');
    expect(statsSummary([])).toBeNull();
  });
});

describe('money flow (card 3)', () => {
  const nvdr = {
    latest_date: '2026-11-18',
    today: [{ Date: '2026-11-18', Symbol: 'KBANK', Buy: 635398828.04, Sell: 765563772.04, Total: 1, Net: -130164944.0 }],
    '5d': [{ Symbol: 'KBANK', Buy: 5815290603.04, Sell: 7348817959.04, Total: 1, Net: -1533527356.0 }],
  };

  it('slices NVDR of one ticker', () => {
    const f = nvdrForTicker(nvdr, 'KBANK');
    expect(f.nvdrDate).toBe('2026-11-18');
    expect(f.today?.net).toBe(-130164944);
    expect(fmtMillion(f.d5!.net)).toBe('−1,534');
    expect(fmtMillion(f.d5!.buy, false)).toBe('5,815');
    expect(nvdrForTicker(nvdr, 'NONE')).toEqual({ nvdrDate: null, today: null, d5: null });
  });

  const series = (last: number, prev: number) => [...Array(10).fill(50), prev, ...Array(19).fill(60), last];
  const hist = {
    sectors: {
      SET: { Financials: { rs_series: series(62, 60), subsectors: { Banking: { rs_series: series(87, 84) }, Empty: { rs_series: [null, null] } } } },
      MAI: { Consumer: { rs_series: series(45, 50), subsectors: {} } },
    },
  };

  it('uses the subsector, falls back to the sector', () => {
    expect(groupRs(hist, 'SET', 'Financials', 'Banking')).toMatchObject({ group: 'Banking', level: 'subsector', latest: 87, prev20: 84 });
    expect(groupRs(hist, 'SET', 'Financials', 'Banking')?.series).toHaveLength(21);
    expect(groupRs(hist, 'SET', 'Financials', 'Empty')).toMatchObject({ group: 'Financials', level: 'sector', latest: 62 });
    expect(groupRs(hist, 'MAI', 'Consumer', null)).toMatchObject({ group: 'Consumer', level: 'sector', latest: 45, prev20: 50 });
    expect(groupRs(hist, 'SET', 'Nope', null)).toBeNull();
    expect(groupRs(hist, null, 'Financials', null)).toBeNull();
  });

  const rs = (latest: number, prev20: number | null) => ({ group: 'Banking', level: 'subsector' as const, latest, prev20, series: [] });

  it('summary rules', () => {
    const sell = { buy: 1, sell: 2, net: -1 };
    expect(moneyFlowSummary({ nvdrDate: null, today: null, d5: sell, rs: rs(87, 84) })).toEqual({ text: 'กลุ่ม Banking ยังแข็ง และแข็งขึ้น · ต่างชาติขายสุทธิ 5 วัน', tone: 'neutral' });
    expect(moneyFlowSummary({ nvdrDate: null, today: null, d5: { buy: 2, sell: 1, net: 1 }, rs: rs(70, 72) })?.text).toBe('กลุ่ม Banking ยังแข็ง · ต่างชาติซื้อสุทธิ 5 วัน');
    expect(moneyFlowSummary({ nvdrDate: null, today: null, d5: null, rs: rs(40, 45) })?.text).toBe('กลุ่ม Banking อ่อน แต่อ่อนลง');
    expect(moneyFlowSummary({ nvdrDate: null, today: null, d5: null, rs: rs(55, null) })?.text).toBe('กลุ่ม Banking กลาง ๆ');
    expect(moneyFlowSummary({ nvdrDate: null, today: null, d5: sell, rs: null })?.text).toBe('ต่างชาติขายสุทธิ 5 วัน');
    expect(moneyFlowSummary({ nvdrDate: null, today: null, d5: null, rs: null })).toBeNull();
  });
});
