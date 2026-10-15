import { useEffect, useState, type RefObject } from 'react';

// /sector market heatmap height on a full-width page: keeps the old 600px box's proportions
// (600 tall at 978 wide = the 1280px-screen layout), never below 600, never above 75% of the window height.
export const HEATMAP_MIN_H = 600;
export const HEATMAP_RATIO = 600 / 978;
export const HEATMAP_MAX_VH = 0.75;

export function heatmapHeight(width: number, viewportH: number): number {
  if (!(width > 0)) return HEATMAP_MIN_H;
  const proportional = width * HEATMAP_RATIO;
  const cap = viewportH > 0 ? viewportH * HEATMAP_MAX_VH : proportional;
  return Math.round(Math.max(HEATMAP_MIN_H, Math.min(proportional, cap)));
}

/** heatmapHeight() of the element's current width, kept up to date on resize. */
export function useHeatmapHeight(ref: RefObject<HTMLElement | null>): number {
  const [h, setH] = useState(HEATMAP_MIN_H);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setH(heatmapHeight(el.clientWidth, window.innerHeight));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [ref]);
  return h;
}
