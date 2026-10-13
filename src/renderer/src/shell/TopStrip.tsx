import { CloseIcon, FeedbackIcon, PanelsIcon, ReleaseIcon, SettingsIcon } from '../icons';
import { actions, activeTab, fitHatch, tabLabel, useStore } from '../state/store';
import type { Hatch } from '@shared/types';
import { useState } from 'react';
import { SoundButton } from '../canvas/HatchOverlay';
import { TitleAddress } from '../canvas/TitleAddress';

/** One row: the switch for both side columns, the canvas the user is on, then Feedback and Settings. */
export function TopStrip() {
  const tab = useStore(activeTab);
  const label = useStore((s) => tabLabel(s, activeTab(s)));
  const sidebarOpen = useStore((s) => s.workspace.sidebarOpen);
  const panelsOpen = useStore((s) => s.workspace.sidebarOpen || s.workspace.leftOpen !== false);
  const panel = useStore((s) => s.panel);
  const fit = fitHatch(tab);
  const count = tab.hatches.length;

  return (
    <header className="top-strip">
      <button className="round quiet" aria-label={panelsOpen ? 'Hide the side columns' : 'Show the side columns'} title={panelsOpen ? 'Hide the side columns' : 'Show the side columns'} aria-expanded={panelsOpen} onClick={actions.togglePanels} data-testid="panels-toggle">
        <PanelsIcon />
      </button>
      <div className="strip-title" onContextMenu={(e) => actions.openContextMenu(e, tab.id, fit?.id ?? null)}>
        <strong data-testid="canvas-title">{label}</strong>
        {fit ? <FitBar hatch={fit} /> : <span className="strip-count">{`${count} ${count === 1 ? 'Hatch' : 'Hatches'}`}</span>}
      </div>
      <div className="strip-space" />
      <button className={`round quiet${sidebarOpen && panel === 'feedback' ? ' current' : ''}`} aria-label="Send feedback" title="Send feedback" onClick={() => void actions.openFeedback()} data-testid="panel-feedback">
        <FeedbackIcon />
      </button>
      <button className={`round quiet${sidebarOpen && panel === 'settings' ? ' current' : ''}`} aria-label="Settings" title="Settings" aria-pressed={sidebarOpen && panel === 'settings'} onClick={() => actions.showPanel('settings')} data-testid="panel-settings">
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
