// ป้าย Kell "🔥 Leader Ready" (ฟิลด์ Status ของ oliver_kell.json) — เกณฑ์เดียวของทุกจุดที่แสดง
// ขึ้นป้ายเมื่อ: ผ่าน Kell ครบ 7/7 และ RS rating (1–99 ตัวเดียวกับที่หน้าเว็บโชว์) ≥ 90 · ไม่มี RS = ไม่ขึ้น
// pure — ไม่แตะ I/O · ห้ามเปลี่ยนเงื่อนไข K1–K7 ที่นี่ (แถวใน oliver_kell.json = ผ่าน 7/7 อยู่แล้ว)

export const KELL_LEADER_MIN_RS = 90;
export const KELL_LEADER_TITLE = `ผ่าน Kell 7/7 และ RS ≥ ${KELL_LEADER_MIN_RS}`;

const LEADER_MARK = 'Leader Ready';

/** ผ่าน 7/7 และ RS ≥ 90 (RS ไม่มี/ไม่ใช่ตัวเลข = ไม่ผ่าน) */
export function isKellLeaderReady(pass7: boolean, rs: number | null | undefined): boolean {
  return pass7 && typeof rs === 'number' && Number.isFinite(rs) && rs >= KELL_LEADER_MIN_RS;
}

export interface KellStatusLabel {
  text: string;
  /** true = ป้าย Leader Ready (ใส่ tooltip เกณฑ์) */
  leader: boolean;
}

/**
 * ข้อความช่อง "Status" ของแถวที่ผ่าน Kell 7/7 (แถวใน oliver_kell.json)
 * - Status เป็น Leader Ready: ผ่านเกณฑ์ RS → โชว์ป้ายตามเดิม · ไม่ผ่าน → "ผ่าน 7/7" (ไม่มีป้าย)
 * - Status อื่น (ชิด EMA / Trend OK ฯลฯ) → ตามเดิมทุกอย่าง
 */
export function kellStatusLabel(status: string, rs: number | null | undefined): KellStatusLabel {
  if (!status.includes(LEADER_MARK)) return { text: status, leader: false };
  return isKellLeaderReady(true, rs) ? { text: status, leader: true } : { text: 'ผ่าน 7/7', leader: false };
}
