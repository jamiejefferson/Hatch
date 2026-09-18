import type { PointerEvent as ReactPointerEvent } from 'react';

interface DragOptions {
  cursor: string;
  onMove(dx: number, dy: number): void;
  /** `moved` is false when the pointer stayed within a click's tolerance. */
  onEnd?(moved: boolean): void;
}

const CLICK_TOLERANCE = 4;

/**
 * Runs a drag under a full-window cover. Without the cover a live page under the pointer
 * takes the mouse events and the drag stalls.
 */
export function startDrag(event: ReactPointerEvent, options: DragOptions): void {
  if (event.button !== 0) return;
  event.preventDefault();
  const startX = event.clientX;
  const startY = event.clientY;
  let moved = false;

  const cover = document.createElement('div');
  cover.className = 'drag-cover';
  cover.style.cursor = options.cursor;
  document.body.appendChild(cover);

  const move = (e: PointerEvent): void => {
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!moved && Math.hypot(dx, dy) < CLICK_TOLERANCE) return;
    moved = true;
    options.onMove(dx, dy);
  };
  const end = (): void => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
    cover.remove();
    options.onEnd?.(moved);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
}
