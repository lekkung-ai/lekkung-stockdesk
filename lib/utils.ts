import type { PricePoint } from './mockData';

const MONTHS_TH = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

// Compact "ณ สแกน" label used next to chart titles — day + abbreviated Thai month, no year/time.
export function formatShortThaiDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  return `${d.getDate()} ${MONTHS_TH[d.getMonth()]}`;
}

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

// Color a P/E value by valuation band (used everywhere P/E is shown):
//   < 0      → violet (negative earnings)
//   0 – 10   → yellow (cheap / value)
//   10 – 35  → green  (fair)
//   > 35     → red    (expensive)
// Returns '' for null/undefined so callers can fall back to a default color.
export function peColor(pe: number | null | undefined): string {
  if (pe == null) return '';
  if (pe < 0) return '#AA00FF';
  if (pe < 10) return '#F9C942';
  if (pe <= 35) return '#1D9E75';
  return '#E24B4A';
}

// Color a ROE value (already in percent):
//   < 0      → red    (loss-making)
//   0 – 15   → yellow (modest returns)
//   > 15     → green  (strong returns)
// Returns '' for null/undefined so callers can fall back to a default color.
export function roeColor(roe: number | null | undefined): string {
  if (roe == null) return '';
  if (roe < 0) return '#E24B4A';
  if (roe <= 15) return '#F9C942';
  return '#1D9E75';
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
