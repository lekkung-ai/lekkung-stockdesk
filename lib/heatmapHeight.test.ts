import { describe, it, expect } from 'vitest';
import { heatmapHeight, HEATMAP_MIN_H } from './heatmapHeight';

describe('heatmapHeight', () => {
  it('is unchanged (600) at the 1280px-screen width', () => {
    expect(heatmapHeight(978, 900)).toBe(600);
  });

  it('grows with the width, capped at 75% of the window height', () => {
    expect(heatmapHeight(1200, 1080)).toBe(736); // 1200 × 600/978
    expect(heatmapHeight(1830, 1080)).toBe(810); // cap 1080 × 0.75
  });

  it('never goes below the old 600px', () => {
    expect(heatmapHeight(340, 800)).toBe(HEATMAP_MIN_H); // phone
    expect(heatmapHeight(1830, 700)).toBe(HEATMAP_MIN_H); // short window: 525 cap < 600
    expect(heatmapHeight(0, 900)).toBe(HEATMAP_MIN_H);
  });
});
