import { Suspense } from 'react';
import SectorFlowView from '@/components/SectorFlowView';
import DataUpdatedBadge from '@/components/DataUpdatedBadge';
import rawFlow from '@/data/scans/sector_flow.json';
import { formatThaiDay, type FlowRow } from '@/lib/sectorFlow';

interface SectorFlowFile {
  generated_at?: string;
  as_of?: string;
  subsectors: FlowRow[];
  sectors: FlowRow[];
}

const flow = rawFlow as SectorFlowFile;

export default function SectorFlowPage() {
  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-[#13161e] border border-white/[0.08] rounded-2xl p-5 shadow-sm">
        <div>
          <h1 className="text-[20px] font-bold text-white tracking-tight">Sector Flow</h1>
          <p className="text-[13px] text-white/40 mt-1">
            เงินไหลเข้ากลุ่มไหน · กลุ่มไหนแข็งขึ้น/หมดแรง · ข้อมูลราคาปิดรายวัน ณ วันที่ {formatThaiDay(flow.as_of)} · เฉพาะตลาด SET
          </p>
        </div>
        <DataUpdatedBadge generatedAt={flow.generated_at} />
      </div>

      <div className="bg-[#13161e] border border-white/[0.08] rounded-2xl p-4 text-[12.5px] text-white/60 leading-relaxed space-y-1.5">
        <p>
          <span className="font-bold text-white/85">วิธีอ่าน ×เท่า</span> — สัดส่วนมูลค่าซื้อขายของกลุ่มนี้ในตลาดทั้งหมด เทียบกับสัดส่วนปกติของ 20 วันทำการก่อนหน้า
          ×1.0 = ปกติ · ×2.0 = สัดส่วนเป็น 2 เท่าของปกติ (เทียบกับตลาด ไม่ใช่มูลค่าดิบ) · &quot;5 วัน&quot; ใช้ค่าเฉลี่ย 5 วันล่าสุดเทียบกับ 20 วันก่อนหน้านั้น
        </p>
        <p>
          <span className="font-bold text-white/85">สถานะความแข็ง</span> — ดูผลตอบแทนส่วนเกินเทียบ SET (ถ่วง market cap):
          <span className="text-emerald-400 font-bold"> แข็งต่อเนื่อง</span> = 3 เดือนและ 1 เดือนชนะ SET ·
          <span className="text-sky-400 font-bold"> เพิ่งเริ่มแข็ง</span> = 3 เดือนยังตามหลัง แต่ 1 เดือนชนะแล้ว ·
          <span className="text-orange-400 font-bold"> เริ่มหมดแรง</span> = 3 เดือนชนะ แต่ 1 เดือนตามหลัง ·
          <span className="text-rose-400 font-bold"> อ่อนต่อเนื่อง</span> = ทั้งสองช่วงตามหลัง SET
        </p>
      </div>

      <Suspense fallback={<div className="text-white/40 text-sm py-4">กำลังโหลดข้อมูล...</div>}>
        <SectorFlowView subsectors={flow.subsectors} sectors={flow.sectors} />
      </Suspense>
    </div>
  );
}
