import Link from 'next/link';
import { ChangeBadge } from './ChangeBadge';
import TrendSparkline from './TrendSparkline';
import { macroCommoditiesForTicker } from '@/lib/macroData';

function formatPrice(close: number | null | undefined): string {
  if (close == null || isNaN(close)) return '—';
  return close.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

// หุ้นนอก macro_mapping ไม่แสดง section นี้เลย (return null) - ไม่ใช่การ์ดว่าง
export default function MacroFactorCard({ ticker }: { ticker: string }) {
  const commodities = macroCommoditiesForTicker(ticker);
  if (commodities.length === 0) return null;

  return (
    <div className="bg-[#13161e] border border-white/[0.07] rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
        <h2 className="text-section text-ink">ปัจจัยมหภาคที่เกี่ยวข้อง</h2>
        <Link href="/macro" className="text-label text-[#5B9BD5] hover:text-[#8FC1EA] transition-colors">
          ดู Macro & Commodities →
        </Link>
      </div>
      <div className="divide-y divide-white/[0.04]">
        {commodities.map(c => {
          const impactType = c.ticker_impacts?.[ticker.toUpperCase()] || 'revenue';
          let impactText = '';
          if (c.symbol === 'THB=X') {
            impactText =
              impactType === 'cost'
                ? 'บาทอ่อน = กดดัน (หนี้/นำเข้า USD)'
                : 'บาทอ่อน (ค่าขึ้น) = หนุนส่งออก';
          } else if (c.symbol === 'DX-Y.NYB') {
            impactText = 'ดอลลาร์แข็ง = หนุนส่งออก';
          } else {
            impactText =
              impactType === 'cost'
                ? 'ต้นทุน (ราคาขึ้น = กดดัน)'
                : impactType === 'margin'
                ? 'มาร์จิ้น/สเปรด (ราคาขึ้น = หนุน)'
                : 'รายได้ (ราคาขึ้น = หนุน)';
          }

          const impactBadgeStyle =
            impactType === 'cost'
              ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
              : impactType === 'margin'
              ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
              : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';

          const isSynthetic = c.symbol.startsWith('PETRO_');
          const hasValidPrice = c.latest?.close != null && !isNaN(c.latest.close) && c.latest.close > 0;
          const priceDateStr = c.latest?.date ? ` (ณ ${c.latest.date})` : '';

          return (
            <div key={c.symbol} className="px-5 py-3.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-body text-ink font-medium truncate">{c.name_th}</p>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${impactBadgeStyle}`}>
                    {impactText}
                  </span>
                  {isSynthetic && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-purple-500/10 text-purple-300 border-purple-500/20">
                      ค่าประมาณ
                    </span>
                  )}
                </div>
                <p className="text-label text-meta truncate mt-0.5">
                  {c.symbol} · {hasValidPrice ? `${formatPrice(c.latest.close)} ${c.unit}` : 'ไม่มีข้อมูล'}{priceDateStr}
                </p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <TrendSparkline data={(c.series || []).map(s => s.close)} width={48} height={18} />
                <ChangeBadge value={c.pct_1d} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
