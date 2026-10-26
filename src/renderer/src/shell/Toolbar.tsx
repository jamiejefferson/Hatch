import { labelForUrl } from '@shared/address';
import { pages } from '../canvas/webviews';
import { ACTION_ICON_ART, CommentIcon, GrabIcon, MinusIcon, NoteIcon, OutlineIcon, PlusIcon, ReloadIcon, ShowAllIcon, StopIcon } from '../icons';
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
  const placingNote = useStore((s) => s.placingNote);
  const buttons = useStore((s) => s.settings.actionButtons);

  return (
    <nav className="toolbar" aria-label="Hatch tools" data-testid="toolbar">
      <div className="tool-group">
        {load?.loading ? (
          <button className="tool" aria-label="Stop loading" title="Stop loading" data-detail="Stops the selected Hatch's page loading." onClick={() => id && pages.stop(id)}>
            <StopIcon />
          </button>
        ) : (
          <button className="tool" aria-label="Reload" title="Reload" data-detail="Loads the selected Hatch's page again." data-keys="⌘R" disabled={none} onClick={() => id && pages.reload(id)} data-testid="tool-reload">
            <ReloadIcon />
          </button>
        )}
      </div>
      <div className="tool-group">
        <button className="tool" aria-label={agent ? 'Show the page' : 'Show the agent view'} title={agent ? 'Show the page' : 'Show the agent view'} data-detail={agent ? 'Puts the live page back in the selected Hatch.' : 'Shows the outline an agent reads, with the reference of every element.'} data-keys="⇧⌘A" aria-pressed={agent} disabled={none} onClick={() => id && actions.toggleView(id)} data-testid="view-toggle">
          <OutlineIcon />
        </button>
      </div>
      <div className="tool-group">
        <button className="tool" aria-label={picking === 'comment' ? 'Stop adding a comment' : 'Add a comment'} title={picking === 'comment' ? 'Stop adding a comment' : 'Add a comment'} data-detail="Pins a comment to an element of the page, where an agent can read it and act on it." aria-pressed={picking === 'comment'} disabled={none} onClick={() => id && (picking === 'comment' ? actions.stopPicking() : actions.startPicking(id))} data-testid="add-comment">
          <CommentIcon />
        </button>
        {/* Notes belong to the canvas, so the button needs no selected Hatch. They hide in Fit to view, and the button waits there. */}
        <button className="tool" aria-label={placingNote ? 'Stop adding a note' : 'Add a note to the canvas'} title={placingNote ? 'Stop adding a note' : 'Add a note to the canvas'} data-detail={fit ? 'Notes show on the canvas. Leave Fit to view to add one.' : 'Puts a sticky note where you click next.'} aria-pressed={placingNote} disabled={!!fit} onClick={actions.togglePlacingNote} data-testid="add-note">
          <NoteIcon />
        </button>
        <button className="tool" aria-label={picking === 'grab' ? 'Stop grabbing' : 'Grab an element for Paper'} title={picking === 'grab' ? 'Stop grabbing' : 'Grab an element for Paper'} data-detail="Copies the element you click as layers you can paste into Paper." aria-pressed={picking === 'grab'} disabled={none} onClick={() => id && (picking === 'grab' ? actions.stopPicking() : actions.startGrab(id))} data-testid="grab-element">
          <GrabIcon />
        </button>
      </div>
      {/* The user's own buttons, each opening a web app in Fit to view. A right-click edits one. */}
      <div className="tool-group action-tools" role="group" aria-label="Action buttons" data-testid="action-buttons">
        {buttons.map((b) => {
          const { Icon } = ACTION_ICON_ART[b.icon];
          const showing = fit?.action === b.id;
          return (
            <button
              key={b.id}
              className="tool"
              aria-label={`Open ${b.name}`}
              title={b.name}
              data-detail={`Opens ${labelForUrl(b.url)} in Fit to view. Right-click to edit the button.`}
              aria-pressed={showing}
              onClick={() => actions.launchAction(b.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                actions.openActionEditor(b.id);
              }}
              data-testid={`action-${b.id}`}
            >
              <Icon />
            </button>
          );
        })}
        <button className="tool quiet-tool" aria-label="Add an action button" title="Add an action button" data-detail="Makes a button here that opens a web app you use often." onClick={() => actions.openActionEditor(null)} data-testid="add-action">
          <PlusIcon size={14} />
        </button>
      </div>
      <div className="tool-space" />
      <div className="tool-group zoom-tools" role="group" aria-label="Canvas zoom">
        <button className="tool" aria-label="Zoom in" title="Zoom in" data-keys="⌘=" disabled={!!fit} onClick={() => actions.zoomStep(1)}>
          <PlusIcon size={14} />
        </button>
        <button className="tool level mono" aria-label="Show the canvas at 100%" title="Show the canvas at 100%" data-keys="⌘0" disabled={!!fit} onClick={() => actions.zoomTo(1)}>
          <output aria-live="polite" data-testid="zoom-level">
            {fit ? 'Fit' : `${Math.round(tab.zoom * 100)}%`}
          </output>
        </button>
        <button className="tool" aria-label="Zoom out" title="Zoom out" data-keys="⌘-" disabled={!!fit} onClick={() => actions.zoomStep(-1)}>
          <MinusIcon size={14} />
        </button>
        <button className="tool" aria-label="Show every Hatch" title="Show every Hatch" data-detail="Zooms out until every Hatch and note on the canvas fits on screen." disabled={!!fit || tab.hatches.length + (tab.notes?.length ?? 0) === 0} onClick={actions.showAll} data-testid="show-all">
          <ShowAllIcon size={14} />
        </button>
      </div>
    </nav>
  );
}
