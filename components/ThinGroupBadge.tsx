import { isThinGroup, MIN_GROUP_N } from '@/lib/sectorFlow';

// "หุ้นน้อย" tag for Sector Flow groups with fewer than MIN_GROUP_N stocks (display only — same numbers, same order)
export default function ThinGroupBadge({ n }: { n: number }) {
  if (!isThinGroup(n)) return null;
  return (
    <span
      className="ml-1.5 inline-block align-middle px-1 rounded border border-white/15 text-[10px] leading-[14px] font-semibold text-white/55 whitespace-nowrap"
      title={`มีหุ้นเพียง ${n} ตัว (น้อยกว่า ${MIN_GROUP_N}) — ตัวเลขของกลุ่มขึ้นกับหุ้นตัวเดียวได้ง่าย`}
      data-testid="thin-group"
    >
      หุ้นน้อย
    </span>
  );
}
