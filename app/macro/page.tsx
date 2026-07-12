import Link from 'next/link';
import { ChangeBadge } from '@/components/ChangeBadge';
import TrendSparkline from '@/components/TrendSparkline';
import { formatShortThaiDate } from '@/lib/utils';
import {
  macroCommoditiesByZone,
  macroGeneratedAt,
  macroMethodology,
  macroPalmOilNote,
  type MacroCommodity,
  type MacroZone,
} from '@/lib/macroData';

const ZONE_COLORS: Record<MacroZone, string> = {
  energy: '#EF9F27',
  agri: '#5D9E4A',
  financial: '#378ADD',
};

function formatPrice(close: number): string {
  return close.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function CommodityCard({ commodity }: { commodity: MacroCommodity }) {
  const sparkData = commodity.series.map(s => s.close);

  return (
    <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-white truncate">{commodity.name_th}</p>
          <p className="text-[10.5px] text-white/30 truncate">
            {commodity.name_en} · {commodity.symbol}
          </p>
        </div>
        <TrendSparkline data={sparkData} width={64} height={22} />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[19px] font-bold text-white tabular-nums leading-none">
            {formatPrice(commodity.latest.close)}
          </p>
          <p className="text-[10px] text-white/25 mt-1">{commodity.unit}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="text-center">
            <ChangeBadge value={commodity.pct_1d} />
            <p className="text-[9px] text-white/20 mt-1">1D</p>
          </div>
          <div className="text-center">
            <ChangeBadge value={commodity.pct_1m} />
            <p className="text-[9px] text-white/20 mt-1">1M</p>
          </div>
        </div>
      </div>

      <p className="text-[9.5px] text-white/20">Yahoo Finance · ปิด {commodity.latest.date}</p>

      {commodity.tickers.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-2 border-t border-white/[0.06]">
          {commodity.tickers.map(t => (
            <Link
              key={t}
              href={`/stock/${t}`}
              className="text-[10.5px] font-semibold px-2 py-1 rounded-lg bg-white/[0.04] text-white/60 hover:bg-white/[0.09] hover:text-white transition-colors"
            >
              {t}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function BankHealthPendingCard() {
  return (
    <div className="border border-dashed border-white/[0.12] rounded-xl p-4 flex flex-col items-center justify-center text-center gap-1.5 min-h-[140px]">
      <p className="text-[12px] font-semibold text-white/40">%NPL / สินเชื่อโต YoY ธนาคารพาณิชย์</p>
      <p className="text-[10.5px] text-white/25">รอข้อมูลจาก ธปท. (ต้องมี API key ก่อน)</p>
    </div>
  );
}

function ZoneSection({
  zone,
  label,
  items,
}: {
  zone: MacroZone;
  label: string;
  items: MacroCommodity[];
}) {
  return (
    <div
      className="bg-[#13161e] border border-white/[0.07] rounded-xl overflow-hidden"
      style={{ borderLeft: `3px solid ${ZONE_COLORS[zone]}` }}
    >
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2">
        <p className="text-[13px] font-semibold text-white">{label}</p>
        <span className="text-[11px] text-white/30">{items.length} รายการ</span>
      </div>
      <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map(c => (
          <CommodityCard key={c.symbol} commodity={c} />
        ))}
        {zone === 'financial' && <BankHealthPendingCard />}
      </div>
    </div>
  );
}

export default function MacroPage() {
  const zones = macroCommoditiesByZone();

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div>
        <h1 className="text-[18px] font-bold text-white">Macro & Commodities</h1>
        <p className="text-[12px] text-white/35 mt-0.5">
          ราคา commodity/FX ที่กระทบหุ้นไทย · Yahoo Finance ณ สแกน {formatShortThaiDate(macroGeneratedAt)}
        </p>
      </div>

      {zones.map(z => (
        <ZoneSection key={z.zone} zone={z.zone} label={z.label} items={z.items} />
      ))}

      <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-4 space-y-2">
        <h2 className="text-[12px] font-semibold text-white/70">หมายเหตุ</h2>
        <p className="text-[11.5px] text-white/40 leading-relaxed">{macroMethodology}</p>
        <p className="text-[11.5px] text-white/40 leading-relaxed">{macroPalmOilNote}</p>
        <p className="text-[10.5px] text-white/25 pt-1 border-t border-white/[0.06]">
          ราคา commodity มาจาก Yahoo Finance อัปเดตตาม pipeline รายวัน (ไม่ใช่ real-time) · ข้อมูลธนาคาร (%NPL /
          สินเชื่อโต YoY) จะเป็นรายเดือน/ไตรมาสจาก ธปท. เมื่อพร้อมใช้งาน — ความถี่ต่างจากราคา commodity อย่างชัดเจน
        </p>
      </div>
    </div>
  );
}
