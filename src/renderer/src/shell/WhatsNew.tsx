import { WELCOME_URL } from '@shared/welcome';
import ident from '../assets/hatch-ident.svg';
import { CloseIcon } from '../icons';
import { actions, useStore } from '../state/store';

/** One note for a user who updates: agents can now hand a goal to Jev. It shows once, after the guide, and never on a fresh install. */
export function WhatsNew() {
  const waiting = useStore((s) => s.settings.guideSeen && !s.settings.jevRunSeen && !s.guideOpen);
  if (!window.hatch.guide || !waiting) return null;
  const seen = (): void => void actions.updateSettings({ jevRunSeen: true });
  return (
    <aside className="whats-new" role="status" data-testid="whats-new">
      <header>
        <img src={ident} alt="" width="28" height="28" />
        <span>New in Hatch</span>
        <button type="button" className="round small quiet" aria-label="Close this note" title="Close" onClick={seen} data-testid="whats-new-close">
          <CloseIcon size={12} />
        </button>
      </header>
      <h1>Jev clicks for your agent</h1>
      <p>Your agent plans every click, which costs time and tokens. Now it gives Jev a goal and Jev does the clicking and typing. A five-step search on GOV.UK took 3 seconds and cost under a penny.</p>
      <p className="whats-new-key">Jev runs on your own TypeSafe or OpenRouter key, which you add in Settings.</p>
      <div className="whats-new-actions">
        <button
          type="button"
          className="button primary"
          onClick={() => {
            seen();
            actions.showPanel('settings');
          }}
        >
          Connect Jev
        </button>
        <button
          type="button"
          className="button"
          onClick={() => {
            seen();
            actions.openHatch(`${WELCOME_URL}#jev`);
          }}
        >
          See how it works
        </button>
      </div>
    </aside>
  );
}
