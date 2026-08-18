'use client';

import { useState } from 'react';
import Link from 'next/link';
import { getSectorsGrouped, sectorToSlug } from '@/lib/sectorData';
import WarrantTable from '@/components/WarrantTable';
import rawSectorRS from '@/data/scans/sector_rs.json';
import rawMarketStage from '@/data/scans/market_stage.json';

type Market = 'SET' | 'MAI' | 'WARRANT';

interface SectorRSData {
  generated_at?: string;
  method?: string;
  sectors: Record<string, Record<string, { rsScore: number; count: number }>>;
}

const sectorRSData = rawSectorRS as SectorRSData;

interface MarketStageItem {
  Ticker: string;
  PE_Ratio?: number | null;
  PBV?: number | null;
}

const peMap = new Map<string, number>(
  (rawMarketStage as MarketStageItem[])
    .filter((item): item is MarketStageItem & { PE_Ratio: number } => typeof item.PE_Ratio === 'number' && !isNaN(item.PE_Ratio))
    .map(item => [item.Ticker, item.PE_Ratio])
);

const pbMap = new Map<string, number>(
  (rawMarketStage as MarketStageItem[])
    .filter((item): item is MarketStageItem & { PBV: number } => typeof item.PBV === 'number' && !isNaN(item.PBV))
    .map(item => [item.Ticker, item.PBV])
);

function medianPE(tickers: string[]): { median: number | null; n: number } {
  const peList: number[] = [];
  for (const ticker of tickers) {
    const pe = peMap.get(ticker);
    if (typeof pe === 'number' && !isNaN(pe) && pe > 0 && pe <= 100) {
      peList.push(pe);
    }
  }
  if (peList.length === 0) {
    return { median: null, n: 0 };
  }
  peList.sort((a, b) => a - b);
  const mid = Math.floor(peList.length / 2);
  const median = peList.length % 2 === 0
    ? (peList[mid - 1] + peList[mid]) / 2
    : peList[mid];
  return { median, n: peList.length };
}

function medianPBV(tickers: string[]): { median: number | null; n: number } {
  const pbList: number[] = [];
  for (const ticker of tickers) {
    const pb = pbMap.get(ticker);
    if (typeof pb === 'number' && !isNaN(pb) && pb > 0 && pb <= 20) {
      pbList.push(pb);
    }
  }
  if (pbList.length === 0) {
    return { median: null, n: 0 };
  }
  pbList.sort((a, b) => a - b);
  const mid = Math.floor(pbList.length / 2);
  const median = pbList.length % 2 === 0
    ? (pbList[mid - 1] + pbList[mid]) / 2
    : pbList[mid];
  return { median, n: pbList.length };
}

const SECTOR_COLORS: Record<string, string> = {
  'Agro':             '#5D9E4A',
  'Consump':          '#E24B4A',
  'Consumer':         '#E24B4A',
  'Financials':       '#378ADD',
  'Industrials':      '#E67E22',
  'Property':         '#27AE60',
  'Resources':        '#EF9F27',
  'Services':         '#7F77DD',
  'Technology':       '#1D9E75',
};

function sectorColor(sector: string): string {
  return SECTOR_COLORS[sector] ?? '#6b7280';
}

export default function SectorPage() {
  const [market, setMarket] = useState<Market>('SET');
  const isWarrantTab = market === 'WARRANT';
  const sectors = isWarrantTab ? [] : getSectorsGrouped(market);
  const totalTickers = sectors.reduce((s, g) => s + g.totalCount, 0);

  // Read Sector RS data based on active market (WARRANT falls back to SET)
  const rsMarketKey = market === 'WARRANT' ? 'SET' : market;
  const currentRSMap = sectorRSData.sectors?.[rsMarketKey] ?? {};

  // Sort sectors in active market by rsScore descending
  const rankedSectors = Object.entries(currentRSMap)
    .map(([sec, info]) => ({
      sector: sec,
      rsScore: info.rsScore,
      count: info.count,
    }))
    .sort((a, b) => b.rsScore - a.rsScore);

  // Calculate relative status per market: Top 1/3 Outperform, Middle Neutral, Bottom 1/3 Underperform
  const statusMap: Record<string, 'Outperforming' | 'Neutral' | 'Underperforming'> = {};
  const totalSectors = rankedSectors.length;
  const topCut = Math.ceil(totalSectors / 3);
  const botCut = totalSectors - Math.floor(totalSectors / 3);

  rankedSectors.forEach((item, idx) => {
    if (idx < topCut) {
      statusMap[item.sector] = 'Outperforming';
    } else if (idx < botCut) {
      statusMap[item.sector] = 'Neutral';
    } else {
      statusMap[item.sector] = 'Underperforming';
    }
  });

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-[#13161e] border border-white/[0.08] rounded-2xl p-5 shadow-sm">
        <div>
          <h1 className="text-[20px] font-bold text-white tracking-tight">Sector Map & Relative Strength</h1>
          <p className="text-[13px] text-white/40 mt-1">
            {isWarrantTab ? 'Warrant ที่ยัง trade อยู่ทั้งหมด' : `${sectors.length} sectors · ${totalTickers} tickers · เปรียบเทียบความแข็งแกร่งกับ SET Index`}
          </p>
        </div>

        {/* Market tab switcher */}
        <div className="flex gap-2">
          {(['SET', 'MAI', 'WARRANT'] as Market[]).map(m => (
            <button
              key={m}
              onClick={() => setMarket(m)}
              className={[
                'px-4 py-2 rounded-xl text-[12px] font-bold uppercase tracking-wider transition-all border shadow-sm',
                market === m
                  ? 'bg-white text-black border-white'
                  : 'bg-white/[0.04] border-white/[0.08] text-white/50 hover:bg-white/[0.08] hover:text-white',
              ].join(' ')}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Relative Strength Overview Bar */}
      {!isWarrantTab && (
        <div className="bg-[#13161e] border border-white/[0.08] rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-extrabold text-white flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              Sector Relative Strength Ranking ({market} - Median RS หุ้นในกลุ่ม)
            </span>
            <span className="text-[11.5px] text-white/40 font-medium">อัปเดตล่าสุดวันนี้</span>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {rankedSectors.map((item) => {
              const status = statusMap[item.sector] ?? 'Neutral';
              return (
                <div key={item.sector} className="bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2 text-center min-w-[130px] flex-1">
                  <p className="text-[12px] font-bold text-white truncate">{item.sector}</p>
                  <div className="flex items-center justify-center gap-1.5 mt-1">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                      status === 'Outperforming' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                      status === 'Neutral' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                      'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    }`}>
                      {status === 'Outperforming' ? `+RS ${item.rsScore}` : status === 'Neutral' ? `RS ${item.rsScore}` : `-RS ${item.rsScore}`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {isWarrantTab ? (
        <WarrantTable />
      ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {sectors.map(({ sector, subsectors, totalCount }) => {
          const color = sectorColor(sector);
          const slug = sectorToSlug(sector);
          const rsScore = currentRSMap[sector]?.rsScore ?? 50;
          const status = statusMap[sector] ?? 'Neutral';
          const allTickers = subsectors.flatMap(s => s.tickers);
          const { median, n } = medianPE(allTickers);
          const { median: medianPb, n: nPb } = medianPBV(allTickers);
          return (
            <Link
              key={sector}
              href={`/sector/${slug}?market=${market}`}
              className="group bg-[#13161e] border border-white/[0.08] rounded-2xl p-4.5 hover:border-white/[0.2] hover:bg-white/[0.02] transition-all shadow-sm space-y-3"
            >
              <div className="flex items-start justify-between gap-2.5">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div
                    className="w-1.5 h-11 rounded-full flex-shrink-0 mt-0.5"
                    style={{ backgroundColor: color }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-extrabold text-white leading-tight">{sector}</p>
                    <p className="text-[12px] text-white/40 mt-0.5 font-medium">{totalCount} หุ้น</p>
                    {median !== null ? (
                      <p className="text-[12px] text-white/40 mt-0.5 font-medium">
                        PE {median.toFixed(1)}x · <span className="text-white/25">n={n}</span>
                      </p>
                    ) : (
                      <p className="text-[12px] text-white/25 mt-0.5 font-medium">PE —</p>
                    )}
                    {medianPb !== null ? (
                      <p className="text-[12px] text-white/40 mt-0.5 font-medium">
                        PBV {medianPb.toFixed(2)}x · <span className="text-white/25">n={nPb}</span>
                      </p>
                    ) : (
                      <p className="text-[12px] text-white/25 mt-0.5 font-medium">PBV —</p>
                    )}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full inline-block ${
                    status === 'Outperforming' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                    status === 'Neutral' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                    'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                  }`}>
                    RS {rsScore}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5 pt-1 border-t border-white/[0.05]">
                {subsectors.map(sub => (
                  <div key={sub.subsector} className="flex items-center justify-between gap-2">
                    <span className="text-[12px] text-white/50 truncate font-medium">{sub.subsector}</span>
                    <span className="text-[12px] text-white/30 tabular-nums flex-shrink-0 font-mono">{sub.count}</span>
                  </div>
                ))}
              </div>
            </Link>
          );
        })}
      </div>
      )}
    </div>
  );
}
