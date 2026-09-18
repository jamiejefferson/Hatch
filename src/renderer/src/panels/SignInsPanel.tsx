import { useEffect, useState } from 'react';
import { siteOf, type BrowserProfile } from '@shared/cookie-import';
import { pages } from '../canvas/webviews';
import { BinIcon, PlusIcon } from '../icons';
import { selectedHatch, useStore } from '../state/store';

/** Saved sign-ins. The password goes to the main process once, on save, and never comes back. */
export function SignInsPanel() {
  const signIns = useStore((s) => s.signIns);
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState({ site: '', username: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async (): Promise<void> => {
    setSaving(true);
    const result = await window.hatch.addSignIn(form);
    setSaving(false);
    setError(result.ok ? null : result.error);
    if (result.ok) setForm({ site: '', username: '', password: '' });
  };
  const field = (key: keyof typeof form, label: string, type = 'text') => (
    <label className="field">
      <input type={type} aria-label={label} placeholder={label} value={form[key]} spellCheck={false} autoComplete="off" onChange={(e) => setForm({ ...form, [key]: e.target.value })} data-testid={`signin-${key}`} />
    </label>
  );

  return (
    <>
      <header className="panel-head">
        <h1 className="panel-title">Sign-ins</h1>
      </header>
      <p className="hint">Hatch fills a saved sign-in for an agent after you agree. Passwords stay encrypted with a key in the macOS Keychain, and agents see the site and the username only.</p>
      <form
        className="add-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {field('site', 'Site')}
        {field('username', 'Username')}
        {field('password', 'Password', 'password')}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="button primary" disabled={saving || !form.site.trim() || !form.username.trim() || !form.password}>
          <PlusIcon /> Save this sign-in
        </button>
      </form>
      <BringSignIn />
      {signIns.length > 0 && (
        <ul className="signin-list">
          {signIns.map((s) => (
            <li key={s.id}>
              <button className="signin-row" aria-expanded={open === s.id} onClick={() => setOpen(open === s.id ? null : s.id)}>
                <span className="project-text">
                  <span className="name">{s.site}</span>
                  <span className="mono url">{s.username}</span>
                </span>
                <span className={s.allow === 'always' ? 'state strong' : 'state'}>{s.allow === 'always' ? 'Always allowed' : 'Asks each time'}</span>
              </button>
              {open === s.id && (
                <div className="signin-edit">
                  <button type="button" role="switch" aria-checked={s.allow === 'always'} className="switch-row" onClick={() => void window.hatch.setSignInAllow(s.id, s.allow === 'always' ? 'ask' : 'always')}>
                    <span>Let agents fill this without asking</span>
                    <span className="switch" aria-hidden="true" />
                  </button>
                  <button className="button" onClick={() => void window.hatch.removeSignIn(s.id)}>
                    <BinIcon /> Remove this sign-in
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * Google refuses to sign anyone in inside Hatch, so a site that offers Google alone needs another way in.
 * The user signs in to the site in their own browser, and Hatch copies that one site's cookies across.
 */
function BringSignIn() {
  const hatch = useStore(selectedHatch);
  const [profiles, setProfiles] = useState<BrowserProfile[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => void window.hatch.browserProfiles().then((found) => (setProfiles(found), setChosen(found[0]?.id ?? null))), []);

  const url = hatch?.url ?? '';
  const site = URL.canParse(url) && /^https?:$/.test(new URL(url).protocol) ? siteOf(new URL(url).hostname) : null;
  const profile = profiles?.find((p) => p.id === chosen) ?? null;
  const several = (browser: string): boolean => (profiles ?? []).filter((p) => p.browser === browser).length > 1;

  const bring = async (): Promise<void> => {
    if (!hatch || !profile) return;
    setBusy(true);
    setSaid(null);
    const result = await window.hatch.importSignIn(url, profile.id);
    setBusy(false);
    if (!result.ok) return setSaid({ ok: false, text: result.error });
    pages.reload(hatch.id);
    setSaid({ ok: true, text: `Hatch copied ${result.value.count} ${result.value.count === 1 ? 'cookie' : 'cookies'} for ${result.value.site} from ${result.value.browser} and reloaded the page.` });
  };

  return (
    <section data-testid="bring-signin">
      <h2>Bring a sign-in from another browser</h2>
      <p className="hint">Google refuses to sign anyone in inside Hatch. Sign in to the site in your usual browser, open the same site in a Hatch, then copy the sign-in across. Hatch copies the cookies for that one site.</p>
      {profiles !== null && profiles.length === 0 && <p className="hint">Hatch found no Chrome, Arc, Brave or Edge on this Mac.</p>}
      {profiles !== null && profiles.length > 1 && (
        <div className="chips" role="radiogroup" aria-label="Browser">
          {profiles.map((p) => (
            <button key={p.id} type="button" role="radio" aria-checked={chosen === p.id} className={`chip${chosen === p.id ? ' active' : ''}`} onClick={() => setChosen(p.id)}>
              {several(p.browser) ? `${p.browser} · ${p.profile}` : p.browser}
            </button>
          ))}
        </div>
      )}
      {profile && (
        <p className="status-line" data-testid="bring-signin-site">{site ? <>The selected Hatch shows&nbsp;<strong>{site}</strong>.</> : 'Select a Hatch that shows the site.'}</p>
      )}
      {profile && (
        <button className="button left" disabled={busy || !site} onClick={() => void bring()} data-testid="bring-signin-go">
          {busy ? `Hatch is reading ${profile.browser}` : `Bring my sign-in from ${profile.browser}`}
        </button>
      )}
      {profile && site && !said && <p className="hint">macOS asks for your password the first time, because {profile.browser} keeps its cookie key in the Keychain.</p>}
      {said && (
        <p className={said.ok ? 'hint' : 'field-error'} role={said.ok ? 'status' : 'alert'} data-testid="bring-signin-said">
          {said.text}
        </p>
      )}
    </section>
  );
}
