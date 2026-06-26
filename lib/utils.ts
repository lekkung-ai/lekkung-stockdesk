import type { PricePoint } from './mockData';

const MONTHS_TH = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

export function formatThaiDate(iso: string | null | undefined): string {
  if (!iso) return 'ไม่ทราบวันที่อัปเดต';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return 'ไม่ทราบวันที่อัปเดต';
    const day = d.getDate();
    const month = MONTHS_TH[d.getMonth()];
    const year = d.getFullYear() + 543;
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${day} ${month} ${year} เวลา ${hh}:${mm} น.`;
  } catch {
    return 'ไม่ทราบวันที่อัปเดต';
  }
}

export function calculateSMA(data: PricePoint[], period: number): PricePoint[] {
  return data
    .map((point, i) => {
      if (i < period - 1) return null;
      const avg = data.slice(i - period + 1, i + 1).reduce((s, p) => s + p.value, 0) / period;
      return { time: point.time, value: parseFloat(avg.toFixed(2)) };
    })
    .filter((p): p is PricePoint => p !== null);
}
