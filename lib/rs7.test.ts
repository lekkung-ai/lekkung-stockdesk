import { describe, expect, it } from 'vitest';
import {
  actionSentence, filterStocks, parseRs7, patternAvailability, patternCounts, phaseCondition, phaseKey, phaseNotes,
  sortStocks, statusGroup, PHASE_B_NOTE, PHASE_NOTE, type Rs7Config, type Rs7Phase, type Rs7Stock, type Rs7SeriesRow,
} from './rs7';

const CFG: Rs7Config = {
  corr_th: 0.08, near_low: 0.04, phase_c_rally: 0.1, b_max_near_high: 0.03, pred_tight10: 0.1,
  sore_idx_ret63: -0.05, fast_bsl: [3, 40], rest_rally: 0.08, rest_bsl: [10, 120],
};

const stock = (ticker: string, patterns: [number, string][], extra: Partial<Rs7Stock> = {}): Rs7Stock => ({
  ticker, sector: null, stage: 'S.Bull', patterns: patterns.map(([id, status]) => ({ id, key: '', status })),
  close: 10, rs_rating: 80, dist_hi: -0.05, rs_gap: -0.01, rs_nh: false, tight10: 0.05, ants15: 8, tt: { pass: 8, total: 8 },
  pivot: 10.5, to_pivot: -0.0476, volx: 1.84, adtv_mb: 50, reset: null, ...extra,
});

const phase = (today: Rs7Phase['today'], extra: Partial<Rs7Phase> = {}): Rs7Phase => ({
  today, since: '2026-11-02', date: '2026-11-27', idx_close: 1440.29, idx_dd: -0.129, idx_high: 1652.97, idx_high_date: '2026-07-21',
  idx_low: 1414.44, idx_low_date: '2026-11-26', above_low: 0.018, bars_since_low: 1, corr_recent: true, idx_above_sma50: false,
  last_ftd: null, ...extra,
});

describe('actionSentence', () => {
  it('BREAKOUT: จุดซื้อวันนี้ + pivot + วอลุ่ม · ช่วง A/B ต่อท้าย ไม้ pilot', () => {
    const s = stock('X', [[1, 'BREAKOUT']]);
    expect(actionSentence(s, s.patterns[0], 'A', CFG)).toBe('จุดซื้อวันนี้ · เบรก 10.50 วอลุ่ม 1.8 เท่า · ไม้ pilot เท่านั้น');
    expect(actionSentence(s, s.patterns[0], 'B', CFG)).toContain('ไม้ pilot เท่านั้น');
    expect(actionSentence(s, s.patterns[0], 'C', CFG)).toBe('จุดซื้อวันนี้ · เบรก 10.50 วอลุ่ม 1.8 เท่า');
  });

  it('SETUP: ใกล้ pivot (ห่าง x%) · ตั้ง alert · ถ้าปิดเหนือ pivot แล้วใช้ประโยคแยก', () => {
    const s = stock('X', [[3, 'SETUP']], { pivot: 36.5, to_pivot: -0.022 });
    expect(actionSentence(s, s.patterns[0], 'C', CFG)).toBe('ใกล้ pivot 36.50 (ห่าง 2.2%) · ตั้ง alert');
    const above = stock('X', [[3, 'SETUP']], { to_pivot: 0.01 });
    expect(actionSentence(above, above.patterns[0], 'C', CFG)).toContain('เหนือ pivot');
  });

  it('WATCH / REST / RUNNING: เฝ้า · ฐาน 10 วัน เกินเกณฑ์ใน config → ฐานยังกว้าง', () => {
    for (const st of ['WATCH', 'REST', 'RUNNING']) {
      const s = stock('X', [[4, st]]);
      expect(actionSentence(s, s.patterns[0], 'A', CFG)).toBe('เฝ้า ยังไม่ใช่จุดซื้อ');
    }
    const wide = stock('X', [[4, 'WATCH']], { tight10: 0.184 });
    expect(actionSentence(wide, wide.patterns[0], 'A', CFG)).toBe('เฝ้า ยังไม่ใช่จุดซื้อ · ฐานยังกว้าง');
    // ไม่มีเกณฑ์ใน config → ไม่ตัดสิน (ไม่ฝังตัวเลขในโค้ด)
    expect(actionSentence(wide, wide.patterns[0], 'A', {})).toBe('เฝ้า ยังไม่ใช่จุดซื้อ');
  });

  it('FIRST_PULLBACK / EXTENDED', () => {
    const s = stock('X', [[5, 'FIRST_PULLBACK']]);
    expect(actionSentence(s, s.patterns[0], 'B', CFG)).toBe('ย่อแรก วอลุ่มแห้ง · จุดเข้าเมื่อกลับเหนือ high ฐานสั้น');
    const e = stock('X', [[5, 'EXTENDED']]);
    expect(actionSentence(e, e.patterns[0], 'B', CFG)).toContain('ไม่ไล่');
  });

  it('PIVOT_RESET ใช้ reset.old_pivot ไม่ใช่ pivot (pivot = high 20 วันของวันนี้)', () => {
    const s = stock('BBL', [[7, 'PIVOT_RESET']], {
      pivot: 204, reset: { type: 'pivot', old_pivot: 193, bo_age: 11, bo_volx: 1.64 },
    });
    const t = actionSentence(s, s.patterns[0], 'C', CFG);
    expect(t).toBe('เบรก 193.00 เมื่อ 11 วันก่อนแล้วโดนตบ · ปิดเหนือ 193.00 พร้อมวอลุ่ม = เข้าใหม่ (ห้ามถัว)');
    expect(t).not.toContain('204');
  });

  it('PIVOT_RECLAIM ใช้ old_pivot · BASE_BREAKOUT ใช้ new_base_high · BASE_RESET', () => {
    const r = stock('X', [[7, 'PIVOT_RECLAIM']], { pivot: 99, reset: { type: 'pivot', old_pivot: 21.4 } });
    expect(actionSentence(r, r.patterns[0], 'C', CFG)).toBe('จุดซื้อวันนี้ · กลับเหนือ 21.40 วอลุ่ม 1.8 เท่า');
    const b = stock('X', [[7, 'BASE_BREAKOUT']], { reset: { type: 'base', new_base_high: 14.2 } });
    expect(actionSentence(b, b.patterns[0], 'A', CFG)).toBe('จุดซื้อวันนี้ · เบรก high ฐานใหม่ 14.20 วอลุ่ม 1.8 เท่า · ไม้ pilot เท่านั้น');
    const br = stock('X', [[7, 'BASE_RESET']], { reset: { type: 'base', new_base_high: 14.2 } });
    expect(actionSentence(br, br.patterns[0], 'A', CFG)).toBe('ฐานเดิมพัง · รอเบรก high ฐานใหม่ 14.20');
    const br2 = stock('X', [[7, 'BASE_RESET']]);
    expect(actionSentence(br2, br2.patterns[0], 'A', CFG)).toBe('ฐานเดิมพัง · รอเบรก high ฐานใหม่');
  });
});

describe('sortStocks', () => {
  const rows = [
    stock('RST', [[7, 'PIVOT_RESET']], { rs_rating: 99 }),
    stock('WAT', [[4, 'WATCH']], { rs_rating: 97 }),
    stock('SU2', [[1, 'SETUP']], { rs_rating: 70 }),
    stock('SU1', [[1, 'SETUP']], { rs_rating: 92 }),
    stock('TRG', [[3, 'BREAKOUT']], { rs_rating: 60 }),
    stock('NUL', [[1, 'SETUP']], { rs_rating: null }),
  ];
  it('trigger → setup → watch → reset · ภายในกลุ่ม RS มาก→น้อย (null ท้าย)', () => {
    expect(sortStocks(rows).map(s => s.ticker)).toEqual(['TRG', 'SU1', 'SU2', 'NUL', 'WAT', 'RST']);
  });
  it('หุ้นหลายแบบใช้กลุ่มที่ดีที่สุด · เมื่อกรองรูปแบบใช้กลุ่มของรูปแบบนั้น', () => {
    const multi = [stock('M', [[1, 'SETUP'], [4, 'WATCH']], { rs_rating: 50 }), stock('W', [[4, 'WATCH']], { rs_rating: 99 })];
    expect(sortStocks(multi).map(s => s.ticker)).toEqual(['M', 'W']);
    expect(sortStocks(multi, 4).map(s => s.ticker)).toEqual(['W', 'M']);
  });
  it('filterStocks / patternCounts', () => {
    expect(filterStocks(rows, 1).map(s => s.ticker).sort()).toEqual(['NUL', 'SU1', 'SU2']);
    expect(filterStocks(rows, null)).toHaveLength(6);
    const c = patternCounts([...rows, stock('B', [[7, 'BASE_RESET']])]);
    expect(c[1]).toMatchObject({ total: 3, groups: { setup: 3, trigger: 0 } });
    expect(c[7]).toMatchObject({ total: 2, pivot: 1, base: 1, groups: { reset: 2 } });
    expect(statusGroup('PIVOT_RECLAIM')).toBe('trigger');
  });
});

describe('ช่วงดัชนี', () => {
  it('phaseKey + ข้อความช่วง B มีคำเตือน FTD', () => {
    expect(phaseKey(phase('A'))).toBe('A');
    expect(phaseKey(null)).toBe('neutral');
    expect(phaseNotes('B')).toEqual([PHASE_NOTE, PHASE_B_NOTE]);
    expect(phaseNotes('A')).toEqual([PHASE_NOTE]);
    expect(PHASE_B_NOTE).toContain('ใช้ไม้เล็ก');
  });
  it('phaseCondition ดึงเลขจาก config', () => {
    expect(phaseCondition('A', CFG)).toBe('SET ลงจาก high เกินเกณฑ์ปรับฐาน 8% และยังห่าง low ไม่ถึง 4%');
    expect(phaseCondition('A', { ...CFG, corr_th: 0.1 })).toContain('10%');
    expect(phaseCondition('B', CFG)).toContain('3%');
    expect(phaseCondition('C', CFG)).toContain('10%');
  });
  it('patternAvailability: แต่ละแบบรอช่วงไหน', () => {
    const series: Rs7SeriesRow[] = Array.from({ length: 70 }, (_, i) => ({
      date: `d${i}`, set_close: 100 - i * 0.2, phase: 'A', n1: 0, n2: 0, n3: 0, n_sectors_123: 0, n_all: 0,
    }));
    const a = phase('A');
    expect(patternAvailability(1, a, series, CFG).available).toBe(true);
    expect(patternAvailability(2, a, series, CFG)).toEqual({ available: false, wait: 'รอช่วง B' });
    expect(patternAvailability(3, a, series, CFG)).toEqual({ available: false, wait: 'รอช่วง C' });
    expect(patternAvailability(4, a, series, CFG).available).toBe(true); // ดัชนี < SMA50 และ 63 วัน −12%
    expect(patternAvailability(5, a, series, CFG)).toEqual({ available: false, wait: 'รอ ≤ 40 วันหลัง low' }); // bsl = 1
    expect(patternAvailability(6, a, series, CFG)).toEqual({ available: false, wait: 'รอเด้ง ≥ 8%' });
    expect(patternAvailability(7, a, series, CFG).available).toBe(true);
    const c = phase('C', { idx_above_sma50: true, above_low: 0.3, bars_since_low: 60 });
    expect(patternAvailability(3, c, series, CFG).available).toBe(true);
    expect(patternAvailability(4, c, series, CFG).available).toBe(false);
    expect(patternAvailability(6, c, series, CFG).available).toBe(true);
    const b = phase('B', { bars_since_low: 12, above_low: 0.05 });
    expect(patternAvailability(5, b, series, CFG).available).toBe(true);
  });
});

describe('parseRs7 / fallback', () => {
  it('ไม่ใช่ไฟล์ rs7 → null (หน้าขึ้นข้อความรอข้อมูล)', () => {
    expect(parseRs7(null)).toBeNull();
    expect(parseRs7({})).toBeNull();
    expect(parseRs7([])).toBeNull();
    expect(parseRs7({ stocks: [] })).toBeNull(); // ไม่มี config
  });
  it('คำนวณช่วงไม่ได้ (phase ว่าง) → ยังคืนข้อมูล แต่ phase = null + warnings', () => {
    const d = parseRs7({ as_of: null, config: {}, phase: {}, stocks: [], series: [], warnings: ['phase: x'] });
    expect(d).not.toBeNull();
    expect(d!.phase).toBeNull();
    expect(d!.warnings).toEqual(['phase: x']);
  });
  it('แถวเสียรูปถูกทิ้ง ไม่ throw', () => {
    const d = parseRs7({
      as_of: '2026-07-22', config: CFG, phase: { today: 'C', corr_recent: true, idx_above_sma50: true },
      stocks: [
        { ticker: 'OK', patterns: [{ id: 3, key: 'CONFIRMING', status: 'BREAKOUT' }], close: 9.8, rs_rating: 87 },
        { ticker: 'NOPAT', patterns: [] }, 'junk', { patterns: [] },
      ],
      series: [{ date: '2026-07-22', set_close: 1639.34, phase: 'C', n1: 0, n2: 0, n3: 1 }, { date: 'bad' }],
      patterns: { '3': { key: 'CONFIRMING', name: 'Confirming' } },
    });
    expect(d!.stocks.map(s => s.ticker)).toEqual(['OK']);
    expect(d!.stocks[0].rs_rating).toBe(87);
    expect(d!.series).toHaveLength(1);
    expect(d!.patternNames[3]).toBe('Confirming');
  });
});
