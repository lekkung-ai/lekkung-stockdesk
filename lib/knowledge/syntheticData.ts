// Deterministic synthetic OHLCV generator for the Knowledge Base page.
// Every pattern is described as a sequence of "segments" (trend/volatility/
// volume behaviour over N bars); the same seed always produces the exact
// same bars, so charts don't reshuffle on every render.

export interface OhlcvBar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Segment {
  bars: number;
  trendPct: number; // total price drift over the segment, e.g. +30 = +30% end vs start
  volatilityPct: number; // daily noise amplitude as % of price
  volumeBase: number; // baseline volume level (relative units, not baht)
  volumeTrendPct?: number; // drift of the volume baseline across the segment (-60 = dries up to 40%)
  volumeSpikeAt?: number; // bar index *within this segment* that gets a volume spike
  volumeSpikeMult?: number; // multiplier applied at volumeSpikeAt
}

export interface ShapeConfig {
  seed: number;
  startPrice: number;
  segments: Segment[];
}

export interface MarkerConfig {
  atBar: number; // absolute bar index (0-based) in the generated series
  label: string;
  color: string;
  position: 'aboveBar' | 'belowBar';
}

// mulberry32 — small, fast, deterministic PRNG (same seed -> same sequence).
function mulberry32(seed: number) {
  let a = seed;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface GeneratedSeries {
  bars: OhlcvBar[];
  segmentBoundaries: number[]; // bar index where each segment ends (exclusive)
}

export function generateSeries(config: ShapeConfig): GeneratedSeries {
  const rand = mulberry32(config.seed);
  const bars: OhlcvBar[] = [];
  const segmentBoundaries: number[] = [];
  let price = config.startPrice;
  let barIdx = 0;

  const startDate = new Date('2024-01-01T00:00:00Z');

  for (const seg of config.segments) {
    const segStartPrice = price;
    const segEndPrice = segStartPrice * (1 + seg.trendPct / 100);

    for (let i = 0; i < seg.bars; i++) {
      const progress = seg.bars > 1 ? i / (seg.bars - 1) : 1;
      const basePrice = segStartPrice + (segEndPrice - segStartPrice) * progress;
      const noise = (rand() - 0.5) * 2 * (seg.volatilityPct / 100) * basePrice;

      const open = price;
      let close = basePrice + noise;
      if (close <= 0.05) close = 0.05;
      const high = Math.max(open, close) * (1 + rand() * (seg.volatilityPct / 200));
      const low = Math.min(open, close) * (1 - rand() * (seg.volatilityPct / 200));

      const volTrendMult = 1 + ((seg.volumeTrendPct ?? 0) / 100) * progress;
      let volume = seg.volumeBase * volTrendMult * (0.7 + rand() * 0.6);
      if (seg.volumeSpikeAt === i) volume *= seg.volumeSpikeMult ?? 2.5;

      const d = new Date(startDate);
      d.setUTCDate(d.getUTCDate() + barIdx);

      bars.push({
        time: d.toISOString().slice(0, 10),
        open: round2(open),
        high: round2(high),
        low: round2(low),
        close: round2(close),
        volume: Math.round(volume),
      });

      price = close;
      barIdx++;
    }
    segmentBoundaries.push(barIdx);
  }

  return { bars, segmentBoundaries };
}

// Same EMA formula as components/StockChart.tsx (seeded from a plain SMA of
// the first `period` closes, then standard EWMA) — kept in sync so the
// Knowledge Base chart's EMA lines mean the same thing as the real one.
export function calcEMA(bars: OhlcvBar[], period: number): { time: string; value: number }[] {
  if (bars.length < period) return [];
  const k = 2 / (period + 1);
  const result: { time: string; value: number }[] = [];
  let ema = bars.slice(0, period).reduce((s, d) => s + d.close, 0) / period;
  result.push({ time: bars[period - 1].time, value: round2(ema) });
  for (let i = period; i < bars.length; i++) {
    ema = bars[i].close * k + ema * (1 - k);
    result.push({ time: bars[i].time, value: round2(ema) });
  }
  return result;
}
