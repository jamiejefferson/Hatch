import { CloseIcon, FeedbackIcon, LeftColumnIcon, ReleaseIcon, SettingsIcon, SidebarIcon } from '../icons';
import { actions, activeTab, fitHatch, tabLabel, useStore } from '../state/store';
import type { Hatch } from '@shared/types';
import { useState } from 'react';
import { SoundButton } from '../canvas/HatchOverlay';
import { TitleAddress } from '../canvas/TitleAddress';

/** One row: the left column's switch, the canvas the user is on, then Feedback, Settings and the sidebar's switch. */
export function TopStrip() {
  const tab = useStore(activeTab);
  const label = useStore((s) => tabLabel(s, activeTab(s)));
  const sidebarOpen = useStore((s) => s.workspace.sidebarOpen);
  const leftOpen = useStore((s) => s.workspace.leftOpen !== false);
  const panel = useStore((s) => s.panel);
  const fit = fitHatch(tab);
  const count = tab.hatches.length;

  return (
    <header className="top-strip">
      <button className="round quiet" aria-label={leftOpen ? 'Hide the left column' : 'Show the left column'} title={leftOpen ? 'Hide the left column' : 'Show the left column'} aria-expanded={leftOpen} onClick={actions.toggleLeft} data-testid="left-toggle">
        <LeftColumnIcon />
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
      <button className="round quiet" aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'} title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'} aria-expanded={sidebarOpen} onClick={actions.toggleSidebar} data-testid="sidebar-toggle">
        <SidebarIcon />
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
