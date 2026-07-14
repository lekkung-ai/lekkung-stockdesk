import { describe, it, expect } from 'vitest';
import { parseF45Detail } from './parseF45';

// Fixtures are the real <pre> body settrade.com returns for each ticker's F45
// detail page (fetched via browser devtools 2026-07-14), wrapped in the same
// minimal <pre> tag parseF45Detail looks for. Not synthetic - each one is
// what surfaced the bug it's paired with.

function wrap(pre: string): string {
  return `<html><body><pre>${pre}</pre></body></html>`;
}

// PTT Q1/2569, both periods profitable, comma-formatted figures.
const PTT_NORMAL_PROFIT = `
                     แบบสรุปผลการดำเนินงาน (F45)                      \t\t\t
                      บริษัท ปตท. จำกัด (มหาชน)

                                    (หน่วย : พันบาท)
งบการเงิน                              \t\t\t
                                   ไตรมาสที่ 1
                                      สอบทาน
สิ้นสุดวันที่\t\t\t             31 มีนาคม
ปี       \t\t\t    2569         2568
กำไร (ขาดทุน) \t\t\t25,738,299   23,315,489
ส่วนที่เป็นของผู้ถือ
หุ้นของบริษัทใหญ่ *
กำไร (ขาดทุน) \t\t\t      0.91         0.81
สุทธิ
ต่อหุ้น (บาท)                            \t\t\t

ประเภทรายงานของผู้สอบบัญชีในงบการเงิน     \t\t\t
      ไม่มีเงื่อนไข

*สำหรับงบการเงินรวม                    \t\t\t
`;

// DEXON Q1/2569, both periods a loss - SET writes losses in accounting
// parens "(34,882)", not "-34,882". EPS is also negative/parenthesized here,
// so this fixture doubles as the "negative EPS" case.
const DEXON_LOSS_PARENS = `
                     แบบสรุปผลการดำเนินงาน (F45)                      \t\t\t
               บริษัท เด็กซ์ซอน เทคโนโลยี จำกัด (มหาชน)

                                    (หน่วย : พันบาท)
งบการเงิน                              \t\t\t
                                   ไตรมาสที่ 1
                                      สอบทาน
สิ้นสุดวันที่\t\t\t             31 มีนาคม
ปี       \t\t\t    2569         2568
กำไร (ขาดทุน) \t\t\t  (34,882)     (35,980)
ส่วนที่เป็นของผู้ถือ
หุ้นของบริษัทใหญ่ *
กำไร (ขาดทุน) \t\t\t   (0.073)      (0.076)
สุทธิ
ต่อหุ้น (บาท)                            \t\t\t

ประเภทรายงานของผู้สอบบัญชีในงบการเงิน     \t\t\t
      ไม่มีเงื่อนไขและมีข้อสังเกต/เรื่องอื่น

*สำหรับงบการเงินรวม                    \t\t\t
`;

// NRF's corrected Q1/2569 F45 - SET tagged the revised EPS inline with no
// separating whitespace: "(0.04)(แก้ไข)       (0.14)". Also exercises a
// distinct auditor-opinion wording (disclaimer, not unqualified).
const NRF_CORRECTION = `
                     แบบสรุปผลการดำเนินงาน (F45)                      \t\t\t
           บริษัท เอ็นอาร์ อินสแตนท์ โปรดิวซ์ จำกัด (มหาชน)

                                    (หน่วย : พันบาท)
งบการเงิน                              \t\t\t
                                   ไตรมาสที่ 1
                                      สอบทาน
สิ้นสุดวันที่\t\t\t             31 มีนาคม
ปี       \t\t\t    2569         2568
กำไร (ขาดทุน) \t\t\t  (42,833)    (194,858)
ส่วนที่เป็นของผู้ถือ
หุ้นของบริษัทใหญ่ *
กำไร (ขาดทุน) \t\t\t    (0.04)(แก้ไข)       (0.14)
สุทธิ
ต่อหุ้น (บาท)                            \t\t\t

ประเภทรายงานของผู้สอบบัญชีในงบการเงิน     \t\t\t
      ไม่แสดงความเชื่อมั่น
เนื่องจาก                               \t\t\t
      ถูกจำกัดขอบเขตโดยสถานการณ์

*สำหรับงบการเงินรวม                    \t\t\t
`;

// SAM's annual F45 - the body labels the period "12 เดือน", not "ประจำปี"
// (which PTT/BTS/etc.'s template used), so this also exercises isAnnual's
// second branch. Both figures in the net-profit row are tagged "(แก้ไข)"
// this time (not just one, like NRF) - a good check that the strip is a
// global replace, not a single-shot one.
const SAM_ANNUAL_12_MONTHS = `
                     แบบสรุปผลการดำเนินงาน (F45)                      \t\t\t
              บริษัท สามชัย สตีล อินดัสทรี จำกัด (มหาชน)

                                     (หน่วย : พันบาท)
งบการเงิน                              \t\t\t
                                     12 เดือน
                                     ตรวจสอบ
สิ้นสุดวันที่\t\t\t     31 ธันวาคม
ปี       \t\t\t    2568         2567
กำไร (ขาดทุน) \t\t\t    (262,112)(แก้ไข)     (10,696)(แก้ไข)
ส่วนที่เป็นของผู้ถือ
หุ้นของบริษัทใหญ่ *
กำไร (ขาดทุน) \t\t\t     (0.2508)     (0.0102)
สุทธิ
ต่อหุ้น (บาท)                            \t\t\t

ประเภทรายงานของผู้สอบบัญชีในงบการเงิน     \t\t\t
      มีเงื่อนไขและมีข้อสังเกต/เรื่องอื่น

*สำหรับงบการเงินรวม                    \t\t\t
`;

describe('parseF45Detail', () => {
  it('parses normal profit with comma-formatted figures (PTT)', () => {
    const r = parseF45Detail(wrap(PTT_NORMAL_PROFIT));
    expect(r.quarter).toBe('ไตรมาส 1/2569');
    expect(r.netProfit).toBe(25738299000); // scaled x1000 (พันบาท)
    expect(r.netProfitPrior).toBe(23315489000);
    expect(r.eps).toBeCloseTo(0.91);
    expect(r.epsPrior).toBeCloseTo(0.81);
    expect(r.auditorOpinion).toBe('ไม่มีเงื่อนไข');
  });

  it('parses parenthesized losses as negative numbers (DEXON)', () => {
    const r = parseF45Detail(wrap(DEXON_LOSS_PARENS));
    expect(r.netProfit).toBe(-34882000);
    expect(r.netProfitPrior).toBe(-35980000);
  });

  it('parses negative EPS correctly (DEXON)', () => {
    const r = parseF45Detail(wrap(DEXON_LOSS_PARENS));
    expect(r.eps).toBeCloseTo(-0.073);
    expect(r.epsPrior).toBeCloseTo(-0.076);
  });

  it('parses a correction filing whose revised figure is tagged inline (NRF)', () => {
    const r = parseF45Detail(wrap(NRF_CORRECTION));
    expect(r.netProfit).toBe(-42833000);
    expect(r.netProfitPrior).toBe(-194858000);
    // Before the (แก้ไข) strip, this pair failed to match at all and both
    // came back undefined - this is the regression this fixture guards.
    expect(r.eps).toBeCloseTo(-0.04);
    expect(r.epsPrior).toBeCloseTo(-0.14);
    expect(r.auditorOpinion).toBe('ไม่แสดงความเชื่อมั่น');
  });

  it('parses an annual filing labeled "12 เดือน" with both figures tagged as corrections (SAM)', () => {
    const r = parseF45Detail(wrap(SAM_ANNUAL_12_MONTHS));
    expect(r.quarter).toBe('ประจำปี 2568');
    expect(r.netProfit).toBe(-262112000);
    expect(r.netProfitPrior).toBe(-10696000);
    expect(r.eps).toBeCloseTo(-0.2508);
    expect(r.epsPrior).toBeCloseTo(-0.0102);
  });
});
