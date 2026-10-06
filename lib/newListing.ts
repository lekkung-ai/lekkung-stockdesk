// หุ้นจดทะเบียนใหม่ (IPO) จาก combined.json: History_Days (data-engine convert_to_json.py).
// ป้ายเฉพาะหุ้นที่ข้อมูลยังไม่ถึงเกณฑ์ประวัติเต็มของ data-engine (FULL_HISTORY_MIN_ROWS = 200 วัน) —
// หุ้นที่มี 200–251 วัน (มี RS / stage ครบแล้ว) ไม่ถูกเรียกว่า IPO แม้ Is_New_Listing (< 252) จะเป็น true
// ไฟล์เก่าที่ยังไม่มี field → ไม่มีป้าย. Stage "IPO" = ข้อมูลยังไม่พอคำนวณ stage.

export const IPO_STAGE = 'IPO';
/** = FULL_HISTORY_MIN_ROWS ใน data-engine config.py */
export const IPO_MAX_HISTORY_DAYS = 200;

export interface NewListingFields {
  ticker?: string;
  History_Days?: number | null;
  Is_New_Listing?: boolean | null;
}

/** ticker → History_Days ของหุ้นที่มีข้อมูล 1 … IPO_MAX_HISTORY_DAYS-1 วัน */
export function buildNewListingMap(rows: NewListingFields[] | null | undefined): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows ?? []) {
    const days = r?.History_Days;
    if (r?.ticker && typeof days === 'number' && Number.isFinite(days) && days > 0 && days < IPO_MAX_HISTORY_DAYS) {
      out.set(r.ticker, days);
    }
  }
  return out;
}

/** "IPO · 26 วัน" */
export function newListingLabel(days: number): string {
  return `IPO · ${days} วัน`;
}
