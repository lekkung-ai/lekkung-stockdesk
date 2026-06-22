import rawData from '@/data/scans/combined.json';

export interface ScanEntry {
  ticker: string;
  price: number;
  sepa: boolean;
  kell: boolean;
  breakout: boolean;
  stage: string;
  rs_score: number;
  combo_score: number;
}

export const scanData: ScanEntry[] = rawData as ScanEntry[];
