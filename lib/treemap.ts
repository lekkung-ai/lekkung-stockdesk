// Squarified treemap (Bruls, Huizing, van Wijk). Pure, no dependencies.

export interface TreemapRect<T> {
  item: T;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Sized<T> {
  item: T;
  value: number;
}

function worst(row: number[], side: number): number {
  const sum = row.reduce((a, b) => a + b, 0);
  const max = Math.max(...row);
  const min = Math.min(...row);
  const s2 = side * side;
  return Math.max((s2 * max) / (sum * sum), (sum * sum) / (s2 * min));
}

/** Lay `items` (value > 0) out inside the box; areas are proportional to value. */
export function squarify<T>(
  items: { item: T; value: number }[],
  x: number,
  y: number,
  w: number,
  h: number,
): TreemapRect<T>[] {
  const data: Sized<T>[] = items
    .filter(i => Number.isFinite(i.value) && i.value > 0)
    .sort((a, b) => b.value - a.value);
  const out: TreemapRect<T>[] = [];
  const total = data.reduce((a, b) => a + b.value, 0);
  if (data.length === 0 || total <= 0 || w <= 0 || h <= 0) return out;

  // Scale values so they sum to the area
  const scale = (w * h) / total;
  const areas = data.map(d => d.value * scale);

  let cx = x, cy = y, cw = w, ch = h;
  let i = 0;
  while (i < data.length) {
    const side = Math.min(cw, ch);
    let row = [areas[i]];
    let j = i + 1;
    while (j < data.length && worst([...row, areas[j]], side) <= worst(row, side)) {
      row.push(areas[j]);
      j++;
    }
    const rowSum = row.reduce((a, b) => a + b, 0);
    if (cw >= ch) {
      // column on the left, stacked vertically
      const colW = rowSum / ch;
      let yy = cy;
      row.forEach((a, k) => {
        const hh = a / colW;
        out.push({ item: data[i + k].item, x: cx, y: yy, w: colW, h: hh });
        yy += hh;
      });
      cx += colW;
      cw -= colW;
    } else {
      const rowH = rowSum / cw;
      let xx = cx;
      row.forEach((a, k) => {
        const ww = a / rowH;
        out.push({ item: data[i + k].item, x: xx, y: cy, w: ww, h: rowH });
        xx += ww;
      });
      cy += rowH;
      ch -= rowH;
    }
    i = j;
    row = [];
  }
  return out;
}
