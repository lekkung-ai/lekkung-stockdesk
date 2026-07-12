import Link from 'next/link';
import { ChangeBadge } from './ChangeBadge';
import TrendSparkline from './TrendSparkline';
import { macroCommoditiesForTicker } from '@/lib/macroData';

function formatPrice(close: number): string {
  return close.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

// หุ้นนอก macro_mapping ไม่แสดง section นี้เลย (return null) - ไม่ใช่การ์ดว่าง
export default function MacroFactorCard({ ticker }: { ticker: string }) {
  const commodities = macroCommoditiesForTicker(ticker);
  if (commodities.length === 0) return null;

  return (
    <div className="bg-[#13161e] border border-white/[0.07] rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
        <h2 className="text-[13px] font-semibold text-white">ปัจจัยมหภาคที่เกี่ยวข้อง</h2>
        <Link href="/macro" className="text-[11.5px] text-[#5B9BD5] hover:text-[#8FC1EA] transition-colors">
          ดู Macro & Commodities →
        </Link>
      </div>
      <div className="divide-y divide-white/[0.04]">
        {commodities.map(c => (
          <div key={c.symbol} className="px-5 py-3.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[12.5px] font-medium text-white/80 truncate">{c.name_th}</p>
              <p className="text-[10.5px] text-white/25 truncate">
                {c.symbol} · {formatPrice(c.latest.close)} {c.unit}
              </p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <TrendSparkline data={c.series.map(s => s.close)} width={48} height={18} />
              <ChangeBadge value={c.pct_1d} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
