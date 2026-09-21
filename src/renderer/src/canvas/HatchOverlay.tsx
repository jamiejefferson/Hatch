import { useState } from 'react';
import type { Rect } from '@shared/geometry';
import type { Hatch } from '@shared/types';
import { BackIcon, CloseIcon, FitIcon, ForwardIcon } from '../icons';
import { actions, hatchLabel, loadStateOf, useStore } from '../state/store';
import { startDrag } from './drag';
import { AgentView } from './AgentView';
import { CommentLayer } from './Comments';
import { ConsentNotice, PageDialog, PopupNotice, ViewRequestNotice } from './HatchNotices';
import { pages } from './webviews';

interface Props {
  tabId: string;
  hatch: Hatch;
  /** The page's viewport in CSS pixels. */
  size: Rect;
  /** The same rectangle in screen pixels inside the canvas area. */
  screen: Rect;
  zoom: number;
  selected: boolean;
  /** Fit to view docks the header as a toolbar. */
  docked: boolean;
}

const BAR_MIN = 260;
/** Below this zoom the canvas is an overview, so the selected Hatch keeps its title and shows the bar only under the pointer. */
const BAR_ZOOM = 0.5;

/** The control bar stays on screen while part of its Hatch is, so its buttons remain reachable on a Hatch panned half out of view. */
function barBox(screen: Rect): { left: number; top: number; maxWidth: number } {
  const right = screen.x + Math.max(screen.width, BAR_MIN);
  const left = Math.min(Math.max(screen.x, 8), right - BAR_MIN);
  // A Hatch whose top edge has scrolled above the canvas keeps its bar at the canvas top, until the Hatch itself leaves.
  const top = Math.min(Math.max(screen.y - 40, 8), screen.y + screen.height - 40);
  return { left, top, maxWidth: right - left };
}

/** An unselected Hatch carries its title alone, cut to the Hatch's width on screen, so a zoomed-out canvas stays clear of controls. */
const labelBox = (screen: Rect): { left: number; top: number; width: number } => ({ left: screen.x, top: screen.y - 32, width: Math.max(screen.width, 24) });

/** The notice sits at the top left of its Hatch and stays inside the canvas area, so the sidebar never cuts off its buttons. */
function noticeBox(screen: Rect, canvasWidth: number): { left: number; top: number; width: number } {
  const width = Math.min(520, canvasWidth - 32);
  const left = Math.min(Math.max(screen.x + 16, 16), canvasWidth - width - 16);
  return { left, top: Math.max(screen.y, 8) + 12, width };
}

/** Everything Hatch draws around a page. It sits above the canvas and never scales, so it stays crisp at every zoom. */
export function HatchOverlay({ tabId, hatch, size, screen, zoom, selected, docked }: Props) {
  const [hover, setHover] = useState(false);
  const load = useStore((s) => loadStateOf(s, hatch.id));
  const work = useStore((s) => s.work.hatches[hatch.id]);
  const working = work !== undefined;
  const act = useStore((s) => s.acts[hatch.id]);
  const request = useStore((s) => s.viewRequests[hatch.id]);
  const dialog = useStore((s) => s.dialogs[hatch.id]);
  const consent = useStore((s) => s.consents[hatch.id]);
  const popup = useStore((s) => s.popups[hatch.id]);
  const viewport = useStore((s) => s.viewport);
  const id = hatch.id;

  const resize = (axis: 'x' | 'y' | 'both') => (e: React.PointerEvent) => {
    e.stopPropagation();
    startDrag(e, {
      cursor: axis === 'x' ? 'ew-resize' : axis === 'y' ? 'ns-resize' : 'nwse-resize',
      onMove: (dx, dy) => actions.resizeHatch(id, axis === 'y' ? hatch.width : hatch.width + dx / zoom, axis === 'x' ? hatch.height : hatch.height + dy / zoom),
    });
  };

  const move = (e: React.PointerEvent): void => {
    if (docked || (e.target as HTMLElement).closest('button')) return;
    startDrag(e, {
      cursor: 'grabbing',
      onMove: (dx, dy) => actions.moveHatch(id, hatch.x + dx / zoom, hatch.y + dy / zoom),
      onEnd: (moved) => {
        if (!moved) actions.select(id);
      },
    });
  };

  const run = (run: () => void) => (): void => {
    actions.select(id);
    run();
  };

  const menu = (e: React.MouseEvent): void => actions.openContextMenu(e, tabId, id);
  // A bar wider than its Hatch would sit over the Hatch beside it.
  const compact = zoom < BAR_ZOOM || screen.width < BAR_MIN;

  const header = docked ? null : selected && (!compact || hover) ? (
    <div className="hatch-bar" style={barBox(screen)} onPointerDown={move} onPointerLeave={() => setHover(false)} onContextMenu={menu} data-testid={`header-${id}`}>
      <button className="round small quiet" aria-label="Back" title="Back" disabled={!load.canGoBack} onClick={run(() => pages.back(id))}>
        <BackIcon size={14} />
      </button>
      <button className="round small quiet" aria-label="Forward" title="Forward" disabled={!load.canGoForward} onClick={run(() => pages.forward(id))}>
        <ForwardIcon size={14} />
      </button>
      {working && <span className="working-dot" role="status" aria-label="An agent is working in this Hatch" />}
      <span className="hatch-title">{hatchLabel(hatch)}</span>
      <span className="hatch-size mono">
        {size.width} × {size.height}
      </span>
      <button className="round small quiet" aria-label="Fit to view" title="Fit to view" onClick={run(() => actions.toggleFit(id))}>
        <FitIcon size={14} />
      </button>
      <button className="round small quiet" aria-label="Close this Hatch" title="Close this Hatch" onClick={() => actions.closeHatch(id)} data-testid={`bar-close-${id}`}>
        <CloseIcon size={12} />
      </button>
    </div>
  ) : (
    <div className={`hatch-label${selected ? ' selected' : ''}`} style={labelBox(screen)} onPointerDown={move} onPointerEnter={() => selected && setHover(true)} onContextMenu={menu} data-testid={`header-${id}`}>
      {working && <span className="working-dot" role="status" aria-label="An agent is working in this Hatch" />}
      <span className="hatch-title">{hatchLabel(hatch)}</span>
    </div>
  );

  const box = { left: screen.x, top: screen.y, width: screen.width, height: screen.height };

  return (
    <>
      {header}
      {(!docked || working) && <div className={`hatch-border${selected && !docked ? ' selected' : ''}${working ? ' working' : ''}`} style={box} data-testid={working ? `in-use-${id}` : undefined} />}
      {act && hatch.view === 'page' && (
        <div className="hatch-layer agent-act-layer" style={box}>
          <div key={act.at} className={`agent-act ${act.kind}`} style={{ left: act.box.x * zoom - 4, top: act.box.y * zoom - 4, width: act.box.width * zoom + 8, height: act.box.height * zoom + 8 }} data-testid={`agent-act-${id}`} />
        </div>
      )}
      {work && (
        <div className="in-use" style={{ left: screen.x + 12, top: screen.y + screen.height - 44, maxWidth: Math.max(160, screen.width - 24) }} role="status" data-testid={`in-use-chip-${id}`}>
          <span className="working-dot" aria-hidden="true" />
          <strong>{work.agent} is using this Hatch</strong>
          {(work.doing || work.intent) && <span className="in-use-doing">{work.doing || work.intent}</span>}
        </div>
      )}
      {hatch.view === 'agent' && (
        <div className="hatch-layer" style={box}>
          <AgentView hatchId={id} />
        </div>
      )}
      {!load.error && <CommentLayer hatch={hatch} screen={screen} zoom={zoom} />}
      {load.error && hatch.view === 'page' && (
        <div className="hatch-error" style={box} role="alert">
          <strong>This page did not load</strong>
          <span className="mono">{load.error.url}</span>
          <span>{load.error.description}</span>
          <button className="button" onClick={run(() => pages.navigate(id, load.error!.url))}>
            Try again
          </button>
        </div>
      )}
      {dialog && (
        <div className="hatch-layer" style={box}>
          <PageDialog dialog={dialog} />
        </div>
      )}
      {consent && (
        <div className="notice-anchor" style={noticeBox(screen, viewport.width)}>
          <ConsentNotice request={consent} />
        </div>
      )}
      {popup && !docked && !consent && !request && (
        <div className="notice-anchor" style={noticeBox(screen, viewport.width)}>
          <PopupNotice hatchId={id} />
        </div>
      )}
      {request && !consent && (
        <div className="notice-anchor" style={noticeBox(screen, viewport.width)}>
          <ViewRequestNotice request={request} switched={request.view === hatch.view} page={hatchLabel(hatch)} />
        </div>
      )}
      {selected && !docked && (
        <>
          <div className="handle handle-x" style={{ left: screen.x + screen.width - 2, top: screen.y + screen.height / 2 - 24 }} onPointerDown={resize('x')} role="separator" aria-label="Drag to change the width" data-testid="handle-x" />
          <div className="handle handle-y" style={{ left: screen.x + screen.width / 2 - 24, top: screen.y + screen.height - 2 }} onPointerDown={resize('y')} role="separator" aria-label="Drag to change the height" data-testid="handle-y" />
          <div className="handle handle-xy" style={{ left: screen.x + screen.width - 5, top: screen.y + screen.height - 5 }} onPointerDown={resize('both')} role="separator" aria-label="Drag to change the size" data-testid="handle-xy" />
        </>
      )}
    </>
  );
}
