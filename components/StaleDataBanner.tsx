'use client';

// Yellow warning shown on every scan page when its own data is more than 1
// business day old - so a frozen pipeline (the 2026-07-14/15 incident: no
// new scan data for 2 days with nothing on the page hinting at it) is
// visible the moment the page loads instead of only being noticed by
// someone comparing dates by hand.

const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

function isoToThaiLabel(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${parseInt(d)} ${MONTHS[parseInt(m) - 1]} ${parseInt(y) + 543}`;
}

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const FRESH_HOUR_ICT = 17; // pipeline's evening run is ~17:30 ICT - data dated
                           // today and generated at/after 17:00 Bangkok time
                           // covers today, no matter what weekday "today" is.

// The most recent instant (as a UTC ms timestamp) by which fresh data should
// exist - "17:00 Bangkok time on the latest business day that has already
// reached 17:00". Computed entirely in Bangkok wall-clock terms (UTC+7, no
// DST) so this gives the same answer regardless of the viewer's own browser
// timezone - a Friday-evening/weekend generate correctly counts as covering
// Friday, and Monday morning (before 17:00) still expects Friday's data,
// only Monday evening onward expects a newer run.
function freshnessCutoffMs(nowUtcMs: number): number {
  const bkkNow = new Date(nowUtcMs + BANGKOK_OFFSET_MS);
  const weekday = bkkNow.getUTCDay(); // 0=Sun .. 6=Sat, in Bangkok terms
  const todayAt17Bkk = Date.UTC(bkkNow.getUTCFullYear(), bkkNow.getUTCMonth(), bkkNow.getUTCDate(), FRESH_HOUR_ICT, 0, 0) - BANGKOK_OFFSET_MS;

  let daysBack: number;
  if (weekday === 0) daysBack = 2; // Sunday -> Friday
  else if (weekday === 6) daysBack = 1; // Saturday -> Friday
  else if (nowUtcMs >= todayAt17Bkk) daysBack = 0; // Mon-Fri, already past today's 17:00 -> today's own cutoff
  else daysBack = weekday === 1 ? 3 : 1; // Mon-Fri before 17:00 -> previous business day (Monday steps back to Friday)

  return todayAt17Bkk - daysBack * 24 * 60 * 60 * 1000;
}

export default function StaleDataBanner({ generatedAt, missing = false }: { generatedAt: string | null; missing?: boolean }) {
  // missing = scan ถูก drop-guard ข้ามเขียนรอบนี้ (scanner ล่ม) → เตือนแรงสุด
  // ต้องเช็คก่อน generatedAt เพราะตอน missing ค่า generatedAt จะเป็น null อยู่แล้ว
  // (ไม่งั้นจะ return null เงียบ = บั๊กเดิมที่ guard สร้างขึ้น)
  if (missing) {
    return (
      <div className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/40 text-rose-400 text-label px-4 py-2.5 rounded-xl">
        <span className="text-[14px]">⚠</span>
        <span>ข้อมูลไม่อัปเดตรอบล่าสุด — scanner อาจล่ม กำลังแสดงข้อมูลเดิม</span>
      </div>
    );
  }
  if (!generatedAt) return null;
  const generatedMs = new Date(generatedAt).getTime();
  if (Number.isNaN(generatedMs)) return null;
  if (generatedMs >= freshnessCutoffMs(Date.now())) return null;

  return (
    <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-label px-4 py-2.5 rounded-xl">
      <span className="text-[14px]">⚠</span>
      <span>ข้อมูลล่าสุด {isoToThaiLabel(generatedAt.slice(0, 10))} — pipeline อาจมีปัญหา</span>
    </div>
  );
}
