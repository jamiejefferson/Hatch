import { useEffect, useRef, useState } from 'react';
import type { BrowserProfile } from '@shared/cookie-import';
import { pages } from '../canvas/webviews';
import { actions, useStore } from '../state/store';

// The browser the user chose last time comes first next time. A per-window convenience, so a failed read changes nothing.
const REMEMBERED = 'hatch.signInBrowser';
const remembered = (): string | null => {
  try {
    return localStorage.getItem(REMEMBERED);
  } catch {
    return null;
  }
};
const remember = (id: string): void => {
  try {
    localStorage.setItem(REMEMBERED, id);
  } catch {
    // The choice simply is not remembered.
  }
};

/**
 * Finishes a sign-in Hatch cannot do itself, such as one that asks for a passkey. The page opens in the user's own browser,
 * where Touch ID, a phone and a security key work, and Hatch copies that one site's sign-in back into the Hatch.
 */
export function SignInThroughModal() {
  const through = useStore((s) => s.signInThrough);
  const dialog = useRef<HTMLDialogElement>(null);
  const [profiles, setProfiles] = useState<BrowserProfile[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (through && !el.open) {
      setOpened(false);
      setError(null);
      el.showModal();
      void window.hatch.browserProfiles().then((found) => {
        setProfiles(found);
        const last = remembered();
        setChosen(found.find((p) => p.id === last)?.id ?? found[0]?.id ?? null);
      });
    } else if (!through && el.open) el.close();
  }, [through]);

  const profile = profiles?.find((p) => p.id === chosen) ?? null;
  const several = (browser: string): boolean => (profiles ?? []).filter((p) => p.browser === browser).length > 1;
  const site = through?.site ?? '';

  const open = async (): Promise<void> => {
    if (!through || !profile) return;
    remember(profile.id);
    setError(null);
    const result = await window.hatch.openInBrowser(through.url, profile.id);
    if (!result.ok) return setError(result.error);
    setOpened(true);
  };

  const bring = async (): Promise<void> => {
    if (!through || !profile) return;
    setBusy(true);
    setError(null);
    const result = await window.hatch.importSignIn(through.url, profile.id);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    pages.navigate(through.hatchId, through.url);
    actions.closeSignInThrough();
    const { count, browser } = result.value;
    actions.toast(`Hatch copied ${count} ${count === 1 ? 'cookie' : 'cookies'} for ${result.value.site} from ${browser} and opened the page again.`);
  };

  const browserName = profile?.browser ?? 'your browser';

  return (
    <dialog ref={dialog} className="modal signin-through" aria-labelledby="through-title" onClose={actions.closeSignInThrough} data-testid="signin-through">
      {through && !opened && (
        <div className="modal-body">
          <h1 id="through-title">{through.reason === 'passkey' ? `This sign-in asks for a passkey, which Hatch cannot use` : `Sign in to ${site} through another browser`}</h1>
          <p className="hint">
            Sign in through {browserName} instead, where Touch ID, your phone and security keys work. Hatch then copies the sign-in for <strong>{site}</strong> into this Hatch.
          </p>
          {profiles !== null && profiles.length === 0 && <p className="hint">Hatch found no Chrome, Arc, Brave or Edge on this Mac. Choose another way to sign in on the page.</p>}
          {profiles !== null && profiles.length > 1 && (
            <div className="chips" role="radiogroup" aria-label="Browser">
              {profiles.map((p) => (
                <button key={p.id} type="button" role="radio" aria-checked={chosen === p.id} className={`chip${chosen === p.id ? ' active' : ''}`} onClick={() => setChosen(p.id)}>
                  {several(p.browser) ? `${p.browser} · ${p.profile}` : p.browser}
                </button>
              ))}
            </div>
          )}
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            {profile && (
              <button className="button primary" onClick={() => void open()} autoFocus data-testid="through-open">
                Open {site} in {profile.browser}
              </button>
            )}
            <span className="tool-space" />
            <button className="button" onClick={actions.closeSignInThrough} data-testid="through-close">
              Not now
            </button>
          </div>
        </div>
      )}
      {through && opened && (
        <div className="modal-body">
          <h1 id="through-title">
            Sign in to {site} in {browserName}, then come back
          </h1>
          <p className="hint">Use Touch ID, your phone or a password there. Once the site shows you signed in, press the Hatch button in {browserName}'s toolbar, and this Hatch opens the page again, signed in.</p>
          <p className="hint">Without Hatch's browser extension, bring the sign-in across here instead. macOS then asks for your password, because {browserName} keeps its cookie key in the Keychain. Settings, under Sign-ins, shows how to add the extension.</p>
          {error && (
            <p className="field-error" role="alert" data-testid="through-error">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button className="button primary" disabled={busy} onClick={() => void bring()} autoFocus data-testid="through-bring">
              {busy ? `Hatch is reading ${browserName}` : 'Bring my sign-in across'}
            </button>
            <button className="button" onClick={() => void open()} data-testid="through-reopen">
              Open it again
            </button>
            <span className="tool-space" />
            <button className="button" onClick={actions.closeSignInThrough}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
