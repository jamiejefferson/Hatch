import { describe, expect, it } from 'vitest';
import { captureStage } from '../../src/shared/capture-stage';
import { toScreen } from '../../src/shared/geometry';

const viewport = { width: 1200, height: 800 };
const page = { x: 100, y: 20, width: 960, height: 752 };

describe('captureStage', () => {
  it('leaves a page alone that sits whole in the window at full size', () => {
    expect(captureStage(page, { x: 0, y: 0 }, 1, viewport)).toBeNull();
  });

  it('stages a page on a zoomed-out canvas at its real size', () => {
    const stage = captureStage(page, { x: 20, y: 30 }, 0.25, viewport)!;
    // The page lands at the view's top left, and its scale times the canvas zoom is 1.
    const screen = toScreen({ x: stage.x, y: stage.y, width: 0, height: 0 }, { x: 20, y: 30 }, 0.25);
    expect(screen.x).toBeCloseTo(0);
    expect(screen.y).toBeCloseTo(0);
    expect(stage.scale * 0.25).toBeCloseTo(1);
  });

  it('stages a page that runs past the window or sits off it', () => {
    expect(captureStage(page, { x: 400, y: 0 }, 1, viewport)).not.toBeNull();
    expect(captureStage(page, { x: -3000, y: 0 }, 1, viewport)).not.toBeNull();
  });

  it('shrinks a page larger than the view until it fits', () => {
    const big = { x: 0, y: 0, width: 2400, height: 1000 };
    const stage = captureStage(big, { x: 0, y: 0 }, 1, viewport)!;
    expect(stage.scale).toBeCloseTo(0.5);
  });
});
