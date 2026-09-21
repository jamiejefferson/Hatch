import { useEffect, useState } from 'react';
import { parseAddress } from '@shared/address';
import { CheckIcon, CloseIcon, ProjectsIcon } from '../icons';
import { ConnectSteps } from '../shell/Connect';
import { actions, useStore } from '../state/store';

export function SettingsPanel() {
  const page = useStore((s) => s.settings.newHatchPage);
  const settings = useStore((s) => s.settings);
  const connection = useStore((s) => s.connection);
  const [text, setText] = useState(page);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setText(page), [page]);

  // macOS confirms the change in its own dialog, so the answer is read again whenever the window regains focus.
  const [browser, setBrowser] = useState<'default' | 'other' | 'unavailable' | null>(null);
  useEffect(() => {
    const read = (): void => void window.hatch.defaultBrowser().then(setBrowser);
    read();
    window.addEventListener('focus', read);
    return () => window.removeEventListener('focus', read);
  }, []);

  const save = (e: React.FormEvent): void => {
    e.preventDefault();
    const value = text.trim();
    if (value) {
      const parsed = parseAddress(value);
      if (!parsed.ok) return setError(parsed.error);
    }
    setError(null);
    void actions.setNewHatchPage(value);
  };

  return (
    <>
    <header className="panel-head">
      <h1 className="panel-title">Settings</h1>
    </header>
    {connection && (
      <section>
        <h2>Details for your agent</h2>
        <ConnectSteps connection={connection} />
      </section>
    )}
    <section>
      <h2 id="new-hatch-page">Hatch Home</h2>
      <form onSubmit={save} noValidate>
        <div className={`field${error ? ' invalid' : ''}`}>
          <input className="mono" aria-labelledby="new-hatch-page" aria-invalid={error !== null} placeholder="Ask each time" spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} onBlur={save} data-testid="new-hatch-page" />
        </div>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </form>
      <p className="hint">Every new Hatch opens this page. Leave the field empty and Hatch asks which page to open.</p>
    </section>
    <section data-testid="default-browser">
      <h2>Default browser</h2>
      {browser === 'default' ? (
        <p className="status-line">
          <span className="dot on" /> Hatch is your default browser.
        </p>
      ) : (
        <button className="button left" disabled={browser !== 'other'} onClick={() => void window.hatch.makeDefaultBrowser().then(setBrowser)} data-testid="make-default">
          Make Hatch the default browser
        </button>
      )}
      <p className="hint">{browser === 'unavailable' ? 'This works in the installed app. A build run from source has no place in the macOS browser list.' : browser === 'default' ? 'A link you click in another app opens in a new Hatch. System Settings, under Desktop & Dock, changes it back.' : 'A link you click in another app then opens in a new Hatch. macOS asks you to confirm.'}</p>
    </section>
    <section>
      <h2>Folders</h2>
      <FolderRow label="Saved links" value={settings.linksFolder} fallback="~/.hatch" onChange={(linksFolder) => void actions.updateSettings({ linksFolder })} testid="links-folder" />
      <FolderRow label="Comments on sites" value={settings.commentsFolder} fallback="~/.hatch/sites" onChange={(commentsFolder) => void actions.updateSettings({ commentsFolder })} testid="comments-folder" />
      <p className="hint">Hatch keeps links.json in the first folder, and one folder of comment files per site in the second. Comments on a project stay inside that project. Comment files already written stay where they are.</p>
    </section>
    <section>
      <h2>Agents</h2>
      <Switch label="Ask before an agent switches a Hatch's view" checked={settings.askBeforeViewSwitch} onChange={(v) => void actions.updateSettings({ askBeforeViewSwitch: v })} />
      <p className="hint">Switched off, Hatch shows the agent's reason and then switches.</p>
      <Switch label="Let agents run script in pages" checked={settings.allowEvaluate} onChange={(v) => void actions.updateSettings({ allowEvaluate: v })} />
      <p className="hint">Agents read and operate pages without this. Switch it on for an agent you trust with the pages you open.</p>
    </section>
    <JevSection />
    <section>
      <h2>Data</h2>
      <button className="text-button underline left" onClick={() => void window.hatch.openDataFolder()}>
        Open the Hatch data folder
      </button>
      <button className="text-button underline left" onClick={() => void window.hatch.openLog()}>
        Show this session's log
      </button>
    </section>
    {connection && <p className="mono version">Hatch {connection.version}</p>}
    </>
  );
}

const tilde = (path: string): string => path.replace(/^\/Users\/[^/]+/, '~');

function FolderRow({ label, value, fallback, onChange, testid }: { label: string; value: string; fallback: string; onChange(folder: string): void; testid: string }) {
  return (
    <div className="labelled">
      <span>{label}</span>
      <div className="field">
        <span className="mono folder-path" title={value || fallback} data-testid={testid}>
          {tilde(value) || fallback}
        </span>
        {value && (
          <button type="button" className="field-action" aria-label={`Use Hatch's own folder for ${label.toLowerCase()}`} title="Use Hatch's own folder" onClick={() => onChange('')}>
            <CloseIcon size={12} />
          </button>
        )}
        <button type="button" className="field-action" aria-label={`Choose the folder for ${label.toLowerCase()}`} title="Choose a folder" onClick={() => void window.hatch.pickFolder(`Choose the folder for ${label.toLowerCase()}`).then((folder) => folder && onChange(folder))}>
          <ProjectsIcon />
        </button>
      </div>
    </div>
  );
}

function JevSection() {
  const on = useStore((s) => s.settings.describeElements);
  const [held, setHeld] = useState<boolean | null>(null);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [hint, setHint] = useState('');
  const [test, setTest] = useState<{ state: 'idle' | 'running' | 'ok' } | { state: 'failed'; error: string }>({ state: 'idle' });
  useEffect(() => void window.hatch.hasJevKey().then(setHeld), []);
  useEffect(() => void (held && window.hatch.jevKeyHint().then(setHint)), [held]);
  const connected = held === true && on;

  const connect = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!text.trim() || saving) return;
    setSaving(true);
    setError(null);
    const result = await window.hatch.setJevKey(text);
    setSaving(false);
    if (!result.ok) return setError(result.error);
    await actions.updateSettings({ describeElements: true });
    setHeld(true);
    setText('');
    setJustSaved(true);
  };

  const disconnect = async (): Promise<void> => {
    await window.hatch.setJevKey('');
    await actions.updateSettings({ describeElements: false });
    setHeld(false);
    setJustSaved(false);
    setTest({ state: 'idle' });
  };

  const runTest = async (): Promise<void> => {
    setTest({ state: 'running' });
    const result = await window.hatch.testJev();
    setTest(result.ok ? { state: 'ok' } : { state: 'failed', error: result.error });
  };

  return (
    <section data-testid="jev">
      <h2>Connect Jev</h2>
      <p className="hint">Jev helps your agent browse faster. Your agent names an element in plain words, such as "the button that refuses cookies", and Jev finds it on the page. Your agent can also hand Jev a whole goal, such as a search, and Jev takes the steps. The Activity panel shows each run with its steps and its cost.</p>
      {connected ? (
        <>
          <p className="said-ok" role="status" data-testid="jev-connected">
            <CheckIcon size={14} />
            {justSaved ? 'Your key is saved and Jev is connected.' : 'Jev is connected.'}
          </p>
          <p className="hint">Your agent uses Jev from its next action. Hatch keeps the key locked in this Mac's Keychain.</p>
          {hint && (
            <p className="hint mono" data-testid="jev-hint">
              The saved key ends in ••••{hint}
            </p>
          )}
          {test.state === 'ok' && (
            <p className="said-ok" role="status" data-testid="jev-test-ok">
              <CheckIcon size={14} />
              Jev answered, so the connection works.
            </p>
          )}
          {test.state === 'failed' && (
            <p className="field-error" role="alert" data-testid="jev-test-error">
              {test.error}
            </p>
          )}
          <button type="button" className="button left" disabled={test.state === 'running'} onClick={() => void runTest()} data-testid="jev-test">
            {test.state === 'running' ? 'Asking Jev…' : 'Test the connection'}
          </button>
          <button type="button" className="button left" onClick={() => void disconnect()} data-testid="jev-disconnect">
            Disconnect Jev
          </button>
        </>
      ) : (
        <form onSubmit={(e) => void connect(e)} noValidate>
          <div className={`field${error ? ' invalid' : ''}`}>
            <input type="password" aria-label="Jev key" placeholder="Paste your Jev key" spellCheck={false} autoComplete="off" value={text} onChange={(e) => setText(e.target.value)} data-testid="jev-key" />
          </div>
          {error && (
            <p className="field-error" role="alert" data-testid="jev-error">
              {error}
            </p>
          )}
          <button type="submit" className="button primary left" disabled={saving || !text.trim()} data-testid="jev-save">
            {saving ? 'Checking the key…' : 'Save and connect'}
          </button>
          <p className="hint">Jev comes from TypeSafe. You get a key at console.typesafe.ai/settings/keys, and one key covers finding elements and running goals.</p>
        </form>
      )}
      <p className="hint">To do this, Hatch sends Jev a text outline of the page your agent is working on. A page where Hatch filled one of your saved sign-ins is never sent.</p>
    </section>
  );
}

function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange(value: boolean): void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className="switch-row" onClick={() => onChange(!checked)}>
      <span>{label}</span>
      <span className="switch" aria-hidden="true" />
    </button>
  );
}
