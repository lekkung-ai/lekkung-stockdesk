'use client';

import { useState } from 'react';
import RRGChart from '@/components/RRGChart';
import RotationLeaderboard from '@/components/RotationLeaderboard';
import { ScatterChart, Table } from 'lucide-react';

type ViewMode = 'chart' | 'table';

export default function SectorRotationPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('chart');

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-5">
      {/* Top Header & View Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#13161e] border border-white/[0.08] rounded-2xl p-4.5 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[18px] md:text-[20px] font-bold text-white tracking-tight">
              Relative Rotation Graph (RRG)
            </h1>
            <span className="px-2 py-0.5 text-[10px] md:text-[11px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-full">
              Phase 3
            </span>
          </div>
          <p className="text-[12px] text-white/40 mt-0.5">
            วิเคราะห์ทิศทางและโมเมนตัมการหมุนเวียนเงินของ Sector ย้อนหลัง 4 สัปดาห์
          </p>
        </div>

        {/* View Switcher Controls */}
        <div className="flex gap-1.5 bg-white/[0.04] p-1 rounded-xl border border-white/[0.08] self-start sm:self-auto">
          <button
            onClick={() => setViewMode('chart')}
            className={[
              'flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-[12px] font-bold transition-all',
              viewMode === 'chart'
                ? 'bg-white text-black shadow-sm'
                : 'text-white/50 hover:text-white',
            ].join(' ')}
          >
            <ScatterChart size={14} />
            RRG Chart
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={[
              'flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-[12px] font-bold transition-all',
              viewMode === 'table'
                ? 'bg-white text-black shadow-sm'
                : 'text-white/50 hover:text-white',
            ].join(' ')}
          >
            <Table size={14} />
            Leaderboard Table
          </button>
        </div>
      </div>

      {/* Main View Area */}
      {viewMode === 'chart' ? (
        <RRGChart />
      ) : (
        <RotationLeaderboard />
      )}
    </div>
  );
}
