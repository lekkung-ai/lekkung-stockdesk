// ตัวช่วยแสดงผลแถว checklist (SEPA 8 ข้อ / Kell 7 ข้อ) บนหน้า /stock/[ticker]
// pure — เปลี่ยน "การแสดงผล" เท่านั้น: ผ่าน/ไม่ผ่านของแต่ละข้อยังเชื่อ T1–T8 / K1–K7 จากไฟล์เสมอ
// เครื่องหมายเทียบ (> < =) คำนวณจากตัวเลขที่แสดงจริง ไม่ใช่เขียนตายตัว

/** price = ราคาปัจจุบัน (สีฟ้า) · val = ค่าที่เอาไปเทียบ · op = เครื่องหมายที่ผ่าน · opfail = เครื่องหมายที่ไม่ผ่าน (แดง)
 *  fail = ค่า % ที่ไม่ผ่าน (แดง) · note = ข้อความกำกับสีจาง (เช่น "(1 เดือนก่อน)", "(เกณฑ์ ≤ 25%)") */
export type DetailKind = 'price' | 'val' | 'op' | 'opfail' | 'fail' | 'note';

export interface DetailPart {
  text: string;
  kind: DetailKind;
}

/** ขึ้นบรรทัดใหม่ในช่องรายละเอียด (K6) */
export const NEWLINE_PART: DetailPart = { text: '\n', kind: 'val' };

export const f2 = (v: number) => v.toFixed(2);
const MINUS = '−'; // U+2212

/** % มีเครื่องหมายหน้าตัวเลข ทศนิยม 1 ตำแหน่ง (ลบใช้ − เหมือนที่อื่นในหน้า) */
export const signedPct1 = (v: number) => `${v > 0 ? '+' : v < 0 ? MINUS : ''}${Math.abs(v).toFixed(1)}%`;

/** เทียบ a กับ b ที่ทศนิยม 2 ตำแหน่ง (ตัวเลขเดียวกับที่ผู้ใช้เห็น) → '>' | '<' | '=' */
export function cmpOp(a: number, b: number): '>' | '<' | '=' {
  const x = Number(f2(a));
  const y = Number(f2(b));
  return x > y ? '>' : x < y ? '<' : '=';
}

/**
 * "{ค่านำ} {op1} {v1} / {op2} {v2} (คำกำกับ)" — ทุกเครื่องหมายคาดหวัง ">"
 * แถวที่ผ่านไม่ระบายแดงเลย (ผ่านตามไฟล์ แต่ตัวเลขปัดแล้วเท่ากัน → "=" สีปกติ)
 * แถวที่ตก: เฉพาะเครื่องหมายที่ไม่เป็น ">" เป็นสีแดง (ข้างที่ยังจริงอยู่คงสีปกติ)
 */
export function compareParts(
  lead: { text: string; kind: 'price' | 'val'; value: number },
  rhs: number[],
  rowPass: boolean,
  note?: string,
): DetailPart[] {
  const parts: DetailPart[] = [{ text: lead.text, kind: lead.kind }];
  rhs.forEach((v, i) => {
    parts.push({ text: i === 0 ? ' ' : ' / ', kind: 'val' });
    const op = cmpOp(lead.value, v);
    parts.push({ text: op, kind: !rowPass && op !== '>' ? 'opfail' : 'op' });
    parts.push({ text: ` ${f2(v)}`, kind: 'val' });
  });
  if (note) parts.push({ text: ` (${note})`, kind: 'note' });
  return parts;
}

/** ข้อความล้วนของรายละเอียด */
export const partsText = (parts: DetailPart[]) => parts.map(p => p.text).join('');

/** ตัวช่วยสร้างค่านำของ compareParts */
export const priceLead = (v: number) => ({ text: f2(v), kind: 'price' as const, value: v });
export const valLead = (v: number) => ({ text: f2(v), kind: 'val' as const, value: v });

export const isNewline = (p: DetailPart) => p.text.length === 1 && p.text.charCodeAt(0) === 10;
