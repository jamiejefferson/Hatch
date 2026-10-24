import { BackIcon, CloseIcon, FeedbackIcon, ForwardIcon, JumpBackIcon, JumpForwardIcon, LeftColumnIcon, ReleaseIcon, SettingsIcon } from '../icons';
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
      <button className="round quiet" aria-label={leftOpen ? 'Hide the left column' : 'Show the left column'} title={leftOpen ? 'Hide the left column' : 'Show the left column'} aria-expanded={leftOpen} onClick={actions.toggleLeft} data-testid="left-toggle">
        <LeftColumnIcon />
      </button>
      <div className="strip-nav" role="group" aria-label="Page history and Hatches">
        <button className="round nav" aria-label="Back" title="Back (Cmd+[)" disabled={!id || !load?.canGoBack} onClick={() => id && pages.back(id)} data-testid="tool-back">
          <BackIcon />
        </button>
        <button className="round nav" aria-label="Forward" title="Forward (Cmd+])" disabled={!id || !load?.canGoForward} onClick={() => id && pages.forward(id)} data-testid="tool-forward">
          <ForwardIcon />
        </button>
        <span className="strip-rule" aria-hidden="true" />
        <button className="round nav" aria-label="Previous Hatch" title="Previous Hatch (Cmd+Option+Left)" disabled={count === 0} onClick={() => actions.jumpHatch(-1)} data-testid="hatch-previous">
          <JumpBackIcon />
        </button>
        <button className="round nav" aria-label="Next Hatch" title="Next Hatch (Cmd+Option+Right)" disabled={count === 0} onClick={() => actions.jumpHatch(1)} data-testid="hatch-next">
          <JumpForwardIcon />
        </button>
      </div>
      <div className="strip-title" onContextMenu={(e) => actions.openContextMenu(e, tab.id, fit?.id ?? null)}>
        <strong data-testid="canvas-title">{label}</strong>
        {fit ? <FitBar hatch={fit} /> : <span className="strip-count" data-testid="strip-count">{place ? `Hatch ${place} of ${count}` : `${count} ${count === 1 ? 'Hatch' : 'Hatches'}`}</span>}
      </div>
      <div className="strip-space" />
      <button className={`round quiet${feedback ? ' current' : ''}`} aria-label={feedback ? 'Close feedback' : 'Send feedback'} title={feedback ? 'Close feedback' : 'Send feedback'} aria-pressed={feedback} onClick={() => actions.togglePanel('feedback')} data-testid="panel-feedback">
        <FeedbackIcon />
      </button>
      <button className={`round quiet${settings ? ' current' : ''}`} aria-label={settings ? 'Close Settings' : 'Settings'} title={settings ? 'Close Settings' : 'Settings'} aria-pressed={settings} onClick={() => actions.togglePanel('settings')} data-testid="panel-settings">
        <SettingsIcon />
      </button>
    </header>
  );
}

/** In Fit to view the Hatch's title and its two frame controls sit in the strip, so the page takes the whole canvas. */
function FitBar({ hatch }: { hatch: Hatch }) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="fit-bar" data-testid={`header-${hatch.id}`}>
      <TitleAddress hatch={hatch} editing={editing} onEdit={() => setEditing(true)} onDone={() => setEditing(false)} />
      <SoundButton hatch={hatch} />
      <button className="round small quiet" aria-label="Leave Fit to view" title="Leave Fit to view (Esc)" onClick={() => actions.toggleFit(hatch.id)} data-testid="leave-fit">
        <ReleaseIcon size={14} />
      </button>
      <button className="round small quiet" aria-label="Close this Hatch" title="Close this Hatch" onClick={() => actions.closeHatch(hatch.id)} data-testid={`bar-close-${hatch.id}`}>
        <CloseIcon size={12} />
      </button>
    </div>
  );
}
