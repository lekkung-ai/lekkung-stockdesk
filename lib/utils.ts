import type { PricePoint } from './mockData';

const MONTHS_TH = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

// Compact "ณ สแกน" label used next to chart titles — day + abbreviated Thai month, no year/time.
export function formatShortThaiDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  const p = bangkokParts(d);
  return `${p.day} ${MONTHS_TH[p.month - 1]}`;
}

// Pinned to Asia/Bangkok so the label is identical on Vercel (UTC) and in the browser —
// d.getHours()/getDate() use the runtime's local zone and shift pipeline times by 7h on UTC.
const BANGKOK_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Bangkok',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Calendar fields of an instant in Asia/Bangkok (month 1–12) — never the machine's own zone. */
export function bangkokParts(d: Date): { year: number; month: number; day: number; hour: number; minute: number } {
  const p: Record<string, string> = {};
  for (const { type, value } of BANGKOK_PARTS.formatToParts(d)) p[type] = value;
  return { year: Number(p.year), month: Number(p.month), day: Number(p.day), hour: Number(p.hour), minute: Number(p.minute) };
}

/** 'YYYY-MM-DD' of an instant (default: now) in Asia/Bangkok. */
export function bangkokDateKey(t: number | Date = Date.now()): string {
  const p = bangkokParts(typeof t === 'number' ? new Date(t) : t);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** "HH:MM" of a Date in Asia/Bangkok. */
export function bangkokHHMM(d: Date): string {
  const p = bangkokParts(d);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

/** "HH:MM" in Asia/Bangkok (same on a UTC server and in the browser), '' when the time is unknown. */
export function formatBangkokHHMM(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : bangkokHHMM(d);
}

export function formatThaiDate(iso: string | null | undefined): string {
  if (!iso) return 'ไม่ทราบวันที่อัปเดต';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return 'ไม่ทราบวันที่อัปเดต';
    const p: Record<string, string> = {};
    for (const { type, value } of BANGKOK_PARTS.formatToParts(d)) p[type] = value;
    const day = Number(p.day);
    const month = MONTHS_TH[Number(p.month) - 1];
    const year = Number(p.year) + 543;
    const hh = p.hour.padStart(2, '0');
    const mm = p.minute.padStart(2, '0');
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

// Join symbols with unencoded commas (tickers themselves URL-encoded), ensuring
// consistent GET /api/prices?symbols=... query parameter formatting across all components.
export function formatSymbolsQuery(tickers: string[]): string {
  return tickers.map(t => encodeURIComponent(t)).join(',');
}

