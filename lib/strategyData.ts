import rawSepa from '@/data/scans/sepa.json';
import rawKell from '@/data/scans/oliver_kell.json';
import rawStage from '@/data/scans/market_stage.json';
import rawBreakout from '@/data/scans/breakout.json';

export interface SepaEntry {
  Ticker: string;
  Price: number;
  RS_Rating: number;
  SMA_50: number;
  SMA_200: number;
  '52W_High': number;
  '%_From_High': number;
}

export interface KellEntry {
  Ticker: string;
  Signal: 'EMAC Buy' | 'Trend Riding';
  Price: number;
  EMA10: number;
  'Dist_EMA10_%': number;
  'ADTV(MB)': number;
  Status: string;
}

export interface StageEntry {
  Ticker: string;
  Stage: string;
  Price: number;
  EMA50: number;
  EMA200: number;
  Bar_Count: number;
  'ADTV(MB)': number;
}

export interface BreakoutEntry {
  Ticker: string;
  Price: number;
  Box_Low: number;
  'Box_High(Break)': number;
  'To_Break%': number;
  'ADTV(MB)': number;
  'Box_Width%': number;
  SMA150_Chg: number;
}

export const sepaData: SepaEntry[] = rawSepa as SepaEntry[];
export const kellData: KellEntry[] = rawKell as KellEntry[];
export const stageData: StageEntry[] = rawStage as StageEntry[];
export const breakoutData: BreakoutEntry[] = rawBreakout as BreakoutEntry[];
