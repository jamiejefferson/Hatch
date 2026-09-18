// Canvas maths. Canvas pixels map to screen pixels with: screen = canvas * zoom + pan.
import type { Hatch } from './types';

export interface Point { x: number; y: number }
export interface Rect extends Point { width: number; height: number }

export const ZOOM_STEPS = [0.1, 0.25, 0.33, 0.4, 0.5, 0.62, 0.75, 1, 1.25, 1.5, 2];
export const MIN_ZOOM = ZOOM_STEPS[0]!;
export const MAX_ZOOM = ZOOM_STEPS.at(-1)!;
export const HATCH_GAP = 60;

export const clampZoom = (z: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

export function nextZoomStep(zoom: number, direction: 1 | -1): number {
  if (direction === 1) return ZOOM_STEPS.find((s) => s > zoom + 0.001) ?? MAX_ZOOM;
  return [...ZOOM_STEPS].reverse().find((s) => s < zoom - 0.001) ?? MIN_ZOOM;
}

/** The pan that keeps the canvas point under `anchor` (screen pixels) still while the zoom changes. */
export function zoomAround(pan: Point, zoom: number, nextZoom: number, anchor: Point): Point {
  const canvasX = (anchor.x - pan.x) / zoom;
  const canvasY = (anchor.y - pan.y) / zoom;
  return { x: anchor.x - canvasX * nextZoom, y: anchor.y - canvasY * nextZoom };
}

export function toScreen(rect: Rect, pan: Point, zoom: number): Rect {
  return { x: rect.x * zoom + pan.x, y: rect.y * zoom + pan.y, width: rect.width * zoom, height: rect.height * zoom };
}

/** A new Hatch sits to the right of the rightmost one, level with the top row. */
export function placeNewHatch(hatches: Pick<Hatch, 'x' | 'y' | 'width'>[]): Point {
  if (hatches.length === 0) return { x: 0, y: 0 };
  const right = Math.max(...hatches.map((h) => h.x + h.width));
  const top = Math.min(...hatches.map((h) => h.y));
  return { x: right + HATCH_GAP, y: top };
}

/** The pan that brings `rect` fully into a viewport, moving as little as possible. */
export function panToReveal(rect: Rect, pan: Point, zoom: number, viewport: { width: number; height: number }, margin = 48): Point {
  const s = toScreen(rect, pan, zoom);
  let { x, y } = pan;
  if (s.width + margin * 2 > viewport.width || s.x < margin) x += margin - s.x;
  else if (s.x + s.width > viewport.width - margin) x -= s.x + s.width - (viewport.width - margin);
  if (s.height + margin * 2 > viewport.height || s.y < margin) y += margin - s.y;
  else if (s.y + s.height > viewport.height - margin) y -= s.y + s.height - (viewport.height - margin);
  return { x, y };
}
