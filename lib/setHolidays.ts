// คัดลอกจาก lekkung-data-engine tools/core/set_holidays.py — แก้ที่นั่นต้องแก้ที่นี่ด้วย
// (วันหยุดทำการ SET ที่ประกาศไว้ล่วงหน้า · ที่มา 2026: SET Calendar 2026 + วันหยุดพิเศษใน SPECIAL)
// ปีที่ไม่มีในรายการ = ยังไม่มีปฏิทิน: isSetTradingDay ใช้แค่ จันทร์–ศุกร์ (ดู hasHolidayCalendar)

const HOLIDAYS: Record<number, string[]> = {
  2026: [
    '01-01', // วันขึ้นปีใหม่
    '01-02', // วันหยุดพิเศษเพิ่มเติม
    '03-03', // วันมาฆบูชา
    '04-06', // วันจักรี
    '04-13', '04-14', '04-15', // สงกรานต์
    '05-01', // วันแรงงานแห่งชาติ
    '05-04', // วันฉัตรมงคล
    '05-13', // วันพืชมงคล
    '06-01', // ชดเชยวันวิสาขบูชา
    '06-03', // วันเฉลิมพระชนมพรรษาสมเด็จพระราชินีสุทิดา
    '07-28', // วันเฉลิมพระชนมพรรษา ร.10
    '07-29', // วันอาสาฬหบูชา
    '07-30', // วันเข้าพรรษา
    '08-12', // วันแม่
    '10-13', // วันคล้ายวันสวรรคต ร.9
    '10-23', // วันปิยมหาราช
    '12-07', // ชดเชยวันคล้ายวันพระบรมราชสมภพ ร.9
    '12-10', // วันรัฐธรรมนูญ
    '12-31', // วันสิ้นปี
  ],
};

// วันหยุดพิเศษที่ประกาศหลังปฏิทินออก (set_holidays.py: SPECIAL)
const SPECIAL = ['2026-10-16'];

/** มีรายการวันหยุดของปีนี้ไหม (ไม่มี = ผลที่คิดจากวันหยุดอาจคลาด) */
export function hasHolidayCalendar(year: number): boolean {
  return year in HOLIDAYS;
}

/** วันหยุด SET ตามรายการ (iso = 'YYYY-MM-DD') — ไม่รวมเสาร์–อาทิตย์ */
export function isSetHoliday(iso: string): boolean {
  const year = Number(iso.slice(0, 4));
  return (HOLIDAYS[year] ?? []).includes(iso.slice(5)) || SPECIAL.includes(iso);
}

/** วันทำการ SET = จันทร์–ศุกร์ และไม่อยู่ในรายการวันหยุด */
export function isSetTradingDay(iso: string): boolean {
  const wd = new Date(iso + 'T00:00:00Z').getUTCDay();
  return wd !== 0 && wd !== 6 && !isSetHoliday(iso);
}
