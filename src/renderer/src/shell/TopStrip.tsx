import { useState } from 'react';
import { ActivityIcon, BackIcon, CloseIcon, FeedbackIcon, ForwardIcon, HatchIcon, LinksIcon, PlusIcon, ProjectsIcon, ReleaseIcon, SettingsIcon, SidebarIcon, SignInsIcon } from '../icons';
import { pages } from '../canvas/webviews';
import { actions, effectiveSize, fitHatch, hatchLabel, loadStateOf, tabLabel, useStore, type SidebarPanel } from '../state/store';
import type { Hatch } from '@shared/types';

const PANELS: { id: SidebarPanel; label: string; Icon: (p: { size?: number }) => React.ReactElement }[] = [
  { id: 'hatch', label: 'Hatch', Icon: HatchIcon },
  { id: 'projects', label: 'Projects', Icon: ProjectsIcon },
  { id: 'links', label: 'Links', Icon: LinksIcon },
  { id: 'activity', label: 'Activity', Icon: ActivityIcon },
  { id: 'signins', label: 'Sign-ins', Icon: SignInsIcon },
  { id: 'settings', label: 'Settings', Icon: SettingsIcon },
  { id: 'feedback', label: 'Send feedback', Icon: FeedbackIcon },
];

export function TopStrip() {
  const tabs = useStore((s) => s.workspace.tabs);
  const activeTabId = useStore((s) => s.workspace.activeTabId);
  const sidebarOpen = useStore((s) => s.workspace.sidebarOpen);
  const panel = useStore((s) => s.panel);
  const work = useStore((s) => s.work.tabs);
  const labels = useStore((s) => s.workspace.tabs.map((t) => tabLabel(s, t)).join('\n')).split('\n');
  const [renaming, setRenaming] = useState<string | null>(null);

  return (
    <header className="top-strip">
      <div className="tabs" role="tablist" aria-label="Tabs">
        {tabs.map((tab, i) => {
          const active = tab.id === activeTabId;
          const label = labels[i] ?? '';
          const fit = active ? fitHatch(tab) : null;
          return (
            <div key={tab.id} className={`tab${active ? ' active' : ''}${fit ? ' wide' : ''}`} onContextMenu={(e) => actions.openContextMenu(e, tab.id, fit?.id ?? null)}>
              {work[tab.id] && <span className="working-dot" role="img" aria-label="An agent is working in this tab" />}
              {renaming === tab.id ? (
                <input
                  className="tab-rename"
                  aria-label="Tab name"
                  defaultValue={tab.name ?? ''}
                  placeholder={label}
                  autoFocus
                  onBlur={(e) => {
                    actions.renameTab(tab.id, e.target.value);
                    setRenaming(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                    if (e.key === 'Escape') setRenaming(null);
                  }}
                />
              ) : (
                <button role="tab" aria-selected={active} className="tab-label" title={`${label}. Double-click to rename.`} onClick={() => actions.activateTab(tab.id)} onDoubleClick={() => setRenaming(tab.id)}>
                  {label}
                </button>
              )}
              {fit && <FitBar hatch={fit} />}
              <button className="tab-close" aria-label={`Close tab ${label}`} onClick={() => actions.closeTab(tab.id)}>
                <CloseIcon size={12} />
              </button>
            </div>
          );
        })}
        <button className="round quiet" aria-label="New tab" title="New tab" onClick={() => actions.newTab()}>
          <PlusIcon />
        </button>
      </div>
      <div className="strip-space" />
      <nav className="panel-nav" role="tablist" aria-label="Sidebar panels">
        {PANELS.map(({ id, label, Icon }) => {
          const current = sidebarOpen && panel === id;
          return (
            <button key={id} role="tab" aria-selected={current} aria-label={label} title={label} className={`round quiet${current ? ' current' : ''}`} onClick={() => (id === 'feedback' ? void actions.openFeedback() : actions.showPanel(id))} data-testid={`panel-${id}`}>
              <Icon />
            </button>
          );
        })}
      </nav>
      <button className="round quiet" aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'} title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'} aria-expanded={sidebarOpen} onClick={actions.toggleSidebar} data-testid="sidebar-toggle">
        <SidebarIcon />
      </button>
    </header>
  );
}

/** In Fit to view the Hatch control bar sits inside its tab, so the page takes the whole window below the strip. */
function FitBar({ hatch }: { hatch: Hatch }) {
  const load = useStore((s) => loadStateOf(s, hatch.id));
  useStore((s) => s.viewport);
  const size = effectiveSize(hatch);
  return (
    <div className="fit-bar" data-testid={`header-${hatch.id}`}>
      <button className="round small quiet" aria-label="Back" title="Back" disabled={!load.canGoBack} onClick={() => pages.back(hatch.id)}>
        <BackIcon size={14} />
      </button>
      <button className="round small quiet" aria-label="Forward" title="Forward" disabled={!load.canGoForward} onClick={() => pages.forward(hatch.id)}>
        <ForwardIcon size={14} />
      </button>
      <span className="hatch-title">{hatchLabel(hatch)}</span>
      <span className="hatch-size mono">
        {size.width} × {size.height}
      </span>
      <button className="round small quiet" aria-label="Leave Fit to view" title="Leave Fit to view (Esc)" onClick={() => actions.toggleFit(hatch.id)} data-testid="leave-fit">
        <ReleaseIcon size={14} />
      </button>
    </div>
  );
}
