import rawMarketStage from '@/data/scans/market_stage.json';
import { stockSectorEntries, tickerToSector, isFundTicker, fundTickers, FUND_GROUP_LABEL } from '@/lib/sectorData';

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

// Peer group for sector medians / spread: a fund is compared with the other funds of its market
// ("กองทุน & REIT"), a stock with the stocks of its sector (funds excluded, sectorData.isFundTicker)
function peerGroup(ticker: string): { sector: string; tickers: string[] } | null {
  const info = tickerToSector[ticker];
  if (!info) return null;
  const { sector, market } = info;
  if (isFundTicker(ticker)) return { sector: FUND_GROUP_LABEL, tickers: fundTickers(market) };
  return {
    sector,
    tickers: stockSectorEntries.filter(e => e.sector === sector && e.market === market).flatMap(e => e.tickers),
  };
}

export function getSectorMedians(ticker: string): { sector: string; secPe: number | null; secPb: number | null; n: number } | null {
  const t = ticker.toUpperCase().trim();
  const peers = peerGroup(t);
  if (!peers) return null;
  const { sector, tickers: allTickers } = peers;
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
  const peers = peerGroup(t);
  if (!peers) return null;
  const { sector, tickers: allTickers } = peers;

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

// ── กลุ่มเทียบของ "ราคาเหมาะสม" บนหน้า /stock/[ticker] ─────────────────────────
// ใช้กลุ่มย่อย (subsector) ก่อน เพราะ sector กว้างเกิน (เช่น Financials รวมแบงก์+ลีสซิ่ง+ประกัน n=55)
// ใช้ได้เมื่อมีสมาชิกที่มีทั้ง P/E และ P/BV ผ่านเกณฑ์กรองเดียวกับ median (PE 0–100, PBV 0–20) ≥ 5 ตัว
// ไม่ถึง → fallback เป็น sector แบบเดิม (peerGroup) · กองทุน/REIT ใช้กลุ่มกองทุนเหมือนเดิม
// getSectorMedians / getSectorSpread ด้านบนคงเดิม เพราะหน้า /valuation/pe-pbv ยังใช้แบบ sector
export const MIN_SUBSECTOR_COMPLETE_PEERS = 5;

export interface ValuationGroup {
  /** ชื่อกลุ่มที่โชว์ (subsector / sector / กองทุน & REIT) */
  label: string;
  level: 'subsector' | 'sector' | 'fund';
  tickers: string[];
}

function hasValidPe(t: string): boolean {
  const v = peMap.get(t);
  return typeof v === 'number' && !isNaN(v) && v > 0 && v <= 100;
}
function hasValidPb(t: string): boolean {
  const v = pbMap.get(t);
  return typeof v === 'number' && !isNaN(v) && v > 0 && v <= 20;
}

export function getValuationGroup(ticker: string): ValuationGroup | null {
  const t = ticker.toUpperCase().trim();
  const base = peerGroup(t);
  if (!base) return null;
  if (isFundTicker(t)) return { label: base.sector, level: 'fund', tickers: base.tickers };
  const info = tickerToSector[t];
  if (info?.subsector) {
    const subTickers = stockSectorEntries
      .filter(e => e.sector === info.sector && e.subsector === info.subsector && e.market === info.market)
      .flatMap(e => e.tickers);
    const complete = subTickers.filter(x => hasValidPe(x) && hasValidPb(x)).length;
    if (complete >= MIN_SUBSECTOR_COMPLETE_PEERS) {
      return { label: info.subsector, level: 'subsector', tickers: subTickers };
    }
  }
  return { label: base.sector, level: 'sector', tickers: base.tickers };
}

export interface ValuationGroupMedians {
  sector: string;
  level: ValuationGroup['level'];
  secPe: number | null;
  secPb: number | null;
  n: number;
  nPe: number;
  nPb: number;
}

export function getValuationGroupMedians(ticker: string): ValuationGroupMedians | null {
  const g = getValuationGroup(ticker);
  if (!g) return null;
  const { median: secPe, n: nPe } = medianPE(g.tickers);
  const { median: secPb, n: nPb } = medianPBV(g.tickers);
  return { sector: g.label, level: g.level, secPe, secPb, n: Math.max(nPe, nPb), nPe, nPb };
}

export function getValuationGroupSpread(ticker: string): SectorSpread | null {
  const t = ticker.toUpperCase().trim();
  const g = getValuationGroup(t);
  if (!g) return null;
  const pe = collectSorted(g.tickers, peMap, 100);
  const pb = collectSorted(g.tickers, pbMap, 20);
  return {
    sector: g.label,
    peMin: pe.length ? pe[0] : null,
    peMax: pe.length ? pe[pe.length - 1] : null,
    pePctile: pctileOf(pe, peMap.get(t)),
    nPe: pe.length,
    pbMin: pb.length ? pb[0] : null,
    pbMax: pb.length ? pb[pb.length - 1] : null,
    pbPctile: pctileOf(pb, pbMap.get(t)),
    nPb: pb.length,
  };
}
