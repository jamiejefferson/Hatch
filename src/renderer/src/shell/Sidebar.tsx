import { ActivityPanel } from '../panels/ActivityPanel';
import { CommentsPanel, openThreadCount } from '../panels/CommentsPanel';
import { FeedbackPanel } from '../panels/FeedbackPanel';
import { HatchPanel } from '../panels/HatchPanel';
import { SettingsPanel } from '../panels/SettingsPanel';
import { SignInsPanel } from '../panels/SignInsPanel';
import { actions, activeTab, useStore, type SidebarPanel } from '../state/store';

const TABS: { id: SidebarPanel; label: string }[] = [
  { id: 'hatch', label: 'Hatch' },
  { id: 'comments', label: 'Comments' },
  { id: 'activity', label: 'Activity' },
];

/** Three tabs about the canvas: the selected Hatch, the comments and what agents do. Settings and feedback open here from the top strip. */
export function Sidebar() {
  const panel = useStore((s) => s.panel);
  const open = useStore(openThreadCount);
  const working = useStore((s) => s.work.tabs[activeTab(s).id] !== undefined);
  return (
    <aside className="sidebar" aria-label="Sidebar">
      <div className="column-tabs" role="tablist" aria-label="Sidebar panels">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={panel === t.id} className={`column-tab${panel === t.id ? ' current' : ''}`} onClick={() => actions.showPanel(t.id)} data-testid={`panel-${t.id}`}>
            {t.label}
            {t.id === 'comments' && open > 0 && <span className="tab-count">{open}</span>}
            {t.id === 'activity' && working && <span className="working-dot" role="img" aria-label="An agent is working on this canvas" />}
          </button>
        ))}
      </div>
      <div className="sidebar-body" role="tabpanel">
        {panel === 'hatch' && <HatchPanel />}
        {panel === 'comments' && <CommentsPanel />}
        {panel === 'activity' && <ActivityPanel />}
        {panel === 'settings' && (
          <>
            <SettingsPanel />
            <SignInsPanel />
          </>
        )}
        {panel === 'feedback' && <FeedbackPanel />}
      </div>
    </aside>
  );
}
