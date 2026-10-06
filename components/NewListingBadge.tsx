import rawCombined from '@/data/scans/combined.json';
import { buildNewListingMap, newListingLabel, type NewListingFields } from '@/lib/newListing';

const _c = rawCombined as unknown as NewListingFields[] | { data?: NewListingFields[] };
const NEW_LISTINGS = buildNewListingMap(Array.isArray(_c) ? _c : _c.data);

/** ป้าย "IPO · N วัน" ข้างชื่อหุ้นที่มีข้อมูลราคาไม่ถึง 200 วัน (ยังไม่มี RS / stage) · ไม่ใช่ → ไม่แสดงอะไร */
export default function NewListingBadge({ ticker, className = '' }: { ticker: string; className?: string }) {
  const days = NEW_LISTINGS.get(ticker);
  if (days == null) return null;
  return (
    <span
      className={`inline-flex items-center px-1.5 py-px rounded border border-white/20 bg-white/[0.07] text-[10px] font-semibold text-white/70 whitespace-nowrap align-middle ${className}`}
      title={`หุ้นจดทะเบียนใหม่ — มีข้อมูลราคา ${days} วันทำการ · ตัวชี้วัดที่ต้องใช้ข้อมูลยาวกว่านี้ (เช่น EMA200 / 52W / RS) จะเป็น —`}
      data-testid="new-listing-badge"
    >
      {newListingLabel(days)}
    </span>
  );
}
