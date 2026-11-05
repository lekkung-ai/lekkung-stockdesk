import { describe, it, expect } from 'vitest';
import { fixThaiPua, fixThaiText, fixThaiIpa, fixSaraAm, reasonPreview } from './earningsMetrics';

// Twin of scripts/test_thai_pua.py. Code points are built with fromCharCode so
// the invisible glyphs are explicit in the source.
const P = (cp: number) => String.fromCharCode(cp);
const AM = P(0x0e33);
const NIKHAHIT_AA = P(0x0e4d) + P(0x0e32);

describe('fixThaiPua / fixThaiText', () => {
  it('TRUE Q3/2569 real case', () => {
    const raw = `โดยรายได${P(0xf70b)}จากการให${P(0xf70b)}บริการเป${P(0xf712)}น 41.6 พันล${P(0xf70b)}านบาท ` +
      `ข${P(0xf70b)}ามโครงข${P(0xf70a)}าย ป${P(0xf710)}จจัย โทรทัศน${P(0xf70e)} เมื่อเทียบกับป${P(0xf702)}ก${P(0xf70a)}อน`;
    expect(fixThaiText(raw)).toBe('โดยรายได้จากการให้บริการเป็น 41.6 พันล้านบาท ข้ามโครงข่าย ปัจจัย โทรทัศน์ เมื่อเทียบกับปีก่อน');
  });

  it('every tone-mark variant (low / left / low-left)', () => {
    const cases: [number, number][] = [
      [0xf705, 0x0e48], [0xf70a, 0x0e48], [0xf713, 0x0e48],
      [0xf706, 0x0e49], [0xf70b, 0x0e49], [0xf714, 0x0e49],
      [0xf707, 0x0e4a], [0xf70c, 0x0e4a], [0xf715, 0x0e4a],
      [0xf708, 0x0e4b], [0xf70d, 0x0e4b], [0xf716, 0x0e4b],
      [0xf709, 0x0e4c], [0xf70e, 0x0e4c], [0xf717, 0x0e4c],
    ];
    for (const [pua, real] of cases) expect(fixThaiPua('ก' + P(pua))).toBe('ก' + P(real));
  });

  it('mai han-akat, upper/lower vowels, ฐ ญ', () => {
    expect(fixThaiPua(`ป${P(0xf710)}จจุบัน`)).toBe('ปัจจุบัน');
    expect(fixThaiPua(`ม${P(0xf701)}ถุนายน`)).toBe('มิถุนายน');
    expect(fixThaiPua(`ท${P(0xf702)}่`)).toBe('ที่');
    expect(fixThaiPua(`ข${P(0xf703)}้น`)).toBe('ขึ้น');
    expect(fixThaiPua(`ม${P(0xf704)}อ`)).toBe('มือ');
    expect(fixThaiPua(`ก${P(0xf712)}`)).toBe('ก็');
    expect(fixThaiPua(`ค${P(0xf718)}ณ`)).toBe('คุณ');
    expect(fixThaiPua(`ส${P(0xf719)}ง`)).toBe('สูง');
    expect(fixThaiPua(`${P(0xf700)}าน`)).toBe('ฐาน');
    expect(fixThaiPua(`${P(0xf70f)}ี่ปุ่น`)).toBe('ญี่ปุ่น');
  });

  it('U+FFFD and non-Thai PUA are left alone', () => {
    const lost = `กำไร${P(0xfffd)}สุทธิ`;
    expect(fixThaiText(lost)).toBe(lost);
    const bullet = `เป็นผลมาจาก ${P(0xf0d8)}`;
    expect(fixThaiText(bullet)).toBe(bullet);
  });

  it('sara-am fixes still work, together with PUA', () => {
    expect(fixSaraAm(`รวมจ ${AM}นวน ก ${AM}ไร`)).toBe(`รวมจ${AM}นวน ก${AM}ไร`);
    expect(fixThaiText(`นัยส${NIKHAHIT_AA}คัญ ต${P(0xf70a)}อ`)).toBe(`นัยส${AM}คัญ ต่อ`);
    expect(fixThaiText(`ก ${AM}ไรเพิ่มข${P(0xf703)}${P(0xf70b)}น`)).toBe(`ก${AM}ไรเพิ่มขึ้น`);
  });

  it('the one-line preview is repaired too', () => {
    expect(reasonPreview(`รายได${P(0xf70b)}เพิ่มข${P(0xf703)}${P(0xf70b)}น`)).toBe('รายได้เพิ่มขึ้น');
  });

  it('correct text unchanged', () => {
    const ok = 'กำไรสุทธิ 57.63 ล้านบาท เพิ่มขึ้นร้อยละ 20.91';
    expect(fixThaiText(ok)).toBe(ok);
  });
});

describe('fixThaiIpa (U+0269 -> ิ, U+026D -> ึ only after a Thai character)', () => {
  const I = P(0x0269);
  const L = P(0x026d);
  it('TRUE case', () => {
    expect(fixThaiText(`รายได้จากการให้บร${I}การ โทรทัศน์บอกรับสมาช${I}ก เพิ่มข${L}้น 2.1%`))
      .toBe('รายได้จากการให้บริการ โทรทัศน์บอกรับสมาชิก เพิ่มขึ้น 2.1%');
    expect(fixThaiText(`ให${P(0xf70b)}บร${I}การ เพิ่มข${L}${P(0xf70b)}น`)).toBe('ให้บริการ เพิ่มขึ้น');
  });
  it('English text with ɩ / ɭ is not touched', () => {
    for (const s of [`the ${I} and ${L} letters`, `IPA: [${I}] [${L}]`, `A${I}B${L}`, `${I}${L} at the start`, `ไทย ${I}`]) {
      expect(fixThaiIpa(s)).toBe(s);
      expect(fixThaiText(s)).toBe(s);
    }
  });
});
