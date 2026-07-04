import rawScanDays from '@/data/scans/scan_days.json';

// { scannerKey: { ticker: consecutiveDaysInList } }
export type ScanDaysMap = Record<string, Record<string, number>>;

export const scanDays = rawScanDays as ScanDaysMap;

export function daysInScan(scanner: string, ticker: string): number | null {
  return scanDays[scanner]?.[ticker] ?? null;
}
