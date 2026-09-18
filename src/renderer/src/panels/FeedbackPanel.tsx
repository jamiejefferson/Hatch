import { useEffect, useState } from 'react';
import type { FeedbackDetails, FeedbackKind } from '@shared/feedback';
import { useStore } from '../state/store';

const KINDS: { id: FeedbackKind; label: string }[] = [
  { id: 'bug', label: 'A bug' },
  { id: 'idea', label: 'An idea' },
  { id: 'other', label: 'Something else' },
];

export function FeedbackPanel() {
  const shot = useStore((s) => s.feedbackShot);
  const [kind, setKind] = useState<FeedbackKind>('bug');
  const [message, setMessage] = useState('');
  const [attach, setAttach] = useState(true);
  const [details, setDetails] = useState<FeedbackDetails | null>(null);
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<'sent' | 'saved' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => void window.hatch.feedbackDetails().then(setDetails), []);

  const send = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setSending(true);
    setError(null);
    const result = await window.hatch.sendFeedback({ kind, message, screenshot: attach && shot !== null });
    setSending(false);
    if (!result.ok) return setError(result.error);
    setOutcome(result.value);
    setMessage('');
  };

  if (outcome) {
    return (
      <>
        <header className="panel-head">
          <h1 className="panel-title">Send feedback</h1>
        </header>
        <p className="feedback-outcome" role="status" data-testid="feedback-outcome">
          {outcome === 'sent' ? 'Your feedback arrived. Thank you.' : 'Hatch could not reach the feedback service. It saved your feedback and sends it the next time Hatch opens.'}
        </p>
        <button className="button left" onClick={() => setOutcome(null)}>
          Write another
        </button>
      </>
    );
  }

  return (
    <>
      <header className="panel-head">
        <h1 className="panel-title">Send feedback</h1>
      </header>
      <p className="hint">Tell the people who make Hatch what broke or what is missing. They read every message.</p>
      <form className="add-form" onSubmit={(e) => void send(e)} noValidate>
        <div className="chips" role="radiogroup" aria-label="Kind of feedback">
          {KINDS.map((k) => (
            <button key={k.id} type="button" role="radio" aria-checked={kind === k.id} className={`chip${kind === k.id ? ' active' : ''}`} onClick={() => setKind(k.id)} data-testid={`feedback-kind-${k.id}`}>
              {k.label}
            </button>
          ))}
        </div>
        <textarea className="feedback-text" aria-label="Your feedback" placeholder="Say what happened and what you expected." maxLength={5000} value={message} onChange={(e) => setMessage(e.target.value)} data-testid="feedback-message" />
        {shot && (
          <>
            <button type="button" role="switch" aria-checked={attach} className="switch-row" onClick={() => setAttach(!attach)} data-testid="feedback-attach">
              <span>Attach a picture of the Hatch window</span>
              <span className="switch" aria-hidden="true" />
            </button>
            {attach && <img className="feedback-shot" src={shot} alt="The picture Hatch attaches: its window as it looked when this form opened." data-testid="feedback-shot" />}
            <p className="hint">The picture shows the pages you have open. Switch it off when they hold anything private.</p>
          </>
        )}
        {details && (
          <p className="hint" data-testid="feedback-details">
            Hatch adds its version ({details.appVersion}) and your system ({details.osVersion}). It sends no name and no address.
          </p>
        )}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="button primary left" disabled={sending || !message.trim()} data-testid="feedback-send">
          {sending ? 'Hatch is sending it' : 'Send feedback'}
        </button>
      </form>
    </>
  );
}
