import { useEffect, useRef, useState } from 'react';
import { actions, useStore } from '../state/store';

export function NewHatchModal() {
  const open = useStore((s) => s.newHatchOpen);
  const links = useStore((s) => s.links);
  const projects = useStore((s) => s.projects.projects);
  const runningFirst = [...projects].sort((a, b) => Number(b.status === 'running') - Number(a.status === 'running'));
  const dialog = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) {
      setText('');
      setError(null);
      el.showModal();
    } else if (!open && el.open) el.close();
  }, [open]);

  const submit = (e: React.FormEvent): void => {
    e.preventDefault();
    // A bare project name works here, as the placeholder promises.
    const named = projects.find((p) => p.name === text.trim().toLowerCase());
    if (named) return void actions.openProjectInHatch(named.name).then(setError);
    const opened = actions.openHatch(text);
    setError('error' in opened ? opened.error : null);
  };

  return (
    <dialog ref={dialog} className="modal" aria-labelledby="new-hatch-title" onClose={actions.closeNewHatch} onPointerDown={(e) => e.target === e.currentTarget && actions.closeNewHatch()} data-testid="new-hatch-modal">
      <div className="modal-body">
        <h1 id="new-hatch-title">Choose a page for this Hatch</h1>
        <form onSubmit={submit} noValidate>
          <div className={`field large${error ? ' invalid' : ''}`}>
            <input className="mono" aria-label="Link" aria-invalid={error !== null} placeholder="Paste a link or type a project name" spellCheck={false} autoCapitalize="off" value={text} onChange={(e) => setText(e.target.value)} autoFocus data-testid="new-hatch-url" />
            <button type="submit" className="button primary">
              Open
            </button>
          </div>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
        </form>

        {runningFirst.length > 0 && (
          <>
            <h2>Projects</h2>
            <ul className="choice-list">
              {runningFirst.map((p) => (
                <li key={p.name}>
                  <button onClick={() => void actions.openProjectInHatch(p.name).then(setError)}>
                    <span className={`dot${p.status === 'running' ? ' on' : ''}`} />
                    <span className="name">{p.name}</span>
                    <span className="mono url">
                      hatch:{p.name} · {p.framework}
                    </span>
                    <span className="open">{p.status === 'running' ? 'Open' : 'Start and open'}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {links.length > 0 && (
          <>
            <h2>Saved links</h2>
            <ul className="choice-list">
              {links.map((link) => (
                <li key={link.id}>
                  <button onClick={() => {
                    const opened = actions.openHatch(link.url);
                    setError('error' in opened ? opened.error : null);
                  }}>
                    <span className="square" />
                    <span className="name">{link.name}</span>
                    <span className="mono url">{link.url}</span>
                    <span className="open">Open</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </dialog>
  );
}
