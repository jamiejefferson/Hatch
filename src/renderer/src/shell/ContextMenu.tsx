import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CloseIcon, CopyIcon, FitIcon, ReleaseIcon } from '../icons';
import { actions, useStore } from '../state/store';

/** The right-click menu for a Hatch, a canvas or a tab. Its first job is the link a user pastes to an agent. */
export function ContextMenu() {
  const menu = useStore((s) => s.contextMenu);
  const hatch = useStore((s) => (menu?.hatchId ? (s.workspace.tabs.flatMap((t) => t.hatches).find((h) => h.id === menu.hatchId) ?? null) : null));
  const ref = useRef<HTMLDivElement>(null);
  const [spot, setSpot] = useState({ left: 0, top: 0 });

  // The menu stays inside the window, whichever corner the pointer sits in.
  useLayoutEffect(() => {
    if (!menu || !ref.current) return;
    const box = ref.current.getBoundingClientRect();
    setSpot({ left: Math.min(menu.x, window.innerWidth - box.width - 8), top: Math.min(menu.y, window.innerHeight - box.height - 8) });
    ref.current.querySelector('button')?.focus();
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const close = (): void => actions.closeContextMenu();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      close();
    };
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [menu]);

  if (!menu) return null;
  const run = (work: () => void) => (): void => {
    actions.closeContextMenu();
    work();
  };

  return (
    <div className="menu-scrim" onPointerDown={actions.closeContextMenu} onContextMenu={(e) => e.preventDefault()}>
      <div ref={ref} className="menu" role="menu" style={spot} onPointerDown={(e) => e.stopPropagation()} data-testid="context-menu">
        {hatch && (
          <button role="menuitem" onClick={run(() => void actions.copyLink(hatch.id, 'Hatch'))} data-testid="copy-hatch-link">
            <CopyIcon /> Copy link to this Hatch
          </button>
        )}
        <button role="menuitem" onClick={run(() => void actions.copyLink(menu.tabId, 'canvas'))} data-testid="copy-canvas-link">
          <CopyIcon /> Copy link to this canvas
        </button>
        {hatch && (
          <>
            <hr />
            <button role="menuitem" onClick={run(() => actions.toggleFit(hatch.id))}>
              {hatch.template === 'fit' ? <ReleaseIcon /> : <FitIcon />} {hatch.template === 'fit' ? 'Leave Fit to view' : 'Fit to view'}
            </button>
            <button role="menuitem" onClick={run(() => actions.closeHatch(hatch.id))}>
              <CloseIcon /> Close this Hatch
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** One line of feedback at the foot of the window. */
export function Toast() {
  const toast = useStore((s) => s.toast);
  return (
    <div className="toast-anchor" role="status" aria-live="polite">
      {toast && <p className="toast">{toast}</p>}
    </div>
  );
}
