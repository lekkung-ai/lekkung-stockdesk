import rawSparklines from '@/data/scans/sparklines.json';

interface SparklinesJson {
  generated_at: string;
  days: number;
  data: Record<string, number[]>;
}

const sparklines = rawSparklines as unknown as SparklinesJson;

export const sparklineMap: Record<string, number[]> = sparklines.data;
export const sparklineDays: number = sparklines.days;
