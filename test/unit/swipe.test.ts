import { describe, expect, it } from 'vitest';
import { SWIPE_GAP_MS, SwipeTracker } from '@shared/swipe';

const run = (tracker: SwipeTracker, events: [number, number][], canScroll = false, start = 0) =>
  events.map(([dx, dy], i) => tracker.feed(dx, dy, start + i * 16, canScroll)).filter(Boolean);

describe('two-finger swipe', () => {
  it('goes back when the fingers move right, and forward when they move left', () => {
    expect(run(new SwipeTracker(), Array(10).fill([-20, 0]))).toEqual(['back']);
    expect(run(new SwipeTracker(), Array(10).fill([20, 1]))).toEqual(['forward']);
  });

  it('answers once per gesture, momentum included', () => {
    const tracker = new SwipeTracker();
    expect(run(tracker, Array(40).fill([-20, 0]))).toEqual(['back']);
    // A new gesture after a pause counts again.
    expect(run(tracker, Array(10).fill([-20, 0]), false, 40 * 16 + SWIPE_GAP_MS + 1)).toEqual(['back']);
  });

  it('leaves a sideways scroll the page can use to the page', () => {
    expect(run(new SwipeTracker(), Array(20).fill([-20, 0]), true)).toEqual([]);
  });

  it('ignores a scroll that leans up or down', () => {
    expect(run(new SwipeTracker(), Array(20).fill([-20, -15]))).toEqual([]);
  });

  it('ignores a short nudge', () => {
    expect(run(new SwipeTracker(), Array(3).fill([-20, 0]))).toEqual([]);
  });
});
