'use client';

import { useMemo, useState, useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import type { ScanEntry } from '@/lib/scanData';
import rsRaw from '@/data/scans/rs_ranking.json';
import stageRaw from '@/data/scans/stage_all.json';
import SectorTickerGrid from './SectorTickerGrid';
import SectorTickerTable from './SectorTickerTable';
import SectorValuationScatter from './SectorValuationScatter';
import SectorPEDistribution from './SectorPEDistribution';

type LivePrice = { price: number; changePercent: number };
type TickerWithScan = {
  ticker: string;
  scan: ScanEntry | null;
  pe: number | null;
  pb: number | null;
  roe: number | null;
};
type SubsectorData = { subsector: string; tickers: TickerWithScan[] };

export type SortMode = 'rs_desc' | 'growth_desc' | 'chg_desc' | 'name_asc';

const rsMap = new Map<string, number>(
  (rsRaw as { Ticker: string; RS_Rating: number }[]).map(r => [r.Ticker, r.RS_Rating])
);
const stageAllMap = new Map<string, string>(
  (stageRaw as { Ticker: string; Stage: string }[]).map(r => [r.Ticker, r.Stage])
);

export default function SectorViewToggle({ subsectors }: { subsectors: SubsectorData[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [view, setView] = useState<'list' | 'scatter' | 'pe'>('list');
  const [listLayout, setListLayout] = useState<'grid' | 'table'>('grid');
  const [priceMap, setPriceMap] = useState<Record<string, LivePrice>>({});

  // URL search params state
  const rawSort = searchParams.get('sort') as SortMode | null;
  const sortMode: SortMode =
    rawSort === 'growth_desc' || rawSort === 'chg_desc' || rawSort === 'name_asc' ? rawSort : 'rs_desc';
  const filterStage2 = searchParams.get('stage2') === '1';
  const filterScan = searchParams.get('scan') === '1';
  const filterRS80 = searchParams.get('rs80') === '1';

  // Fetch live prices for all tickers
  useEffect(() => {
    const allTickers = subsectors.flatMap(s => s.tickers.map(t => t.ticker));
    if (allTickers.length === 0) return;
    fetch(`/api/prices?symbols=${allTickers.map(t => encodeURIComponent(t)).join(',')}`)
      .then(r => r.json())
      .then(json => {
        if (json.prices) setPriceMap(json.prices);
      })
      .catch(() => {});
  }, [subsectors]);

  // Update URL params
  const updateUrl = (newParams: { sort?: SortMode; stage2?: boolean; scan?: boolean; rs80?: boolean }) => {
    const params = new URLSearchParams(searchParams.toString());

    if (newParams.sort !== undefined) {
      if (newParams.sort === 'rs_desc') params.delete('sort');
      else params.set('sort', newParams.sort);
    }
    if (newParams.stage2 !== undefined) {
      if (newParams.stage2) params.set('stage2', '1');
      else params.delete('stage2');
    }
    if (newParams.scan !== undefined) {
      if (newParams.scan) params.set('scan', '1');
      else params.delete('scan');
    }
    if (newParams.rs80 !== undefined) {
      if (newParams.rs80) params.set('rs80', '1');
      else params.delete('rs80');
    }

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const totalAllCount = useMemo(
    () => subsectors.reduce((sum, s) => sum + s.tickers.length, 0),
    [subsectors]
  );

  // Filtered and sorted subsector data
  const filteredSubsectors = useMemo(() => {
    return subsectors.map(sub => {
      // 1. Filter (AND condition)
      const filtered = sub.tickers.filter(t => {
        const stage = t.scan?.stage ?? stageAllMap.get(t.ticker) ?? null;
        const rs = t.scan?.rs_score ?? rsMap.get(t.ticker) ?? null;

        if (filterStage2 && !(stage === 'S.Bull' || stage === 'Bull')) {
          return false;
        }
        if (filterScan) {
          const s = t.scan;
          const hasAnyScan = Boolean(s && (s.sepa || s.kell || s.breakout || s.lekkung || s.oneil || s.weinstein));
          if (!hasAnyScan) return false;
        }
        if (filterRS80 && (rs === null || rs < 80)) {
          return false;
        }
        return true;
      });

      // 2. Sort (non-mutating [...arr].sort)
      const sorted = [...filtered].sort((a, b) => {
        if (sortMode === 'rs_desc') {
          const rsA = a.scan?.rs_score ?? rsMap.get(a.ticker) ?? null;
          const rsB = b.scan?.rs_score ?? rsMap.get(b.ticker) ?? null;
          if (rsA === null && rsB === null) return 0;
          if (rsA === null) return 1;
          if (rsB === null) return -1;
          return rsB - rsA;
        }
        if (sortMode === 'growth_desc') {
          const gA = a.scan?.growth_qoq ?? a.scan?.growth_yoy ?? null;
          const gB = b.scan?.growth_qoq ?? b.scan?.growth_yoy ?? null;
          if (gA === null && gB === null) return 0;
          if (gA === null) return 1;
          if (gB === null) return -1;
          return gB - gA;
        }
        if (sortMode === 'chg_desc') {
          const chgA = priceMap[a.ticker]?.changePercent ?? null;
          const chgB = priceMap[b.ticker]?.changePercent ?? null;
          if (chgA === null && chgB === null) return 0;
          if (chgA === null) return 1;
          if (chgB === null) return -1;
          return chgB - chgA;
        }
        if (sortMode === 'name_asc') {
          return a.ticker.localeCompare(b.ticker);
        }
        return 0;
      });

      return {
        ...sub,
        tickers: sorted,
      };
    });
  }, [subsectors, filterStage2, filterScan, filterRS80, sortMode, priceMap]);

  const totalFilteredCount = useMemo(
    () => filteredSubsectors.reduce((sum, s) => sum + s.tickers.length, 0),
    [filteredSubsectors]
  );

  const scatterPoints = useMemo(
    () => subsectors.flatMap(s => s.tickers.map(t => ({ ticker: t.ticker, pb: t.pb, roe: t.roe }))),
    [subsectors]
  );
  const points = useMemo(
    () => subsectors.flatMap(s => s.tickers.map(t => ({ ticker: t.ticker, pe: t.pe, roe: t.roe }))),
    [subsectors]
  );

  return (
    <div className="space-y-4">
      {/* Top View Tabs + Grid/Table Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-white/[0.07] overflow-hidden p-0.5 bg-black/20 self-start">
          <button
            onClick={() => setView('list')}
            className={`px-3 py-1.5 text-[12px] font-semibold rounded-md transition-colors ${
              view === 'list' ? 'bg-white/10 text-white' : 'text-white/35 hover:text-white/60'
            }`}
          >
            รายชื่อหุ้น
          </button>
          <button
            onClick={() => setView('scatter')}
            className={`px-3 py-1.5 text-[12px] font-semibold rounded-md transition-colors ${
              view === 'scatter' ? 'bg-white/10 text-white' : 'text-white/35 hover:text-white/60'
            }`}
          >
            Scatter Valuation
          </button>
          <button
            onClick={() => setView('pe')}
            className={`px-3 py-1.5 text-[12px] font-semibold rounded-md transition-colors ${
              view === 'pe' ? 'bg-white/10 text-white font-bold border border-white/10' : 'text-white/35 hover:text-white/60'
            }`}
          >
            PE Distribution
          </button>
        </div>

        {view === 'list' && (
          <div className="inline-flex rounded-lg border border-white/[0.07] overflow-hidden p-0.5 bg-black/20 self-end sm:self-auto">
            <button
              onClick={() => setListLayout('grid')}
              title="การ์ด"
              className={`px-2.5 py-1 text-[12px] font-semibold rounded-md transition-colors ${
                listLayout === 'grid' ? 'bg-white/10 text-white' : 'text-white/35 hover:text-white/60'
              }`}
            >
              ⊞
            </button>
            <button
              onClick={() => setListLayout('table')}
              title="ตาราง"
              className={`px-2.5 py-1 text-[12px] font-semibold rounded-md transition-colors ${
                listLayout === 'table' ? 'bg-white/10 text-white' : 'text-white/35 hover:text-white/60'
              }`}
            >
              ☰
            </button>
          </div>
        )}
      </div>

      {view === 'list' ? (
        <div className="space-y-4">
          {/* Toolbar: Sort + Quick Filter Chips + Counter + Legend */}
          <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-3.5 space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              {/* Left: Sort dropdown + Filter Chips */}
              <div className="flex items-center gap-2.5 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="text-label text-white/40 font-medium">เรียงตาม:</span>
                  <select
                    value={sortMode}
                    onChange={e => updateUrl({ sort: e.target.value as SortMode })}
                    className="bg-white/5 border border-white/10 rounded-md px-2.5 py-1 text-label text-white outline-none focus:border-white/20 cursor-pointer"
                  >
                    <option value="rs_desc" className="bg-[#13161e]">RS Rating (มาก→น้อย)</option>
                    <option value="growth_desc" className="bg-[#13161e]">Revenue Growth (มาก→น้อย)</option>
                    <option value="chg_desc" className="bg-[#13161e]">% เปลี่ยนแปลงวันนี้</option>
                    <option value="name_asc" className="bg-[#13161e]">ชื่อ (A-Z)</option>
                  </select>
                </div>

                <div className="h-4 w-px bg-white/10 hidden sm:block" />

                {/* Quick Filter Chips */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => updateUrl({ stage2: !filterStage2 })}
                    className={`px-2.5 py-1 rounded-lg text-label font-medium transition-all border ${
                      filterStage2
                        ? 'bg-emerald-500/15 border-emerald-500/45 text-emerald-400'
                        : 'bg-white/[0.04] text-white/35 border-white/[0.06] hover:text-white/60'
                    }`}
                  >
                    🟢 เฉพาะ Stage 2
                  </button>

                  <button
                    type="button"
                    onClick={() => updateUrl({ scan: !filterScan })}
                    className={`px-2.5 py-1 rounded-lg text-label font-medium transition-all border ${
                      filterScan
                        ? 'bg-emerald-500/15 border-emerald-500/45 text-emerald-400'
                        : 'bg-white/[0.04] text-white/35 border-white/[0.06] hover:text-white/60'
                    }`}
                  >
                    🎯 ติด scan
                  </button>

                  <button
                    type="button"
                    onClick={() => updateUrl({ rs80: !filterRS80 })}
                    className={`px-2.5 py-1 rounded-lg text-label font-medium transition-all border ${
                      filterRS80
                        ? 'bg-emerald-500/15 border-emerald-500/45 text-emerald-400'
                        : 'bg-white/[0.04] text-white/35 border-white/[0.06] hover:text-white/60'
                    }`}
                  >
                    ⚡ RS ≥ 80
                  </button>
                </div>
              </div>

              {/* Right: Counter */}
              <div className="text-right flex-shrink-0">
                <span className="text-[12px] font-medium text-white/40">
                  แสดง <span className="text-white font-bold">{totalFilteredCount}</span> / {totalAllCount} ตัว
                </span>
              </div>
            </div>

            {/* Legend row with color swatches */}
            <div className="flex items-center gap-3 text-[10.5px] text-white/45 flex-wrap pt-2.5 border-t border-white/[0.05]">
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-[5px] rounded bg-[#2dd4a0]" />
                <span>RS ≥ 70 แข็งกว่าตลาด</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-[5px] rounded bg-[#fbbf24]" />
                <span>RS 40–69 กลาง</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-[5px] rounded bg-[#f87171]" />
                <span>RS &lt; 40 อ่อนกว่าตลาด</span>
              </div>
              <span>· Gr = Revenue Growth (YoY) ล่าสุด</span>
            </div>
          </div>

          {listLayout === 'grid' ? (
            <SectorTickerGrid subsectors={filteredSubsectors} priceMap={priceMap} />
          ) : (
            <SectorTickerTable subsectors={filteredSubsectors} />
          )}
        </div>
      ) : view === 'scatter' ? (
        <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-4">
          <p className="text-[12px] text-white/35 mb-3">
            P/BV × ROE (TTM) ของหุ้นในกลุ่มนี้ - จุดที่เขียวคือ ROE สูงเมื่อเทียบกับ P/BV ต่ำกว่าที่แนวโน้มกลุ่มบ่งชี้ (อาจถูกกว่าที่ควร)
          </p>
          <SectorValuationScatter points={scatterPoints} />
        </div>
      ) : (
        <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-4 space-y-3">
          <div>
            <h3 className="text-[14px] font-bold text-white">P/E Ratio Distribution & Threshold Valuation</h3>
            <p className="text-[12px] text-white/35 mt-0.5">
              การกระจายตัวของ P/E Ratio ของหุ้นในกลุ่มนี้ — ปรับ Threshold Slider เพื่อคัดแยกหุ้นถูก (เขียว) และหุ้นแพง (แดง)
            </p>
          </div>
          <SectorPEDistribution points={points} />
        </div>
      )}
    </div>
  );
}
