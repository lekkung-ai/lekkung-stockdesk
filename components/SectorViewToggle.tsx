'use client';

import { useMemo, useState } from 'react';
import type { ScanEntry } from '@/lib/scanData';
import SectorTickerGrid from './SectorTickerGrid';
import SectorTickerTable from './SectorTickerTable';
import SectorValuationScatter from './SectorValuationScatter';
import SectorPEDistribution from './SectorPEDistribution';

type TickerWithScan = { ticker: string; scan: ScanEntry | null; pe: number | null; pb: number | null; roe: number | null };
type SubsectorData = { subsector: string; tickers: TickerWithScan[] };

export default function SectorViewToggle({ subsectors }: { subsectors: SubsectorData[] }) {
  const [view, setView] = useState<'list' | 'scatter' | 'pe'>('list');
  const [listLayout, setListLayout] = useState<'grid' | 'table'>('grid');

  const scatterPoints = useMemo(
    () => subsectors.flatMap(s => s.tickers.map(t => ({ ticker: t.ticker, pb: t.pb, roe: t.roe }))),
    [subsectors]
  );
  const points = useMemo(
    () => subsectors.flatMap(s => s.tickers.map(t => ({ ticker: t.ticker, pe: t.pe, roe: t.roe }))),
    [subsectors]
  );

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <div className="inline-flex rounded-lg border border-white/[0.07] overflow-hidden p-0.5 bg-black/20">
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
      </div>

      {view === 'list' ? (
        <div className="space-y-3">
          <div className="flex justify-end">
            <div className="inline-flex rounded-lg border border-white/[0.07] overflow-hidden p-0.5 bg-black/20">
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
          </div>

          {listLayout === 'grid' ? (
            <SectorTickerGrid subsectors={subsectors} />
          ) : (
            <SectorTickerTable subsectors={subsectors} />
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
