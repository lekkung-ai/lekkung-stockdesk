import rawStage from '@/data/scans/market_stage.json';
import rawSepa from '@/data/scans/sepa.json';
import rawKell from '@/data/scans/oliver_kell.json';
import rawBreakout from '@/data/scans/breakout.json';
import rawCombined from '@/data/scans/combined.json';
import rawSectorMap from '@/data/scans/sector_map.json';
import StockDetailPage from '@/components/StockDetailPage';

interface SectorMap {
  sectors: unknown[];
  ticker_to_sector: Record<string, { sector: string; subsector: string }>;
}

const sectorMap = rawSectorMap as SectorMap;

export default async function StockPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker } = await params;
  const t = ticker.toUpperCase();

  const stageEntry =
    (rawStage as { Ticker: string; Stage: string; Price: number; EMA50: number; EMA200: number; Bar_Count: number; 'ADTV(MB)': number }[])
      .find(s => s.Ticker === t) ?? null;

  const sepaEntry =
    (rawSepa as { Ticker: string; Price: number; RS_Rating: number; SMA_50: number; SMA_200: number; '52W_High': number; '%_From_High': number }[])
      .find(s => s.Ticker === t) ?? null;

  const kellEntry =
    (rawKell as { Ticker: string; Signal: string; Price: number; EMA10: number; 'Dist_EMA10_%': number; 'ADTV(MB)': number; Status: string }[])
      .find(s => s.Ticker === t) ?? null;

  const breakoutEntry =
    (rawBreakout as { Ticker: string; Price: number; Box_Low: number; 'Box_High(Break)': number; 'To_Break%': number; 'ADTV(MB)': number; 'Box_Width%': number; SMA150_Chg: number }[])
      .find(s => s.Ticker === t) ?? null;

  const combinedEntry =
    (rawCombined as { ticker: string; price: number; stage: string | null; rs_score: number; combo_score: number; sepa: boolean; kell: boolean; breakout: boolean }[])
      .find(s => s.ticker === t) ?? null;

  const sectorInfo = sectorMap.ticker_to_sector[t] ?? null;

  return (
    <StockDetailPage
      ticker={t}
      stageEntry={stageEntry}
      sepaEntry={sepaEntry}
      kellEntry={kellEntry}
      breakoutEntry={breakoutEntry}
      combinedEntry={combinedEntry}
      sectorInfo={sectorInfo}
    />
  );
}
