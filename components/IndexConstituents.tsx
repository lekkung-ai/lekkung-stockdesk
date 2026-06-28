'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import MiniCandleChart from '@/components/MiniCandleChart';
import { scanData } from '@/lib/scanData';
import { getSectorForTicker } from '@/lib/sectorData';
import { peColor } from '@/lib/utils';
import marketStageRaw from '@/data/scans/market_stage.json';

interface Item {
  symbol: string;
  last: number;
  change: number;
  percentChange: number;
  marketCap: number | null;
  pe: number | null;
  pb: number | null;
  divYield: number | null;
  sectorCode: string;
  nameTH: string;
}

const INDEX_NAMES: Record<string, string> = { set50: 'SET50', set100: 'SET100' };

const sigMap = new Map(scanData.map(e => [e.ticker.toUpperCase(), e]));
const stageMap = new Map(
  (marketStageRaw as Array<{ Ticker: string; Stage: string }>).map(e => [e.Ticker.toUpperCase(), e.Stage])
);

const STAGE: Record<string, { color: string; bg: string }> = {
  'S.Bull': { color: '#1D9E75', bg: 'rgba(29,158,117,.15)' },
  'Bull': { color: '#4CAF50', bg: 'rgba(76,175,80,.15)' },
  'Recovery': { color: '#EF9F27', bg: 'rgba(239,159,39,.15)' },
  'Accumulation': { color: '#378ADD', bg: 'rgba(55,138,221,.15)' },
  'Distribution': { color: '#BA7517', bg: 'rgba(186,117,23,.15)' },
  'Warning': { color: '#EF9F27', bg: 'rgba(239,159,39,.15)' },
  'Bear': { color: '#E24B4A', bg: 'rgba(226,75,74,.15)' },
};

function fmtPrice(n: number | null): string {
  if (n == null) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtMktCap(v: number | null): string {
  if (v == null) return '—';
  if (v >= 1e12) return (v / 1e12).toFixed(2) + 'T';
  if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(0) + 'M';
  return v.toFixed(0);
}

const badge = (text: string, color: string, bg: string) => (
  <span
    style={{
      color,
      background: bg,
      border: `1px solid ${color}55`,
      borderRadius: 3,
      padding: '0 3px',
      fontSize: 9,
      fontWeight: 700,
      lineHeight: '14px',
    }}
  >
    {text}
  </span>
);

function ScanBadges({ sym }: { sym: string }) {
  const e = sigMap.get(sym.toUpperCase());
  if (!e || (!e.sepa && !e.kell && !e.breakout)) {
    return <span className="text-[11px] text-white/20">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-[3px]">
      {e.sepa && badge('SEPA', '#1D9E75', 'rgba(29,158,117,.15)')}
      {e.kell && badge('Kell', '#4CAF50', 'rgba(76,175,80,.15)')}
      {e.breakout && badge('BO', '#378ADD', 'rgba(55,138,221,.15)')}
    </div>
  );
}

function StageBadge({ sym }: { sym: string }) {
  const key = sym.toUpperCase();
  const stage = sigMap.get(key)?.stage || stageMap.get(key) || '';
  const style = stage ? STAGE[stage] : null;
  if (!stage || !style) return <span className="text-[11px] text-white/20">—</span>;
  return badge(stage, style.color, style.bg);
}

export default function IndexConstituents({ index }: { index: string }) {
  const router = useRouter();
  const idxName = INDEX_NAMES[index.toLowerCase()] ?? index.toUpperCase();

  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setItems(null);
    setError(false);
    fetch(`/api/index-composition/${index}`)
      .then(r => r.json())
      .then(d => {
        if (!active) return;
        if (Array.isArray(d.items) && d.items.length) setItems(d.items);
        else {
          setItems([]);
          setError(true);
        }
      })
      .catch(() => {
        if (active) {
          setItems([]);
          setError(true);
        }
      });
    return () => {
      active = false;
    };
  }, [index]);

  // Biggest market cap first
  const rows = useMemo(() => {
    if (!items) return [];
    return [...items].sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0));
  }, [items]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-2 -ml-2 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/[0.05] transition-colors"
          aria-label="ย้อนกลับ"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-[18px] font-bold text-white">{idxName}</h1>
          <p className="text-[12px] text-white/35 mt-0.5">
            หุ้นในดัชนี {idxName}
            {items && items.length > 0 ? ` · ${items.length} ตัว · เรียงตาม Market Cap` : ''}
          </p>
        </div>
      </div>

      <div className="bg-[#13161e] border border-white/[0.07] rounded-xl overflow-hidden">
        {items === null ? (
          <div className="px-5 py-12 text-center">
            <span className="text-[12px] text-white/25 animate-pulse">กำลังโหลด...</span>
          </div>
        ) : rows.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-[13px] text-white/30">
              {error ? 'โหลดรายชื่อหุ้นไม่สำเร็จ ลองใหม่อีกครั้ง' : 'ไม่พบข้อมูล'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                  <th className="px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-white/25">#</th>
                  <th className="px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-white/25">Symbol</th>
                  <th className="px-2 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-white/25">Price</th>
                  <th className="px-2 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-white/25">%Chg</th>
                  <th className="px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-white/25">Scan</th>
                  <th className="px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-white/25">Stage</th>
                  <th className="px-2 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-white/25">P/E</th>
                  <th className="px-2 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-white/25 whitespace-nowrap">Mkt Cap</th>
                  <th className="px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-white/25 hidden md:table-cell">Sector</th>
                  <th className="px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-white/25 hidden sm:table-cell">Chart</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const up = r.percentChange >= 0;
                  const sector = getSectorForTicker(r.symbol.toUpperCase())?.sector ?? r.sectorCode;
                  return (
                    <tr
                      key={r.symbol}
                      onClick={() => router.push(`/stock/${r.symbol}`)}
                      className="cursor-pointer transition-colors hover:bg-white/[0.025]"
                      style={{ borderBottom: '1px solid rgba(255,255,255,.04)' }}
                    >
                      <td className="px-2 py-2.5 text-[13px] text-white/25 tabular-nums">{i + 1}</td>
                      <td className="px-2 py-2.5">
                        <span className="text-[14px] font-bold text-white">{r.symbol}</span>
                      </td>
                      <td className="px-2 py-2.5 text-[14px] text-white/75 text-right tabular-nums whitespace-nowrap">
                        {fmtPrice(r.last)}
                      </td>
                      <td
                        className="px-2 py-2.5 text-[14px] text-right tabular-nums font-semibold whitespace-nowrap"
                        style={{ color: up ? '#1D9E75' : '#E24B4A' }}
                      >
                        {up ? '+' : ''}
                        {r.percentChange.toFixed(2)}%
                      </td>
                      <td className="px-2 py-2.5">
                        <ScanBadges sym={r.symbol} />
                      </td>
                      <td className="px-2 py-2.5">
                        <StageBadge sym={r.symbol} />
                      </td>
                      <td
                        className="px-2 py-2.5 text-[13px] text-right tabular-nums whitespace-nowrap"
                        style={{ color: peColor(r.pe) || 'rgba(255,255,255,0.6)' }}
                      >
                        {r.pe != null ? r.pe.toFixed(2) : '—'}
                      </td>
                      <td className="px-2 py-2.5 text-[13px] text-white/60 text-right tabular-nums whitespace-nowrap">
                        {fmtMktCap(r.marketCap)}
                      </td>
                      <td className="px-2 py-2.5 text-[12px] text-white/45 hidden md:table-cell whitespace-nowrap">
                        {sector}
                      </td>
                      <td
                        className="hidden sm:table-cell"
                        style={{ paddingTop: 6, paddingBottom: 6, paddingLeft: 8, paddingRight: 8 }}
                      >
                        <MiniCandleChart ticker={r.symbol} width="100%" height={48} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
