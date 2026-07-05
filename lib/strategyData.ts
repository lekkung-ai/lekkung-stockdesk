import rawSepa from '@/data/scans/sepa.json';
import rawKell from '@/data/scans/oliver_kell.json';
import rawStage from '@/data/scans/market_stage.json';
import rawBreakout from '@/data/scans/breakout.json';
import rawLekkung from '@/data/scans/lekkung.json';
import rawOneil from '@/data/scans/oneil.json';
import rawWeinstein from '@/data/scans/weinstein.json';

export interface LekkungEntry {
  Ticker: string;
  Close: number;
  PE_Ratio: number;
  ROE: number;
  Revenue_Growth_YoY: number;
  Profit_Growth_YoY: number;
  NetProfit_Growth_QoQY: number;
  ADTV_MB: number;
  Market_Cap: number;
  '52W_High': number;
  '52W_Low': number;
}

export interface WeinsteinEntry {
  Ticker: string;
  Stage: string;
  Price: number;
  MA30: number;
  MA10: number;
  Vol10: number;
  'Slope_4W_%': number;
  RS_Rating: number;
  'ADTV(MB)': number;
  PE_Ratio: number;
  ROE: number;
  '52W_High': number;
  '52W_Low': number;
}

export interface OneilEntry {
  Ticker: string;
  Price: number;
  '52W_High': number;
  '52W_Low': number;
  '%_From_52W_High': number;
  'ADTV(MB)': number;
  PE_Ratio: number;
  ROE: number;
  Profit_Growth_YoY: number;
  RS_Rating: number;
  Market_Cap: number;
}

export interface SepaEntry {
  Ticker: string;
  Price: number;
  RS_Rating: number;
  SMA_50: number;
  SMA_200: number;
  '52W_High': number;
  '%_From_High': number;
  // Minervini Trend Template — 8 เงื่อนไข (Trade Like a Stock Market Wizard, p.79)
  T1_Price_Above_150_200?: boolean;
  T2_SMA50_Above_150_200?: boolean;
  T3_SMA150_Above_SMA200?: boolean;
  T4_SMA200_Trending_Up?: boolean;
  T5_Price_Above_SMA50?: boolean;
  T6_Above_52wLow_30pct?: boolean;
  T7_Within_52wHigh_25pct?: boolean;
  T8_RS_At_Least_70?: boolean;
  // null = ไม่มีข้อมูลพอตัดสิน, true/false = ผ่าน/ไม่ผ่าน fundamental filter
  Fundamental_Pass?: boolean | null;
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
export const lekkungData: LekkungEntry[] = rawLekkung as LekkungEntry[];
export const oneilData: OneilEntry[] = rawOneil as OneilEntry[];
export const weinsteinData: WeinsteinEntry[] = rawWeinstein as WeinsteinEntry[];
