import { describe, expect, it } from 'vitest';
import {
  gaugeRows, funnelSteps, nextStep, parseLuk, regimeSentence, sizingNotes, sortByScore, stopText, tabCandidates, tabCounts,
  themeBySymbol, MODE_INFO, MODE_ORDER, type LukCandidate, type LukConfig, type LukRegime,
} from './luk';

const CFG: LukConfig = {
  reg_long_above21: 60, reg_long_stacked: 55, reg_def_failed: 25, reg_short_above21: 30, min_price: 2, min_value20_mb: 50,
  min_adr_pct: 3, leader_top_n: 30, risk_pct: 0.3, max_position_pct: 35, min_stop_ticks: 3, intraday_stop_pct: 1.5,
};

const regime = (mode: LukRegime['mode'], extra: Partial<LukRegime> = {}): LukRegime => ({
  mode, suggested_risk_pct: 0.3, leaders_counted: 30, pct_above_ema9: 80, pct_above_ema21: 93.3, pct_ema9_over_ema21: 100,
  pct_gap_down_today: 6.7, pct_failed_breakout: 3.3, set: { close: 1639.34, above_ema9: true, above_ema21: true, ema21_rising: true }, rule: null, ...extra,
});

const cand = (symbol: string, setup: string, score: number, extra: Partial<LukCandidate> = {}): LukCandidate => ({
  symbol, setup, score, close: 15.3, adr_pct: 5.4, ref_level: 14.96, ref_name: 'EMA9', dist_ref_adr: 0.41, perf_1m: 15.9,
  rs_rating: 99, leader_rank: 7, sector: 'Industrials', subsector: null, entry_trigger: 15.6, stop_pct: 1.92, stop_price: 15.3,
  stop_ticks: 3, size_pct_daily_stop: 15.3, size_pct_intraday_stop: 15.6, note: 'ย่อ 3 แท่งเข้าหา EMA9', ...extra,
});

describe('regimeSentence — ทุกโหมด', () => {
  it('LONG เล่นฝั่งซื้อเต็ม risk + เลขจากไฟล์', () => {
    expect(regimeSentence(regime('LONG'))).toBe('เล่นฝั่งซื้อเต็ม risk · ผู้นำ 93% ยืนเหนือ EMA21 และ SET เป็นขาขึ้น → risk ต่อไม้ 0.30% ของพอร์ต');
  });
  it('MIXED / DEFENSIVE ใช้ risk ครึ่งตามไฟล์', () => {
    const m = regimeSentence(regime('MIXED', { suggested_risk_pct: 0.15, pct_above_ema21: 52 }));
    expect(m).toContain('risk ครึ่ง');
    expect(m).toContain('ผู้นำ 52%');
    expect(m).toContain('0.15%');
    const d = regimeSentence(regime('DEFENSIVE', { suggested_risk_pct: 0.15 }));
    expect(d).toContain('risk ครึ่ง ระวัง');
  });
  it('SHORT = ไม่เล่นฝั่งซื้อ', () => {
    const s = regimeSentence(regime('SHORT', { set: { close: 1300, above_ema9: false, above_ema21: false, ema21_rising: false }, pct_above_ema21: 20 }));
    expect(s).toContain('ไม่เล่นฝั่งซื้อ');
    expect(s).toContain('SET ต่ำกว่า EMA21');
  });
  it('SET เหนือ EMA21 แต่ยังไม่ขึ้น + ไม่มีข้อมูล SET', () => {
    expect(regimeSentence(regime('MIXED', { set: { close: 1, above_ema9: true, above_ema21: true, ema21_rising: false } }))).toContain('EMA21 ยังไม่ขึ้น');
    expect(regimeSentence(regime('LONG', { set: null, pct_above_ema21: null }))).toContain('ผู้นำ - ยืนเหนือ EMA21');
  });
  it('ครบ 4 โหมด ตามลำดับแถบ', () => {
    expect(MODE_ORDER).toEqual(['LONG', 'MIXED', 'DEFENSIVE', 'SHORT']);
    for (const m of MODE_ORDER) expect(MODE_INFO[m].meaning.length).toBeGreaterThan(0);
  });
});

describe('gaugeRows / funnel — เกณฑ์จาก config', () => {
  it('ขีดเกณฑ์มาจาก config ไม่ใช่โค้ด', () => {
    const g = gaugeRows(regime('LONG'), CFG);
    expect(g.map(x => x.key)).toEqual(['above21', 'above9', 'stacked', 'gapdn', 'failed']);
    expect(g[0]).toMatchObject({ value: 93.3, mark: 60 });
    expect(g[0].markLabel).toBe('LONG ≥ 60% · SHORT ≤ 30%');
    expect(g[4]).toMatchObject({ mark: 25, markLabel: 'DEFENSIVE ≥ 25%' });
    const g2 = gaugeRows(regime('LONG'), { ...CFG, reg_long_above21: 70 });
    expect(g2[0].mark).toBe(70);
    expect(gaugeRows(regime('LONG'), {})[0].mark).toBeNull();
  });
  it('funnel ใช้ค่าจาก config', () => {
    const s = funnelSteps({ universe: 799, price: 438, value20: 106, adr: 51 }, CFG, 30);
    expect(s.map(x => x.n)).toEqual([799, 438, 106, 51, 30]);
    expect(s[1].label).toBe('ราคา ≥ 2 บาท');
    expect(s[2].label).toBe('มูลค่า 20 วัน ≥ 50 ลบ.');
    expect(s[3].label).toBe('ADR ≥ 3%');
  });
});

describe('การเรียง / แท็บ', () => {
  const rows = [cand('B', 'LONG_PULLBACK', 20), cand('A', 'LONG_PULLBACK', 35), cand('E', 'EPISODIC_PIVOT', 50), cand('C', 'LONG_PULLBACK', 20)];
  it('เรียง score มาก→น้อย เสมอ → ชื่อหุ้น', () => {
    expect(sortByScore(rows).map(r => r.symbol)).toEqual(['E', 'A', 'B', 'C']);
  });
  it('แท็บ: ฝั่งซื้อทั้งหมด / รายแบบ / หุ้นอ่อนแรงไม่มีแถวฝั่งซื้อ', () => {
    expect(tabCandidates(rows, 'buy')).toHaveLength(4);
    expect(tabCandidates(rows, 'LONG_PULLBACK').map(r => r.symbol)).toEqual(['A', 'B', 'C']);
    expect(tabCandidates(rows, 'EPISODIC_PIVOT').map(r => r.symbol)).toEqual(['E']);
    expect(tabCandidates(rows, 'weak')).toEqual([]);
  });
  it('tabCounts ใช้ counts{} ในไฟล์ ไม่มีให้นับจากรายการ', () => {
    const w = [{ symbol: 'T', setup: 'PARABOLIC_SHORT' }] as never;
    expect(tabCounts({ counts: { LONG_PULLBACK: 11, EPISODIC_PIVOT: 0, SHORT_WEAK_BOUNCE: 0, PARABOLIC_SHORT: 1 }, candidates: [], weak: w }))
      .toEqual({ buy: 11, LONG_PULLBACK: 11, EPISODIC_PIVOT: 0, weak: 1 });
    expect(tabCounts({ counts: {}, candidates: rows, weak: w })).toEqual({ buy: 4, LONG_PULLBACK: 3, EPISODIC_PIVOT: 1, weak: 1 });
  });
});

describe('ป้ายกลุ่มซ้ำ', () => {
  it('themeBySymbol แปะเฉพาะหุ้นในกลุ่มที่แจ้งเตือน', () => {
    const m = themeBySymbol([{ subsector: 'Electronic Components', count: 3, symbols: ['KCE', 'CCET', 'HANA'] }]);
    expect(m.get('KCE')).toBe('Electronic Components');
    expect(m.has('TRT')).toBe(false);
    expect(themeBySymbol([]).size).toBe(0);
  });
});

describe('ข้อความในแถว', () => {
  it('ทำอะไรพรุ่งนี้ = ประโยคตายตัว + entry_trigger · stop = ราคา (−% · tick)', () => {
    const c = cand('TRT', 'LONG_PULLBACK', 35);
    expect(nextStep(c)).toBe('ผ่าน 15.60 ด้วย ORB/VWAP บนกราฟเล็กค่อยพิจารณา');
    expect(stopText(c)).toBe('15.30 (−1.92% · 3 tick)');
    expect(stopText(cand('X', 'LONG_PULLBACK', 1, { stop_price: null }))).toBe('-');
  });
  it('sizingNotes ใช้ตัวเลขจาก config', () => {
    const n = sizingNotes(CFG, 0.3);
    expect(n[0]).toContain('risk 0.30%');
    expect(n[0]).toContain('เพดาน 35%');
    expect(n[1]).toContain('3 tick');
    expect(sizingNotes({ ...CFG, max_position_pct: 20, min_stop_ticks: 4 }, 0.15).join(' ')).toContain('เพดาน 20%');
  });
});

describe('parseLuk / fallback / หุ้นอ่อนแรง', () => {
  const base = {
    as_of: '2026-07-22', config: CFG, regime: { mode: 'LONG', pct_above_ema21: 93.3, suggested_risk_pct: 0.3 },
    funnel: { universe: 799, price: 438, value20: 106, adr: 51 }, counts: { LONG_PULLBACK: 1 }, leaders: [{ symbol: 'TRT' }],
    candidates: [{ symbol: 'TRT', setup: 'LONG_PULLBACK', score: 35.1, close: 15.3, entry_trigger: 15.6, stop_price: 15.3, note: 'x' }],
    weak: [{ symbol: 'TOP', setup: 'PARABOLIC_SHORT', score: 10, close: 65.75, perf_1m: 40, rs_rating: 90, note: 'วิ่งแนวตั้ง',
             entry_trigger: 66, stop_price: 60, stop_pct: 3, size_pct_intraday_stop: 9, size_pct_daily_stop: 8 }],
    theme_alerts: [{ subsector: 'Electronic Components', count: 3, symbols: ['KCE', 'CCET', 'HANA'] }], warnings: ['w'], reminder: 'Watchlist',
  };
  it('ไม่มีไฟล์ / ไม่ใช่ไฟล์ luk → null', () => {
    expect(parseLuk(null)).toBeNull();
    expect(parseLuk({})).toBeNull();
    expect(parseLuk([])).toBeNull();
    expect(parseLuk({ candidates: [] })).toBeNull();
  });
  it('หุ้นอ่อนแรงไม่มีจุดเข้า / stop / ขนาดไม้ แม้ไฟล์ใส่มา', () => {
    const d = parseLuk(base)!;
    expect(d.weak).toHaveLength(1);
    const keys = Object.keys(d.weak[0]);
    expect(keys.some(k => /entry|stop|size/.test(k))).toBe(false);
    expect(d.weak[0]).toMatchObject({ symbol: 'TOP', perf_1m: 40, rs_rating: 90 });
  });
  it('regime ว่าง (คำนวณพัง) → ข้อมูลยังอ่านได้ regime = null + warnings', () => {
    const d = parseLuk({ ...base, regime: {}, candidates: [], weak: [] })!;
    expect(d.regime).toBeNull();
    expect(d.warnings).toEqual(['w']);
  });
  it('แถวเสียรูปถูกทิ้ง · leadersCount · themeAlerts', () => {
    const d = parseLuk({ ...base, candidates: [...base.candidates, 'junk', { symbol: 'NOSETUP' }] })!;
    expect(d.candidates.map(c => c.symbol)).toEqual(['TRT']);
    expect(d.leadersCount).toBe(1);
    expect(d.themeAlerts[0].symbols).toEqual(['KCE', 'CCET', 'HANA']);
    expect(d.reminder).toBe('Watchlist');
  });
});
