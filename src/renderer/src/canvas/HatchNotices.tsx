import { useState } from 'react';
import type { ConsentRequest } from '@shared/signins';
import type { DialogState, ViewRequest } from '@shared/types';
import { CloseIcon, FitIcon } from '../icons';
import { actions } from '../state/store';

/** A page on the canvas tried to open a pop-up, which sign-ins such as Google's use. The pop-up opens in Fit to view. */
export function PopupNotice({ hatchId }: { hatchId: string }) {
  return (
    <div className="notice" role="status" data-testid="popup-blocked">
      <h3>Hatch blocked a pop-up</h3>
      <p>Pop-ups open in Fit to view. Fit this Hatch, then try again.</p>
      <div className="notice-actions">
        <button className="button primary" onClick={() => actions.toggleFit(hatchId)} data-testid="popup-fit">
          <FitIcon /> Fit to view
        </button>
        <button className="round" aria-label="Close this notice" title="Close" onClick={() => actions.dismissPopup(hatchId)}>
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}

/** An agent asked to switch this Hatch's view. Hatch shows its reason, and the user decides. */
export function ViewRequestNotice({ request, switched, page }: { request: ViewRequest; switched: boolean; page: string }) {
  const target = request.view === 'agent' ? 'agent view' : 'page';
  return (
    <div className="notice" role="status" data-testid="view-request">
      <h3>{switched ? `The agent switched this Hatch to the ${target}` : `The agent asks to show the ${target}`}</h3>
      <p className="notice-page">{page}</p>
      <p>“{request.reason}”</p>
      {switched ? (
        <div className="notice-actions">
          <button className="button" onClick={() => actions.dismissViewRequest(request.hatchId)}>
            Close
          </button>
        </div>
      ) : (
        <div className="notice-actions">
          <button className="button primary" onClick={() => actions.setView(request.hatchId, request.view)}>
            Show the {target}
          </button>
          <button className="button" onClick={() => actions.dismissViewRequest(request.hatchId)}>
            Stay here
          </button>
        </div>
      )}
    </div>
  );
}

const TITLES: Record<DialogState['kind'], string> = {
  alert: 'This page says',
  confirm: 'This page asks',
  prompt: 'This page asks',
  beforeunload: 'Leave this page?',
};

/** A page's alert, confirm or prompt. It blocks the page until the user or the agent answers. */
export function PageDialog({ dialog }: { dialog: DialogState }) {
  const [text, setText] = useState(dialog.defaultText);
  const answer = (accept: boolean): void => void window.hatch.answerDialog(dialog.hatchId, accept, dialog.kind === 'prompt' ? text : undefined);
  return (
    <div className="page-dialog-scrim">
      <form
        className="page-dialog"
        role="alertdialog"
        aria-label={TITLES[dialog.kind]}
        onSubmit={(e) => {
          e.preventDefault();
          answer(true);
        }}
        data-testid="page-dialog"
      >
        <h3>{TITLES[dialog.kind]}</h3>
        <p>{dialog.kind === 'beforeunload' ? 'Changes on this page may not be saved.' : dialog.message}</p>
        {dialog.kind === 'prompt' && (
          <div className="field">
            <input aria-label="Your answer" value={text} onChange={(e) => setText(e.target.value)} autoFocus />
          </div>
        )}
        <div className="notice-actions">
          <button type="submit" className="button primary" autoFocus={dialog.kind !== 'prompt'}>
            {dialog.kind === 'beforeunload' ? 'Leave' : 'OK'}
          </button>
          {dialog.kind !== 'alert' && (
            <button type="button" className="button" onClick={() => answer(false)}>
              {dialog.kind === 'beforeunload' ? 'Stay' : 'Cancel'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

/** An agent asked Hatch to fill a saved sign-in. Nothing fills until the user answers here. */
export function ConsentNotice({ request }: { request: ConsentRequest }) {
  const answer = (a: 'once' | 'always' | 'refuse') => (): void => actions.answerConsent(request.hatchId, a);
  return (
    <div className="notice" role="alertdialog" aria-label="The agent asks to sign in" data-testid="consent">
      <h3>The agent asks to sign in</h3>
      <p className="consent-site">{request.site}</p>
      <p className="mono">{request.username}</p>
      <p>Hatch fills the form from the Keychain. The agent receives “filled” or “failed” and never the password.</p>
      <div className="notice-actions">
        <button className="button primary" onClick={answer('once')}>
          Allow once
        </button>
        <button className="button" onClick={answer('always')}>
          Always allow on this site
        </button>
        <button className="text-button underline" onClick={answer('refuse')}>
          Refuse
        </button>
      </div>
    </div>
  );
}
