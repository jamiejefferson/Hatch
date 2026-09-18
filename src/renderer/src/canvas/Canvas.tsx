import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { toScreen, type Point, type Rect } from '@shared/geometry';
import { HEADER_OFFSET } from '@shared/workspace';
import type { Hatch, Tab } from '@shared/types';
import { PlusIcon } from '../icons';
import { actions, fitHatch, useStore } from '../state/store';
import { startDrag } from './drag';
import { FirstRun } from '../shell/Connect';
import { HatchOverlay } from './HatchOverlay';
import { HatchPage } from './HatchPage';

/** Stands for the empty canvas in the double-tap state. */
const EMPTY = 'canvas';

interface View {
  pan: Point;
  zoom: number;
}

/** Fit to view overrides the tab's pan and zoom without losing them. */
function viewFor(tab: Tab, fit: Hatch | null): View {
  if (!fit) return { pan: tab.pan, zoom: tab.zoom };
  return { pan: { x: -fit.x, y: -fit.y }, zoom: 1 };
}

export function Canvas({ tab, active }: { tab: Tab; active: boolean }) {
  const firstRun = useStore((s) => !s.settings.agentSeen && s.activity.length === 0);
  const ref = useRef<HTMLDivElement>(null);
  // The first tap selects a Hatch, which would take its shield away before the second tap lands. The shield stays for the length of a double tap.
  const [armed, setArmed] = useState<string | null>(null);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewport = useStore((s) => s.viewport);
  const fit = fitHatch(tab);
  const view = viewFor(tab, fit);

  const rectOf = (h: Hatch): Rect =>
    h === fit
      ? { x: h.x, y: h.y, width: Math.max(240, viewport.width), height: Math.max(240, viewport.height) }
      : { x: h.x, y: h.y, width: h.width, height: h.height };

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !active) return;
    const measure = (): void => actions.setViewport(el.clientWidth, el.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [active]);

  // Wheel pans and pinch zooms. The listener is non-passive so a pinch never zooms Hatch's own interface.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      // A scroll straight after a tap belongs to the page, so the shield that waits for a second tap lets go.
      if ((e.target as HTMLElement).closest('.shield.armed')) return setArmed(null);
      if (e.ctrlKey || e.metaKey) {
        const box = el.getBoundingClientRect();
        const current = tab.zoom;
        actions.zoomTo(current * Math.exp(-e.deltaY * 0.01), { x: e.clientX - box.left, y: e.clientY - box.top });
      } else {
        actions.panBy(-e.deltaX, -e.deltaY);
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [tab.zoom]);

  /** A drag on the canvas or on a shielded Hatch pans. A tap selects what was under it, and a second tap on the same Hatch fits it to the view. */
  const panOrSelect = (hatchId: string | null) => (e: React.PointerEvent) => {
    const start = tab.pan;
    startDrag(e, {
      cursor: 'grabbing',
      onMove: (dx, dy) => actions.panTo(start.x + dx, start.y + dy),
      onEnd: (moved) => {
        if (moved) return;
        if (armTimer.current) clearTimeout(armTimer.current);
        if (hatchId && armed === hatchId) {
          setArmed(null);
          return actions.toggleFit(hatchId);
        }
        // A second tap on empty canvas opens a new Hatch there, with room above it for its title.
        if (!hatchId && armed === EMPTY && !fit) {
          setArmed(null);
          const box = ref.current!.getBoundingClientRect();
          return actions.requestNewHatchAt({ x: (e.clientX - box.left - tab.pan.x) / tab.zoom, y: (e.clientY - box.top - tab.pan.y + HEADER_OFFSET) / tab.zoom });
        }
        actions.select(hatchId);
        setArmed(hatchId ?? EMPTY);
        armTimer.current = setTimeout(() => setArmed(null), 400);
      },
    });
  };
  return (
    // CDP refuses a screenshot of a webview under visibility: hidden, so an agent's background tab stays rendered at opacity 0.
    // An inactive canvas stays rendered beneath the active one, out of reach of the pointer, the keyboard and screen readers.
    <div ref={ref} className={`canvas${active ? '' : ' behind'}`} inert={!active} onPointerDown={(e) => e.target === e.currentTarget && e.button === 0 && panOrSelect(null)(e)} onContextMenu={(e) => actions.openContextMenu(e, tab.id, null)} data-testid="canvas">
      <div className="world" style={{ transform: `translate(${view.pan.x}px, ${view.pan.y}px) scale(${view.zoom})` }}>
        {tab.hatches.map((h) => {
          const rect = rectOf(h);
          const hidden = fit !== null && h !== fit;
          return (
            <div key={h.id}>
              <HatchPage hatch={h} rect={rect} hidden={hidden} />
              {(h.id !== tab.selectedHatchId || armed === h.id) && !hidden && h !== fit && (
                <div className={`shield${armed === h.id ? ' armed' : ''}`} style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }} onPointerDown={(e) => e.button === 0 && panOrSelect(h.id)(e)} onContextMenu={(e) => actions.openContextMenu(e, tab.id, h.id)} data-testid={`shield-${h.id}`} />
              )}
            </div>
          );
        })}
      </div>

      <div className="overlay">
        {tab.hatches.map((h) =>
          fit !== null && h !== fit ? null : (
            <HatchOverlay key={h.id} tabId={tab.id} hatch={h} size={rectOf(h)} screen={toScreen(rectOf(h), view.pan, view.zoom)} zoom={view.zoom} selected={h.id === tab.selectedHatchId} docked={h === fit} />
          ),
        )}
        {tab.hatches.length === 0 &&
          (firstRun ? (
            <FirstRun />
          ) : (
            <div className="canvas-empty">
              <p>This tab has no pages yet.</p>
              <button className="button primary" onClick={actions.requestNewHatch}>
                <PlusIcon /> New Hatch
              </button>
            </div>
          ))}
      </div>

    </div>
  );
}
