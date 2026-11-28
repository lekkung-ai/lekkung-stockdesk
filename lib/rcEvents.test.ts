import { describe, expect, it } from 'vitest';
import { fmtP, fmtPt, fmtRate, lukPullback, parseRcEvents, rs7Summary, sourceText, tone, type HorizonStat } from './rcEvents';

const hs = (avg: number | null, n = 40, extra: Partial<HorizonStat> = {}): HorizonStat => ({
  n, pending: 0, small_sample: n < 30, avg, median: avg, win_pct: 55, set_avg: 0.5, excess_avg: avg == null ? null : avg - 0.5, ...extra,
});
const grp = (pattern: number, d20: number | null, n = 40) => ({
  pattern, name: `p${pattern}`, n_events: n, d5: hs(0), d10: hs(0), d20: hs(d20, n), mfe_avg: 5, mae_avg: -3, small_sample: n < 30,
});
const RAW = {
  generated_at: '2026-11-28T18:30:00+07:00', as_of: '2026-11-28', small_sample_n: 30,
  definitions: { rs7_buy: 'นิยาม', common: 'ทั่วไป', junk: 5 },
  sources: { rs7: { backfill: { from: '2024-09-10', to: '2026-11-27', days: 540 }, live: { from: '2026-11-28', to: '2026-11-28', days: 1 } } },
  rs7: {
    buy: { all: grp(0, 1.5, 231), by_pattern: [grp(1, -3.5, 9), grp(2, -2.8, 38), grp(3, 5.5, 41), grp(6, 2.6, 54)], by_phase: [] },
    watch: { all: { n_entries: 10, converted_pending: 1, converted_pct: 30, converted_n: 9, d20: hs(0.5, 9), small_sample: true }, by_status: [], by_pattern: [] },
    recent: [{ date: '2026-11-28', ticker: 'PRM', pattern: 3, status: 'BREAKOUT', phase: 'C', entry: 9.8, r5: null, r10: null, r20: null, source: 'live' }],
  },
  luk: {
    long: { all: { n_events: 2, setup: 'ALL' }, by_setup: [{ setup: 'EPISODIC_PIVOT' }, { setup: 'LONG_PULLBACK', trigger_pct: 35 }], by_regime: [] },
    weak: { by_setup: [{ setup: 'SHORT_WEAK_BOUNCE' }] }, recent: [],
  },
  warnings: ['w1', 3],
};

describe('parseRcEvents / fallback', () => {
  it('ไม่ใช่ไฟล์นี้ → null', () => {
    expect(parseRcEvents(null)).toBeNull();
    expect(parseRcEvents({})).toBeNull();
    expect(parseRcEvents({ generated_at: 'x', rs7: {} })).toBeNull();
    expect(parseRcEvents([])).toBeNull();
  });
  it('อ่านส่วนต่างๆ · ทิ้งค่าแปลก', () => {
    const d = parseRcEvents(RAW)!;
    expect(d.asOf).toBe('2026-11-28');
    expect(d.definitions).toEqual({ rs7_buy: 'นิยาม', common: 'ทั่วไป' });
    expect(d.warnings).toEqual(['w1']);
    expect(d.rs7.buy!.by_pattern).toHaveLength(4);
    expect(d.rs7.recent[0].ticker).toBe('PRM');
  });
  it('คำนวณพัง (rs7 / luk ว่าง) → ส่วนนั้น null แต่ไฟล์ยังอ่านได้', () => {
    const d = parseRcEvents({ ...RAW, rs7: {}, luk: {} })!;
    expect(d.rs7.buy).toBeNull();
    expect(d.luk.long).toBeNull();
  });
});

describe('สรุปการ์ด', () => {
  it('ดีสุดเลือกจากกลุ่มที่ไม่ใช่ตัวอย่างน้อย · แย่สุดจากทุกกลุ่ม', () => {
    const s = rs7Summary(parseRcEvents(RAW)!)!;
    expect(s.n).toBe(231);
    expect(s.best!.pattern).toBe(3);
    expect(s.worst!.pattern).toBe(1);                 // n=9 ตัวอย่างน้อย แต่ยังโชว์เป็นแย่สุดพร้อมป้าย
  });
  it('ไม่มีข้อมูลฝั่งซื้อ → null · LONG_PULLBACK หาได้ไม่ขึ้นกับลำดับ', () => {
    expect(rs7Summary(parseRcEvents({ ...RAW, rs7: {} })!)).toBeNull();
    expect(lukPullback(parseRcEvents(RAW)!)!.trigger_pct).toBe(35);
  });
  it('sourceText บอกทั้ง backfill และ live', () => {
    const t = sourceText(parseRcEvents(RAW)!.sources.rs7, x => x);
    expect(t).toBe('ย้อนหลัง (backfill) 2024-09-10 – 2026-11-27 (540 วัน) · บันทึกจริงรายวัน 2026-11-28 – 2026-11-28 (1 วัน)');
    expect(sourceText(undefined, x => x)).toBe('ยังไม่มีข้อมูล');
    expect(sourceText({ backfill: null, live: null }, x => x)).toContain('ย้อนหลัง (backfill) ยังไม่มี');
  });
});

describe('format', () => {
  it('ค่าเป็น % อยู่แล้ว', () => {
    expect(fmtP(1.5)).toBe('+1.5%');
    expect(fmtP(-3.45)).toBe('−3.5%');      // ปัด 1 ตำแหน่ง (เครื่องหมายลบแบบยาว)
    expect(fmtP(0.01)).toBe('0.0%');
    expect(fmtP(null)).toBe('—');
    expect(fmtPt(1.19)).toBe('+1.2');
    expect(fmtRate(57.1)).toBe('57%');
    expect(tone(-1)).toBe('neg');
    expect(tone(null)).toBe('flat');
  });
});
