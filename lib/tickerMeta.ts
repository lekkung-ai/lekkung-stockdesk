import rsRaw from '@/data/scans/rs_ranking.json';
import stageRaw from '@/data/scans/stage_all.json';

const rsMap = new Map<string, number>(
  (rsRaw as { Ticker: string; RS_Rating: number }[]).map(r => [r.Ticker, r.RS_Rating]),
);
const stageMap = new Map<string, string>(
  (stageRaw as { Ticker: string; Stage: string }[]).map(r => [r.Ticker, r.Stage]),
);

export const getRS = (ticker: string): number | null => rsMap.get(ticker) ?? null;
export const getStage = (ticker: string): string | null => stageMap.get(ticker) ?? null;
