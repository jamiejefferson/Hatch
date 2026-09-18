import { useState } from 'react';
import { BinIcon, PlusIcon } from '../icons';
import { useStore } from '../state/store';

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
