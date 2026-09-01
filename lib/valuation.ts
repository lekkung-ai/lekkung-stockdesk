import rawMarketStage from '@/data/scans/market_stage.json';
import { allSectorEntries, tickerToSector } from '@/lib/sectorData';

export interface MarketStageItem {
  Ticker: string;
  Price?: number | null;
  PE_Ratio?: number | null;
  PBV?: number | null;
}

export const peMap = new Map<string, number>(
  (rawMarketStage as MarketStageItem[])
    .filter((item): item is MarketStageItem & { PE_Ratio: number } => typeof item.PE_Ratio === 'number' && !isNaN(item.PE_Ratio))
    .map(item => [item.Ticker, item.PE_Ratio])
);

export const pbMap = new Map<string, number>(
  (rawMarketStage as MarketStageItem[])
    .filter((item): item is MarketStageItem & { PBV: number } => typeof item.PBV === 'number' && !isNaN(item.PBV))
    .map(item => [item.Ticker, item.PBV])
);

export function medianPE(tickers: string[]): { median: number | null; n: number } {
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

export function medianPBV(tickers: string[]): { median: number | null; n: number } {
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

const stageMap = new Map<string, MarketStageItem>(
  (rawMarketStage as MarketStageItem[]).map(item => [item.Ticker.toUpperCase(), item])
);

export interface StockValuation {
  ticker: string;
  price: number | null;
  pe: number | null;
  pbv: number | null;
  eps: number | null;
  bvps: number | null;
}

export function getStockValuation(ticker: string): StockValuation | null {
  const t = ticker.toUpperCase().trim();
  const raw = stageMap.get(t);
  if (!raw) return null;
  const price = typeof raw.Price === 'number' && !isNaN(raw.Price) && raw.Price > 0 ? raw.Price : null;
  const pe = typeof raw.PE_Ratio === 'number' && !isNaN(raw.PE_Ratio) ? raw.PE_Ratio : null;
  const pbv = typeof raw.PBV === 'number' && !isNaN(raw.PBV) ? raw.PBV : null;
  const eps = (typeof pe === 'number' && pe > 0 && typeof price === 'number' && price > 0) ? price / pe : null;
  const bvps = (typeof pbv === 'number' && pbv > 0 && typeof price === 'number' && price > 0) ? price / pbv : null;
  return { ticker: t, price, pe, pbv, eps, bvps };
}

export function getSectorMedians(ticker: string): { sector: string; secPe: number | null; secPb: number | null; n: number } | null {
  const t = ticker.toUpperCase().trim();
  const info = tickerToSector[t];
  if (!info) return null;
  const { sector, market } = info;
  const sectorEntries = allSectorEntries.filter(e => e.sector === sector && e.market === market);
  const allTickers = sectorEntries.flatMap(e => e.tickers);
  const { median: secPe, n: nPe } = medianPE(allTickers);
  const { median: secPb, n: nPb } = medianPBV(allTickers);
  return { sector, secPe, secPb, n: Math.max(nPe, nPb) };
}

// เก็บค่าที่ผ่านการกรอง (เหมือน medianPE/medianPBV เป๊ะ) แล้ว sort จากน้อยไปมาก
function collectSorted(tickers: string[], map: Map<string, number>, hi: number): number[] {
  const out: number[] = [];
  for (const ticker of tickers) {
    const v = map.get(ticker);
    if (typeof v === 'number' && !isNaN(v) && v > 0 && v <= hi) out.push(v);
  }
  return out.sort((a, b) => a - b);
}

// percentile = สัดส่วน peer ที่ค่า "ต่ำกว่า" หุ้นนี้ (PE/PBV ต่ำ = ถูก = percentile ต่ำ)
// value > ทุกตัว → 100 (สูงกว่าทั้งกลุ่ม) · value ที่ถูกกรองออก (เช่น PE>100) ก็ยังคิดได้
function pctileOf(sorted: number[], value: number | undefined): number | null {
  if (sorted.length === 0 || value == null || !Number.isFinite(value)) return null;
  const below = sorted.filter(x => x < value).length;
  return (below / sorted.length) * 100;
}

export interface SectorSpread {
  sector: string;
  peMin: number | null; peMax: number | null; pePctile: number | null; nPe: number;
  pbMin: number | null; pbMax: number | null; pbPctile: number | null; nPb: number;
}

// ช่วง min–max + percentile ของหุ้นในกลุ่ม — presentation ล้วน แยกจาก getSectorMedians
// ใช้ peMap/pbMap + sector ticker list เดียวกัน · กรองเดียวกัน (PE≤100, PBV≤20)
export function getSectorSpread(ticker: string): SectorSpread | null {
  const t = ticker.toUpperCase().trim();
  const info = tickerToSector[t];
  if (!info) return null;
  const { sector, market } = info;
  const sectorEntries = allSectorEntries.filter(e => e.sector === sector && e.market === market);
  const allTickers = sectorEntries.flatMap(e => e.tickers);

  const pe = collectSorted(allTickers, peMap, 100);
  const pb = collectSorted(allTickers, pbMap, 20);
  const myPe = peMap.get(t);
  const myPb = pbMap.get(t);

  return {
    sector,
    peMin: pe.length ? pe[0] : null,
    peMax: pe.length ? pe[pe.length - 1] : null,
    pePctile: pctileOf(pe, myPe),
    nPe: pe.length,
    pbMin: pb.length ? pb[0] : null,
    pbMax: pb.length ? pb[pb.length - 1] : null,
    pbPctile: pctileOf(pb, myPb),
    nPb: pb.length,
  };
}
