import { WELCOME_URL } from '@shared/welcome';
import { actions, useStore } from '../state/store';

/** One note for a user who updates: agents can now hand a goal to Jev. It shows once, after the guide, and never on a fresh install. */
export function WhatsNew() {
  const waiting = useStore((s) => s.settings.guideSeen && !s.settings.jevRunSeen && !s.guideOpen);
  if (!window.hatch.guide || !waiting) return null;
  const seen = (): void => void actions.updateSettings({ jevRunSeen: true });
  return (
    <aside className="notice whats-new" role="status" data-testid="whats-new">
      <h3>New in Hatch</h3>
      <p>Your agent can now hand a goal to Jev, which takes the clicks and the typing for a search or a known flow.</p>
      <p className="hint">Jev needs your TypeSafe key, which you add in Settings. A key comes from console.typesafe.ai/settings/keys. Your agent reads about jev_run in its own guide.</p>
      <div className="notice-actions">
        <button
          type="button"
          className="button primary"
          onClick={() => {
            seen();
            actions.openHatch(`${WELCOME_URL}#jev`);
          }}
        >
          Read about Jev
        </button>
        <button
          type="button"
          className="button"
          onClick={() => {
            seen();
            actions.showPanel('settings');
          }}
        >
          Open Settings
        </button>
        <button type="button" className="text-button" onClick={seen} data-testid="whats-new-close">
          Close
        </button>
      </div>
    </aside>
  );
}
