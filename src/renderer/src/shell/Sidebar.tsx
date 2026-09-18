import { ActivityPanel } from '../panels/ActivityPanel';
import { FeedbackPanel } from '../panels/FeedbackPanel';
import { HatchPanel } from '../panels/HatchPanel';
import { ProjectsPanel } from '../panels/ProjectsPanel';
import { LinksPanel } from '../panels/LinksPanel';
import { SettingsPanel } from '../panels/SettingsPanel';
import { SignInsPanel } from '../panels/SignInsPanel';
import { useStore } from '../state/store';

/** The top strip chooses the panel, so the sidebar holds the panel alone. */
export function Sidebar() {
  const panel = useStore((s) => s.panel);
  return (
    <aside className="sidebar" aria-label="Sidebar">
      <div className="sidebar-body" role="tabpanel">
        {panel === 'hatch' && <HatchPanel />}
        {panel === 'projects' && <ProjectsPanel />}
        {panel === 'links' && <LinksPanel />}
        {panel === 'activity' && <ActivityPanel />}
        {panel === 'signins' && <SignInsPanel />}
        {panel === 'settings' && <SettingsPanel />}
        {panel === 'feedback' && <FeedbackPanel />}
      </div>
    </aside>
  );
}
