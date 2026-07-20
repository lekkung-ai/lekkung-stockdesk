'use client';

import { useMemo, useState } from 'react';
import type { ScanEntry } from '@/lib/scanData';
import SectorTickerGrid from './SectorTickerGrid';
import SectorValuationScatter from './SectorValuationScatter';

type TickerWithScan = { ticker: string; scan: ScanEntry | null };
type SubsectorData = { subsector: string; tickers: TickerWithScan[] };

export default function SectorViewToggle({ subsectors }: { subsectors: SubsectorData[] }) {
  const [view, setView] = useState<'list' | 'scatter'>('list');
  const tickers = useMemo(
    () => subsectors.flatMap(s => s.tickers.map(t => t.ticker)),
    [subsectors]
  );

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <div className="inline-flex rounded-lg border border-white/[0.07] overflow-hidden">
          <button
            onClick={() => setView('list')}
            className={`px-3 py-1.5 text-[12px] font-semibold transition-colors ${
              view === 'list' ? 'bg-white/10 text-white' : 'text-white/35 hover:text-white/60'
            }`}
          >
            รายชื่อหุ้น
          </button>
          <button
            onClick={() => setView('scatter')}
            className={`px-3 py-1.5 text-[12px] font-semibold transition-colors ${
              view === 'scatter' ? 'bg-white/10 text-white' : 'text-white/35 hover:text-white/60'
            }`}
          >
            Scatter Valuation
          </button>
        </div>
      </div>

      {view === 'list' ? (
        <SectorTickerGrid subsectors={subsectors} />
      ) : (
        <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-4">
          <p className="text-[12px] text-white/35 mb-3">
            P/BV × ROE (TTM) ของหุ้นในกลุ่มนี้ - จุดที่เขียวคือ ROE สูงเมื่อเทียบกับ P/BV ต่ำกว่าที่แนวโน้มกลุ่มบ่งชี้ (อาจถูกกว่าที่ควร)
          </p>
          <SectorValuationScatter tickers={tickers} />
        </div>
      )}
    </div>
  );
}
