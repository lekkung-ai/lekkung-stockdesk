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
  To_Break: number;
  'ADTV(MB)': number;
  Box_Width: number;
  SMA150_Chg: number;
}

function pct(v: unknown): number {
  return typeof v === 'string' ? parseFloat(v.replace('%', '')) : (v as number);
}

function parseSepa(raw: unknown[]): SepaEntry[] {
  return raw.map(r => {
    const e = r as Record<string, unknown>;
    return { ...e, '%_From_High': pct(e['%_From_High']) } as SepaEntry;
  });
}

function parseBreakout(raw: unknown[]): BreakoutEntry[] {
  return raw.map(r => {
    const e = r as Record<string, unknown>;
    return { ...e, To_Break: pct(e['To_Break']), Box_Width: pct(e['Box_Width']) } as BreakoutEntry;
  });
}

export const sepaData: SepaEntry[] = parseSepa(rawSepa as unknown[]);
export const kellData: KellEntry[] = rawKell as KellEntry[];
export const stageData: StageEntry[] = rawStage as StageEntry[];
export const breakoutData: BreakoutEntry[] = parseBreakout(rawBreakout as unknown[]);
