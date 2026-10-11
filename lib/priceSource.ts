// Where a displayed price comes from — one wording for every page (tooltips and the small line under a table).
import { formatBangkokHHMM } from './utils';

/** TradingView scanner (/api/prices, /api/market-quotes): delayed 15 minutes. */
export function tvPriceNote(fetchedAt?: string | null): string {
  const t = formatBangkokHHMM(fetchedAt);
  return `ราคา TradingView ล่าช้า 15 นาที${t ? ` · อัปเดต ${t}` : ''}`;
}

/** Price column that shows the live TradingView price and falls back to the scan close (faded). */
export function livePriceTitle(fetchedAt?: string | null): string {
  return `${tvPriceNote(fetchedAt)} · ตัวเลขสีจาง = ราคาปิด ณ วันสแกน (ดึงราคาสดไม่ได้)`;
}
