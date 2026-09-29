// Heatmap colour scale: piecewise-linear between fixed anchors (finer around ±1%
// where most Thai stocks move). Beyond the ends the end colour is used.

export const NO_DATA_COLOR = '#262A33';

const ANCHORS: [number, string][] = [
  [-3, '#F23645'],
  [-2, '#C62A36'],
  [-1, '#8E2530'],
  [-0.1, '#5A2A32'],
  [0, '#3A3F4B'], // used for |%| < 0.1
  [0.1, '#214A38'],
  [1, '#1F7A4D'],
  [2, '#22A45D'],
  [3, '#2ECC71'],
];

function rgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function toHex(c: number[]): string {
  return '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** Colour for a % change. null / non-finite → "no data" colour (0.00% is a real, neutral move). */
export function heatColor(pct: number | null | undefined): string {
  if (pct == null || !Number.isFinite(pct)) return NO_DATA_COLOR;
  if (Math.abs(pct) < 0.1) return ANCHORS[4][1];
  if (pct <= ANCHORS[0][0]) return ANCHORS[0][1];
  if (pct >= ANCHORS[ANCHORS.length - 1][0]) return ANCHORS[ANCHORS.length - 1][1];
  for (let i = 0; i < ANCHORS.length - 1; i++) {
    const [x0, c0] = ANCHORS[i];
    const [x1, c1] = ANCHORS[i + 1];
    if (pct >= x0 && pct <= x1) {
      const t = (pct - x0) / (x1 - x0);
      const a = rgb(c0), b = rgb(c1);
      return toHex(a.map((v, k) => v + (b[k] - v) * t));
    }
  }
  return ANCHORS[4][1];
}

/** Text colour for a % on a dark background (sector headers / cards). null → no colour (caller hides the %). */
export function heatTextColor(pct: number | null | undefined): string | null {
  if (pct == null || !Number.isFinite(pct)) return null;
  if (pct >= 0.1) return '#2ECC71';
  if (pct <= -0.1) return '#F23645';
  return '#9AA0AC';
}
