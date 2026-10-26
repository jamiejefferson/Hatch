// Turns a run of sideways wheel events into one back or forward swipe, as a two-finger swipe works in Safari and Chrome.

/** A pause this long between wheel events ends a gesture. */
export const SWIPE_GAP_MS = 250;
/** How far, in pixels of scroll, a gesture travels sideways before it counts as a swipe. */
export const SWIPE_DISTANCE = 140;

export type SwipeDirection = 'back' | 'forward';

/**
 * Feed it each wheel event of a page. It answers once per gesture, when the fingers have moved far enough sideways
 * over something that cannot scroll that way. A scroll the page uses, or one that is mostly up and down, never counts.
 */
export class SwipeTracker {
  private travel = 0;
  private last = -Infinity;
  private done = false;

  feed(deltaX: number, deltaY: number, now: number, canScroll: boolean): SwipeDirection | null {
    if (now - this.last > SWIPE_GAP_MS) {
      this.travel = 0;
      this.done = false;
    }
    this.last = now;
    if (this.done) return null;
    // A gesture that the page scrolls, or that leans up or down, belongs to the page.
    if (canScroll || Math.abs(deltaX) < Math.abs(deltaY) * 2) {
      this.travel = 0;
      return null;
    }
    this.travel += deltaX;
    if (Math.abs(this.travel) < SWIPE_DISTANCE) return null;
    this.done = true;
    // Fingers that move right scroll the page left, which takes the user back.
    return this.travel < 0 ? 'back' : 'forward';
  }
}
