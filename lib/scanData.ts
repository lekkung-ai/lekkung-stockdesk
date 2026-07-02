import rawData from '@/data/scans/combined.json';

export interface ScanEntry {
  ticker: string;
  price: number;
  sepa: boolean;
  kell: boolean;
  breakout: boolean;
  lekkung: boolean;
  oneil: boolean;
  stage: string;
  rs_score: number;
  combo_score: number;
}

type CombinedJson =
  | ScanEntry[]
  | { generated_at?: string; data: ScanEntry[] };

const combined = rawData as unknown as CombinedJson;

export const scanData: ScanEntry[] = Array.isArray(combined)
  ? combined
  : combined.data;

export const scanGeneratedAt: string | null = Array.isArray(combined)
  ? null
  : (combined.generated_at ?? null);
