import { useEffect, useState } from 'react';
import { parseAddress } from '@shared/address';
import { CloseIcon, ProjectsIcon } from '../icons';
import { ConnectSteps } from '../shell/Connect';
import { actions, useStore } from '../state/store';

export function SettingsPanel() {
  const page = useStore((s) => s.settings.newHatchPage);
  const settings = useStore((s) => s.settings);
  const connection = useStore((s) => s.connection);
  const [text, setText] = useState(page);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setText(page), [page]);

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

function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange(value: boolean): void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className="switch-row" onClick={() => onChange(!checked)}>
      <span>{label}</span>
      <span className="switch" aria-hidden="true" />
    </button>
  );
}
