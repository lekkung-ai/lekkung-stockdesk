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

function businessDaysBetween(fromISO: string, toISO: string): number {
  let d = new Date(fromISO + 'T00:00:00Z');
  const end = new Date(toISO + 'T00:00:00Z');
  let count = 0;
  while (d < end) {
    d = new Date(d.getTime() + 24 * 60 * 60 * 1000);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

export default function StaleDataBanner({ generatedAt }: { generatedAt: string | null }) {
  if (!generatedAt) return null;
  const dataDate = generatedAt.slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  if (businessDaysBetween(dataDate, today) < 1) return null;

  return (
    <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[12px] px-4 py-2.5 rounded-xl">
      <span className="text-[14px]">⚠</span>
      <span>ข้อมูลล่าสุด {isoToThaiLabel(dataDate)} — pipeline อาจมีปัญหา</span>
    </div>
  );
}
