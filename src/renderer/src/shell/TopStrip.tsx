import { BackIcon, CloseIcon, FeedbackIcon, ForwardIcon, JumpBackIcon, JumpForwardIcon, LeftColumnIcon, PlusIcon, ReleaseIcon, SettingsIcon } from '../icons';
import { actions, activeTab, fitHatch, loadStateOf, selectedHatch, tabLabel, useStore } from '../state/store';
import type { Hatch } from '@shared/types';
import { useState } from 'react';
import { pages } from '../canvas/webviews';
import { SoundButton } from '../canvas/HatchOverlay';
import { TitleAddress } from '../canvas/TitleAddress';

/**
 * One row: the left column's switch, the selected Hatch's page history, the jumps between Hatches, the canvas the user is on,
 * then Feedback and Settings, each of which opens the sidebar and closes it on a second press.
 */
export function TopStrip() {
  const tab = useStore(activeTab);
  const label = useStore((s) => tabLabel(s, activeTab(s)));
  const sidebarOpen = useStore((s) => s.workspace.sidebarOpen);
  const leftOpen = useStore((s) => s.workspace.leftOpen !== false);
  const panel = useStore((s) => s.panel);
  const hatch = useStore(selectedHatch);
  const load = useStore((s) => (hatch ? loadStateOf(s, hatch.id) : null));
  const fit = fitHatch(tab);
  const count = tab.hatches.length;
  const place = hatch ? tab.hatches.findIndex((h) => h.id === hatch.id) + 1 : 0;
  const id = hatch?.id;
  const settings = sidebarOpen && panel === 'settings';
  const feedback = sidebarOpen && panel === 'feedback';

  return (
    <header className="top-strip">
      <button className="round quiet" aria-label={leftOpen ? 'Hide the left column' : 'Show the left column'} title={leftOpen ? 'Hide the left column' : 'Show the left column'} data-detail="Shows or hides your canvases, Hatches, projects and links." data-keys="⌘\" aria-expanded={leftOpen} onClick={actions.toggleLeft} data-testid="left-toggle">
        <LeftColumnIcon />
      </button>
      <div className="strip-nav" role="group" aria-label="Page history">
        <button className="round nav" aria-label="Back" title="Back" data-detail="Goes to the previous page in the selected Hatch." data-keys="⌘[" disabled={!id || !load?.canGoBack} onClick={() => id && pages.back(id)} data-testid="tool-back">
          <BackIcon />
        </button>
        <button className="round nav" aria-label="Forward" title="Forward" data-detail="Goes to the next page in the selected Hatch." data-keys="⌘]" disabled={!id || !load?.canGoForward} onClick={() => id && pages.forward(id)} data-testid="tool-forward">
          <ForwardIcon />
        </button>
      </div>
      <div className="strip-title" onContextMenu={(e) => actions.openContextMenu(e, tab.id, fit?.id ?? null)}>
        <strong data-testid="canvas-title">{label}</strong>
        {fit ? <FitBar hatch={fit} /> : <span className="strip-count" data-testid="strip-count">{place ? `Hatch ${place} of ${count}` : `${count} ${count === 1 ? 'Hatch' : 'Hatches'}`}</span>}
      </div>
      {/* The jumps sit to the right of the title. In Fit to view a plus between them opens a new Hatch in Fit to view, then the frame's own two controls follow. */}
      <div className="strip-nav" role="group" aria-label="Hatches">
        <button className="round nav" aria-label="Previous Hatch" title="Previous Hatch" data-detail="Selects the Hatch before this one and brings it into view." data-keys="⌥⌘←" disabled={count === 0} onClick={() => actions.jumpHatch(-1)} data-testid="hatch-previous">
          <JumpBackIcon />
        </button>
        {fit && (
          <button className="round nav" aria-label="New Hatch" title="New Hatch" data-detail="Opens a page in a new Hatch, filling the view." data-keys="⌘N" onClick={actions.requestNewHatch} data-testid="fit-new-hatch">
            <PlusIcon size={14} />
          </button>
        )}
        <button className="round nav" aria-label="Next Hatch" title="Next Hatch" data-detail="Selects the Hatch after this one and brings it into view." data-keys="⌥⌘→" disabled={count === 0} onClick={() => actions.jumpHatch(1)} data-testid="hatch-next">
          <JumpForwardIcon />
        </button>
      </div>
      {fit && <FitControls hatch={fit} />}
      <div className="strip-space" />
      <button className={`round quiet${feedback ? ' current' : ''}`} aria-label={feedback ? 'Close feedback' : 'Send feedback'} title={feedback ? 'Close feedback' : 'Send feedback'} data-detail="Tells the people who make Hatch what works and what does not, with a picture of the window." aria-pressed={feedback} onClick={() => actions.togglePanel('feedback')} data-testid="panel-feedback">
        <FeedbackIcon />
      </button>
      <button className={`round quiet${settings ? ' current' : ''}`} aria-label={settings ? 'Close Settings' : 'Settings'} title={settings ? 'Close Settings' : 'Settings'} data-detail="Holds the look, agent connections, Jev, sign-ins and where Hatch keeps its files." aria-pressed={settings} onClick={() => actions.togglePanel('settings')} data-testid="panel-settings">
        <SettingsIcon />
      </button>
    </header>
  );
}

/** In Fit to view the Hatch's title sits in the strip, so the page takes the whole canvas. */
function FitBar({ hatch }: { hatch: Hatch }) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="fit-bar" data-testid={`header-${hatch.id}`}>
      <TitleAddress hatch={hatch} editing={editing} onEdit={() => setEditing(true)} onDone={() => setEditing(false)} />
      <SoundButton hatch={hatch} />
    </div>
  );
}

/** The frame's two controls, after the jumps. */
function FitControls({ hatch }: { hatch: Hatch }) {
  return (
    <div className="strip-nav" role="group" aria-label="This Hatch">
      <button className="round small quiet" aria-label="Leave Fit to view" title="Leave Fit to view" data-detail="Puts this Hatch back on the canvas at its own size." data-keys="⌘F Esc" onClick={() => actions.toggleFit(hatch.id)} data-testid="leave-fit">
        <ReleaseIcon size={14} />
      </button>
      <button className="round small quiet" aria-label="Close this Hatch" title="Close this Hatch" data-detail="Closes the page. Reopen it with ⇧⌘T." data-keys="⌘W" onClick={() => actions.closeHatch(hatch.id)} data-testid={`bar-close-${hatch.id}`}>
        <CloseIcon size={12} />
      </button>
    </div>
  );
}
