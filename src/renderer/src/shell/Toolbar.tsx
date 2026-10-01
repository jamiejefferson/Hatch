import { pages } from '../canvas/webviews';
import { BackIcon, CommentIcon, ForwardIcon, GrabIcon, MinusIcon, OutlineIcon, PlusIcon, ReloadIcon, ShowAllIcon, StopIcon } from '../icons';
import { actions, activeTab, fitHatch, loadStateOf, selectedHatch, useStore } from '../state/store';

/** The tools that act inside the selected Hatch's page, in one column beside the canvas. The zoom sits at its foot. */
export function Toolbar() {
  const hatch = useStore(selectedHatch);
  const tab = useStore(activeTab);
  const load = useStore((s) => (hatch ? loadStateOf(s, hatch.id) : null));
  const picking = useStore((s) => (hatch && s.picking === hatch.id ? s.pickPurpose : null));
  const fit = fitHatch(tab);
  const id = hatch?.id;
  const none = !id;
  const agent = hatch?.view === 'agent';

  return (
    <nav className="toolbar" aria-label="Hatch tools" data-testid="toolbar">
      <div className="tool-group">
        <button className="tool" aria-label="Back" title="Back" disabled={none || !load?.canGoBack} onClick={() => id && pages.back(id)} data-testid="tool-back">
          <BackIcon />
        </button>
        <button className="tool" aria-label="Forward" title="Forward" disabled={none || !load?.canGoForward} onClick={() => id && pages.forward(id)} data-testid="tool-forward">
          <ForwardIcon />
        </button>
        {load?.loading ? (
          <button className="tool" aria-label="Stop loading" title="Stop loading" onClick={() => id && pages.stop(id)}>
            <StopIcon />
          </button>
        ) : (
          <button className="tool" aria-label="Reload" title="Reload" disabled={none} onClick={() => id && pages.reload(id)} data-testid="tool-reload">
            <ReloadIcon />
          </button>
        )}
      </div>
      <div className="tool-group">
        <button className="tool" aria-label={agent ? 'Show the page' : 'Show the agent view'} title={agent ? 'Show the page' : 'Show the agent view'} aria-pressed={agent} disabled={none} onClick={() => id && actions.toggleView(id)} data-testid="view-toggle">
          <OutlineIcon />
        </button>
      </div>
      <div className="tool-group">
        <button className="tool" aria-label={picking === 'comment' ? 'Stop adding a comment' : 'Add a comment'} title={picking === 'comment' ? 'Stop adding a comment' : 'Add a comment'} aria-pressed={picking === 'comment'} disabled={none} onClick={() => id && (picking === 'comment' ? actions.stopPicking() : actions.startPicking(id))} data-testid="add-comment">
          <CommentIcon />
        </button>
        <button className="tool" aria-label={picking === 'grab' ? 'Stop grabbing' : 'Grab an element for Paper'} title={picking === 'grab' ? 'Stop grabbing' : 'Grab an element for Paper'} aria-pressed={picking === 'grab'} disabled={none} onClick={() => id && (picking === 'grab' ? actions.stopPicking() : actions.startGrab(id))} data-testid="grab-element">
          <GrabIcon />
        </button>
      </div>
      <div className="tool-space" />
      <div className="tool-group zoom-tools" role="group" aria-label="Canvas zoom">
        <button className="tool" aria-label="Zoom in" title="Zoom in" disabled={!!fit} onClick={() => actions.zoomStep(1)}>
          <PlusIcon size={14} />
        </button>
        <button className="tool level mono" aria-label="Show the canvas at 100%" title="Show the canvas at 100%" disabled={!!fit} onClick={() => actions.zoomTo(1)}>
          <output aria-live="polite" data-testid="zoom-level">
            {fit ? 'Fit' : `${Math.round(tab.zoom * 100)}%`}
          </output>
        </button>
        <button className="tool" aria-label="Zoom out" title="Zoom out" disabled={!!fit} onClick={() => actions.zoomStep(-1)}>
          <MinusIcon size={14} />
        </button>
        <button className="tool" aria-label="Show every Hatch" title="Show every Hatch" disabled={!!fit || tab.hatches.length === 0} onClick={actions.showAll} data-testid="show-all">
          <ShowAllIcon size={14} />
        </button>
      </div>
    </nav>
  );
}
