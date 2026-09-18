import { describe, expect, it } from 'vitest';
import { nextZoomStep, panToReveal, placeNewHatch, toScreen, zoomAround } from '@shared/geometry';

describe('canvas maths', () => {
  it('maps a page rectangle to the screen at several zooms', () => {
    const rect = { x: 100, y: 50, width: 960, height: 752 };
    expect(toScreen(rect, { x: 40, y: 32 }, 0.4)).toEqual({ x: 80, y: 52, width: 384, height: 300.8 });
    expect(toScreen(rect, { x: 0, y: 0 }, 1)).toEqual(rect);
  });

  it('keeps the point under the pointer still while zooming', () => {
    const pan = { x: 40, y: 32 };
    const anchor = { x: 500, y: 300 };
    const before = { x: (anchor.x - pan.x) / 0.62, y: (anchor.y - pan.y) / 0.62 };
    const next = zoomAround(pan, 0.62, 1, anchor);
    expect(before.x * 1 + next.x).toBeCloseTo(anchor.x);
    expect(before.y * 1 + next.y).toBeCloseTo(anchor.y);
  });

  it('steps the zoom through the fixed stops', () => {
    expect(nextZoomStep(0.62, 1)).toBe(0.75);
    expect(nextZoomStep(0.62, -1)).toBe(0.5);
    expect(nextZoomStep(0.7, -1)).toBe(0.62);
    expect(nextZoomStep(2, 1)).toBe(2);
    expect(nextZoomStep(0.1, -1)).toBe(0.1);
  });

  it('places a new Hatch to the right of the rightmost one', () => {
    expect(placeNewHatch([])).toEqual({ x: 0, y: 0 });
    expect(placeNewHatch([{ x: 0, y: 20, width: 960 }, { x: 1020, y: 0, width: 768 }])).toEqual({ x: 1848, y: 0 });
  });

  it('pans only as far as a hidden Hatch needs', () => {
    const viewport = { width: 960, height: 700 };
    const visible = { x: 0, y: 0, width: 400, height: 300 };
    expect(panToReveal(visible, { x: 100, y: 100 }, 1, viewport)).toEqual({ x: 100, y: 100 });
    const offRight = { x: 1200, y: 0, width: 400, height: 300 };
    const pan = panToReveal(offRight, { x: 100, y: 100 }, 1, viewport);
    expect(toScreen(offRight, pan, 1).x + 400).toBe(960 - 48);
  });
});
