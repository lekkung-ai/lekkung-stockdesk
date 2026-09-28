// คัดหุ้นจาก sepa.json เข้ากลุ่มตรวจ VCP footprint (G1 → G8) — pure function ไม่แตะ I/O
// หุ้น 1 ตัวอยู่ได้กลุ่มเดียว: กลุ่มก่อนหน้าได้ไปก่อน · ในกลุ่มเรียง RS มาก→น้อย แล้วตัดตามจำนวน

export interface VcpRow {
  Ticker: string;
  RS: number;
  FromHigh: number | null; // %_From_High แปลงจาก "-6.36%" เป็น -6.36
  LowLiquidity: boolean;
  Footprint: string;
  Weeks: number | null;
  T: number | null;
  MaxDepth: number | null;
  FinalDepth: number | null;
  VolRatio: number | null;
  Contracting: boolean | null;
  ToPivot: number | null;
  Pivot: number | null;
}

export interface ReviewGroup {
  id: string;
  name: string;
  question: string;
  rows: VcpRow[];
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

export function parsePct(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const n = parseFloat(v.replace('%', '').trim());
  return Number.isFinite(n) ? n : null;
}

export function toVcpRows(raw: unknown[]): VcpRow[] {
  return raw.flatMap(item => {
    const r = item as Record<string, unknown>;
    if (typeof r.Ticker !== 'string') return [];
    return [{
      Ticker: r.Ticker,
      RS: num(r.RS_Rating) ?? 0,
      FromHigh: parsePct(r['%_From_High']),
      LowLiquidity: r.Low_Liquidity === true,
      Footprint: typeof r.VCP_Footprint === 'string' ? r.VCP_Footprint : '',
      Weeks: num(r.VCP_Weeks),
      T: num(r.VCP_T),
      MaxDepth: num(r.VCP_MaxDepth),
      FinalDepth: num(r.VCP_FinalDepth),
      VolRatio: num(r.VCP_VolRatio),
      Contracting: typeof r.VCP_Contracting === 'boolean' ? r.VCP_Contracting : null,
      ToPivot: num(r.VCP_ToPivot),
      Pivot: num(r.VCP_Pivot),
    }];
  });
}

// null ไม่ผ่านทุกเงื่อนไขที่เป็นตัวเลข
const ge = (v: number | null, x: number) => v != null && v >= x;
const le = (v: number | null, x: number) => v != null && v <= x;
const lt = (v: number | null, x: number) => v != null && v < x;

const tightBase = (r: VcpRow) =>
  r.Contracting === true && ge(r.T, 2) && ge(r.ToPivot, 0) && le(r.ToPivot, 5) && le(r.FinalDepth, 8);

interface GroupSpec {
  id: string;
  name: string;
  question: string;
  // แต่ละ pick = [เงื่อนไข, จำนวน] · G8 มี 2 pick
  picks: [(r: VcpRow) => boolean, number][];
}

const SPECS: GroupSpec[] = [
  {
    id: 'G1', name: 'Textbook พร้อมยิง',
    question: 'กราฟเป็น VCP จริงไหม · จำนวนครั้งที่หดตัว (T) ตรงกับที่ตาเห็นไหม',
    picks: [[r => tightBase(r) && lt(r.VolRatio, 1.0), 5]],
  },
  {
    id: 'G2', name: 'โครงแน่น วอลุ่มยังไม่แห้ง',
    question: 'ถ้าวอลุ่มยังไม่แห้ง ยังนับเป็น VCP ที่ใช้ได้ไหม',
    picks: [[r => tightBase(r) && ge(r.VolRatio, 1.0), 4]],
  },
  {
    id: 'G3', name: 'ย่อลึกรอบเดียว',
    question: 'ยืนยันว่าไม่ใช่ VCP',
    picks: [[r => r.T === 1 && ge(r.FinalDepth, 15), 4]],
  },
  {
    id: 'G4', name: 'ทะลุ pivot ยังใกล้ high',
    question: 'เป็น breakout จริงไหม หรือ pivot อยู่ผิดตำแหน่ง',
    picks: [[r => lt(r.ToPivot, 0) && ge(r.FromHigh, -5), 3]],
  },
  {
    id: 'G5', name: 'pivot หมดอายุ',
    question: 'pivot นี้เป็นฐานเก่าที่หมดความหมายแล้วใช่ไหม',
    picks: [[r => lt(r.ToPivot, -5) && lt(r.FromHigh, -10), 3]],
  },
  {
    id: 'G6', name: 'ฐานยาว',
    question: 'scanner จับขอบฐานถูกไหม',
    picks: [[r => ge(r.Weeks, 17) && r.Contracting === true, 3]],
  },
  {
    id: 'G7', name: 'หดตัวหลายครั้ง',
    question: 'หดตัวจริงหลายครั้ง หรือนับการแกว่งเล็กๆ เป็น T',
    picks: [[r => ge(r.T, 5), 3]],
  },
  {
    id: 'G8', name: 'ไม่มีฐาน',
    question: 'ยืนยันว่าไม่มี VCP จริง',
    picks: [
      [r => r.Footprint === 'no base', 2],
      [r => r.T === 0 && r.Footprint !== '' && r.Footprint !== 'no base', 2],
    ],
  },
];

export function buildReviewGroups(rows: VcpRow[]): ReviewGroup[] {
  const used = new Set<string>();
  return SPECS.map(spec => {
    const picked: VcpRow[] = [];
    for (const [cond, count] of spec.picks) {
      const hits = rows
        .filter(r => !used.has(r.Ticker) && cond(r))
        .sort((a, b) => b.RS - a.RS) // Array.sort เสถียร — RS เท่ากันคงลำดับเดิมในไฟล์
        .slice(0, count);
      hits.forEach(r => used.add(r.Ticker));
      picked.push(...hits);
    }
    return { id: spec.id, name: spec.name, question: spec.question, rows: picked };
  });
}
