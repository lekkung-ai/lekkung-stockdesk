import type { PricePoint } from './mockData';

export function calculateSMA(data: PricePoint[], period: number): PricePoint[] {
  return data
    .map((point, i) => {
      if (i < period - 1) return null;
      const avg = data.slice(i - period + 1, i + 1).reduce((s, p) => s + p.value, 0) / period;
      return { time: point.time, value: parseFloat(avg.toFixed(2)) };
    })
    .filter((p): p is PricePoint => p !== null);
}
