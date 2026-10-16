import raw from '@/data/scans/lekkung_daytrade.json';

// data/scans/lekkung_daytrade.json — เขียนตรงโดย data_engine tools/scanner/scan_lekkung_daytrade.py
// (TradingView Screener "Lekkung Scan") ไม่ผ่าน convert_to_json จึงไม่มี key ใน generated_at.json —
// เวลาของข้อมูลอยู่ในไฟล์เอง (generated_at). ทุก field ตัวเลข/ข้อความเป็น nullable (API คืน null ได้)
export interface LekkungDaytradeEntry {
  Ticker: string;
  Name: string | null;
  Close: number | null;
  Change_Pct: number | null;       // %
  Volume: number | null;           // หุ้น
  Rel_Volume: number | null;       // Volume ÷ ค่าเฉลี่ย 10 วัน (เท่า)
  Market_Cap: number | null;       // บาท
  PE_Ratio: number | null;         // TTM
  EPS_TTM: number | null;          // บาท/หุ้น (diluted)
  EPS_Growth_YoY: number | null;   // % (TTM เทียบปีก่อน)
  Div_Yield: number | null;        // % (current)
  RSI7: number | null;
  ADX: number | null;              // ADX 14
  EMA200: number | null;
  Pct_Above_EMA200: number | null; // % = (Close / EMA200 − 1) × 100
  Tech_Rating: number | null;      // TradingView Recommend.All: −1..1 · ≥ 0.1 Buy · > 0.5 Strong Buy
  Analyst_Rating: string | null;   // ความเห็นนักวิเคราะห์ (StrongBuy | Buy | Neutral | Sell | StrongSell | NoRating)
  Avg_Volume_10D: number | null;
}

interface LekkungDaytradeFile {
  generated_at: string | null;
  universe_count: number | null;
  total_count: number | null;
  data: LekkungDaytradeEntry[];
}

const file = raw as unknown as LekkungDaytradeFile;

export const lekkungDaytradeData: LekkungDaytradeEntry[] = Array.isArray(file.data) ? file.data : [];
export const lekkungDaytradeGeneratedAt: string | null = file.generated_at ?? null;
export const lekkungDaytradeUniverse: number | null = file.universe_count ?? null;

// Tech Rating (Recommend.All) → ป้ายเดียวกับ TradingView: > 0.5 Strong Buy · 0.1–0.5 Buy · −0.1–0.1 Neutral · ...
export function techRatingLabel(v: number | null): string | null {
  if (v == null) return null;
  if (v > 0.5) return 'Strong Buy';
  if (v >= 0.1) return 'Buy';
  if (v > -0.1) return 'Neutral';
  if (v >= -0.5) return 'Sell';
  return 'Strong Sell';
}

const ANALYST_LABEL: Record<string, string> = {
  StrongBuy: 'Strong Buy', Buy: 'Buy', Neutral: 'Neutral', Sell: 'Sell', StrongSell: 'Strong Sell',
};
// อันดับสำหรับ sort — NoRating / ไม่รู้จัก = null (ไปท้ายทั้ง asc/desc)
const ANALYST_RANK: Record<string, number> = { StrongBuy: 5, Buy: 4, Neutral: 3, Sell: 2, StrongSell: 1 };

export function analystRatingLabel(v: string | null): string | null {
  return v != null ? (ANALYST_LABEL[v] ?? null) : null;
}

export function analystRatingRank(v: string | null): number | null {
  return v != null ? (ANALYST_RANK[v] ?? null) : null;
}
