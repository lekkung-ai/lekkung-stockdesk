'use client';

import { Suspense, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { useMarketQuotes } from '@/lib/useMarketQuotes';
import { sectorSummary } from '@/lib/sectorSummaryData';
import { divergingWidth, parseSecMarket, sortByChg, type SectorMarket } from '@/lib/sectorSummary';
import { formatPct } from '@/lib/sectorChange';
import { heatTextColor } from '@/lib/heatColor';
import { sectorToSlug } from '@/lib/sectorData';

// Same pill colours as the Sector Flow status column (components/SectorFlowView.tsx).
const STATUS_STYLE: Record<string, string> = {
  'แข็งต่อเนื่อง': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40',
  'เพิ่งเริ่มแข็ง': 'bg-sky-500/15 text-sky-400 border-sky-500/40',
  'เริ่มหมดแรง': 'bg-orange-500/15 text-orange-400 border-orange-500/40',
  'อ่อนต่อเนื่อง': 'bg-rose-500/15 text-rose-400 border-rose-500/40',
};

const COLS = 'grid-cols-[minmax(110px,1.3fr)_minmax(90px,1.4fr)_72px_44px_118px_minmax(90px,1fr)_14px]';

function hhmm(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Bangkok' });
}

// The home page is prerendered: the ?secmkt reader sits in its own Suspense boundary and
// the prerendered fallback is the SET view.
export default function SectorTodayTable({ scanDateLabel }: { scanDateLabel: string }) {
  return (
    <Suspense fallback={<SectorTodayView market="SET" scanDateLabel={scanDateLabel} />}>
      <SectorTodayFromUrl scanDateLabel={scanDateLabel} />
    </Suspense>
  );
}

// ?secmkt=set|mai keeps the tab across a refresh; replaceState syncs with useSearchParams.
function SectorTodayFromUrl({ scanDateLabel }: { scanDateLabel: string }) {
  const searchParams = useSearchParams();
  const market = parseSecMarket(searchParams.get('secmkt'));
  function pick(m: SectorMarket) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('secmkt', m.toLowerCase());
    window.history.replaceState(null, '', `?${params.toString()}`);
  }
  return <SectorTodayView market={market} onPick={pick} scanDateLabel={scanDateLabel} />;
}

function SectorTodayView({
  market,
  onPick,
  scanDateLabel,
}: {
  market: SectorMarket;
  onPick?: (m: SectorMarket) => void;
  scanDateLabel: string;
}) {
  const { status, quotes, fetchedAt } = useMarketQuotes();
  const quotesOk = status === 'ok';

  const rows = useMemo(
    () => ({ SET: sortByChg(sectorSummary('SET', quotesOk ? quotes : null)), MAI: sortByChg(sectorSummary('MAI', quotesOk ? quotes : null)) }),
    [quotes, quotesOk],
  );
  const shown = rows[market];
  const updated = hhmm(fetchedAt);

  return (
    <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-5" data-testid="home-sector-today">
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h2 className="text-[13px] font-semibold text-white">Sector วันนี้</h2>
          <p className="text-[11px] text-white/30 mt-0.5">% ถ่วงด้วย market cap · สูตรเดียวกับ Sector Map · แยกตลาด ไม่ปนกัน</p>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <Link href="/sector" className="px-2.5 py-1 rounded-md bg-white/[0.05] text-white/55 hover:text-white hover:bg-white/10 transition-colors">
            Sector Map →
          </Link>
          <Link href="/sector-flow" className="px-2.5 py-1 rounded-md bg-white/[0.05] text-white/55 hover:text-white hover:bg-white/10 transition-colors">
            Sector Flow →
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-0.5 bg-white/[0.04] rounded-lg p-1 w-fit mb-3" role="tablist">
        {(['SET', 'MAI'] as SectorMarket[]).map(m => (
          <button
            key={m}
            role="tab"
            aria-selected={market === m}
            data-testid={`sector-tab-${m.toLowerCase()}`}
            onClick={() => onPick?.(m)}
            className={`px-3 py-1 rounded-md text-[11px] font-medium transition-all ${
              market === m ? 'bg-white/[0.12] text-white' : 'text-white/35 hover:text-white/60'
            }`}
          >
            {m === 'SET' ? 'SET' : 'mai'} · {rows[m].length} กลุ่ม
          </button>
        ))}
      </div>

      {!quotesOk && status !== 'loading' && (
        <p className="text-[11px] text-amber-300/80 mb-2">ไม่มีข้อมูลราคาสด</p>
      )}

      <div className="overflow-x-auto">
        <div className="min-w-[620px]">
          <div className={`grid ${COLS} gap-3 px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/25 border-b border-white/[0.06]`}>
            <span>กลุ่ม</span>
            <span className="text-center">−2% · 0 · +2%</span>
            <span className="text-right">% วันนี้</span>
            <span className="text-right">RS</span>
            <span className="text-center">แนวโน้ม</span>
            <span>Stage 2</span>
            <span />
          </div>
          {shown.map(r => {
            const w = divergingWidth(r.chg);
            const pos = (r.chg ?? 0) >= 0;
            return (
              <Link
                key={r.name}
                href={`/sector/${sectorToSlug(r.name)}?market=${market}`}
                data-testid="sector-row"
                data-sector={r.name}
                className={`grid ${COLS} gap-3 items-center px-2 py-2 border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors group`}
              >
                <span className="min-w-0">
                  <span className="text-[12.5px] font-semibold text-white/85 truncate block">{r.name}</span>
                  <span className="text-[10px] text-white/30 tabular-nums">{r.total} หุ้น</span>
                </span>
                <span className="relative h-2.5 rounded-full bg-white/[0.05] overflow-hidden" aria-hidden>
                  <span className="absolute inset-y-0 left-1/2 w-px bg-white/25" />
                  {r.chg != null && (
                    <span
                      className="absolute inset-y-0"
                      style={pos
                        ? { left: '50%', width: `${w}%`, background: '#1D9E75' }
                        : { right: '50%', width: `${w}%`, background: '#E24B4A' }}
                    />
                  )}
                </span>
                <span
                  className="text-right text-[13px] font-bold tabular-nums"
                  style={{ color: heatTextColor(r.chg) ?? 'rgba(255,255,255,0.3)' }}
                  title={r.n != null ? `คำนวณจาก ${r.n}/${r.total} หุ้นที่มีราคาและ market cap` : undefined}
                  data-testid="sector-chg"
                >
                  {formatPct(r.chg)}
                </span>
                <span className="text-right text-[12px] text-white/70 tabular-nums" data-testid="sector-rs">{r.rs ?? '—'}</span>
                <span className="text-center" data-testid="sector-status">
                  {r.status ? (
                    <span className={`inline-block px-2 py-0.5 rounded-full border text-[10.5px] font-bold whitespace-nowrap ${STATUS_STYLE[r.status] ?? 'border-white/20 text-white/60'}`}>
                      {r.status}
                    </span>
                  ) : (
                    <span className="text-[12px] text-white/25">—</span>
                  )}
                </span>
                <span className="flex items-center gap-2 min-w-0" title="Stage 2 = S.Bull + Bull ÷ หุ้นที่มี stage">
                  <span className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                    <span className="block h-full rounded-full bg-[#4caf50]" style={{ width: `${r.stage2Pct ?? 0}%` }} />
                  </span>
                  <span className="text-[11px] text-white/60 tabular-nums w-8 text-right">
                    {r.stage2Pct != null ? `${r.stage2Pct.toFixed(0)}%` : '—'}
                  </span>
                </span>
                <ChevronRight size={14} className="text-white/20 group-hover:text-white/60" />
              </Link>
            );
          })}
        </div>
      </div>

      <p className="text-[10.5px] text-white/30 mt-3" data-testid="sector-footer">
        % วันนี้ = TradingView ล่าช้า 15 นาที{updated ? ` · อัปเดต ${updated}` : ''} · RS และ Stage 2 ณ สแกน {scanDateLabel} ·{' '}
        {market === 'SET' ? 'แนวโน้มจาก Sector Flow' : 'ตลาด mai · แนวโน้มยังไม่มีสำหรับ mai'}
      </p>
    </div>
  );
}
