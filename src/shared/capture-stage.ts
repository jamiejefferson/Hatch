// Chromium draws only the part of a page that sits inside the window, at the size it shows on screen.
// A screenshot of a Hatch that runs past the window's edge came back blank there, one off the canvas failed outright,
// and one on a zoomed-out canvas came back blurred. For the moment of a capture, Hatch places such a page in view at full size, unseen.
// Pure functions, unit tested.
import { toScreen, type Point, type Rect } from './geometry';

/** Where a staged page sits in canvas units, and the scale that brings it back to its real size on screen. */
export interface Stage extends Point {
  scale: number;
}

/** A canvas this close to 100% draws a page sharp enough to judge. */
const SHARP_ZOOM = 0.99;

/**
 * Where to place a page for a capture, or null when it already sits whole in the window at full size.
 * `rect` is the page in canvas units, `pan` and `zoom` the canvas view and `viewport` the canvas area on screen.
 * The staged page sits at the view's top left, at its real size or the largest that fits the view.
 */
export function captureStage(rect: Rect, pan: Point, zoom: number, viewport: { width: number; height: number }): Stage | null {
  const s = toScreen(rect, pan, zoom);
  const inside = s.x >= 0 && s.y >= 0 && s.x + s.width <= viewport.width + 0.5 && s.y + s.height <= viewport.height + 0.5;
  if (inside && zoom >= SHARP_ZOOM) return null;
  const onScreen = Math.min(1, viewport.width / rect.width, viewport.height / rect.height);
  return { x: -pan.x / zoom, y: -pan.y / zoom, scale: onScreen / zoom };
}
