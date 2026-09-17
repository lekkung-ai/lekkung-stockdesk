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
  weinstein?: boolean;
  growth_yoy?: number | null;
  growth_qoq?: number | null;
  // true ถ้า ticker นี้ถูก flag ADTV ต่ำกว่า floor (10 ลบ./วัน) ใน sepa หรือ kell
  // list ที่มันปรากฏ — combo_score ยังนับรวมตามปกติ (confluence คนละแกนกับ
  // liquidity) field นี้แค่ให้ UI ติด marker ได้ — optional กัน JSON เก่า
  Low_Liquidity?: boolean;
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
