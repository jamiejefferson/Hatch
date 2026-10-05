import { useEffect, useRef, useState } from 'react';
import { ACTION_ICONS, type ActionIcon } from '@shared/types';
import { ACTION_ICON_ART } from '../icons';
import { actions, selectedHatch, useStore } from '../state/store';

/** Adds or edits an action button: its name, the app's address and its icon. A new button starts from the selected Hatch's page. */
export function ActionButtonEditor() {
  const editor = useStore((s) => s.actionEditor);
  const button = useStore((s) => (s.actionEditor?.id ? (s.settings.actionButtons.find((b) => b.id === s.actionEditor?.id) ?? null) : null));
  const hatch = useStore(selectedHatch);
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [icon, setIcon] = useState<ActionIcon>('web');
  const [error, setError] = useState<{ field: 'name' | 'url'; message: string } | null>(null);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (editor && !el.open) {
      setName(button?.name ?? '');
      setUrl(button?.url ?? (hatch && /^https?:/.test(hatch.url) ? hatch.url : ''));
      setIcon(button?.icon ?? 'web');
      setError(null);
      el.showModal();
    } else if (!editor && el.open) el.close();
    // The fields fill once as the editor opens, so a page that changes underneath leaves them alone.
  }, [editor]);

  const save = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!name.trim()) return setError({ field: 'name', message: 'Give the button a name.' });
    const message = await actions.saveActionButton({ id: button?.id ?? null, name, url, icon });
    setError(message ? { field: 'url', message } : null);
  };

  return (
    <dialog ref={dialog} className="modal action-editor" aria-labelledby="action-editor-title" onClose={actions.closeActionEditor} onPointerDown={(e) => e.target === e.currentTarget && actions.closeActionEditor()} data-testid="action-editor">
      <form className="modal-body" onSubmit={(e) => void save(e)} noValidate>
        <h1 id="action-editor-title">{button ? 'Edit this action button' : 'Add an action button'}</h1>
        <p className="hint">The button opens the app in Fit to view. Press it again later and Hatch returns to the same page.</p>
        <label className="stacked">
          <span>Name</span>
          <div className={`field${error?.field === 'name' ? ' invalid' : ''}`}>
            <input placeholder="Spreadsheet" maxLength={40} aria-invalid={error?.field === 'name'} value={name} onChange={(e) => { setName(e.target.value); setError(null); }} autoFocus data-testid="action-name" />
          </div>
        </label>
        <label className="stacked">
          <span>Address</span>
          <div className={`field${error?.field === 'url' ? ' invalid' : ''}`}>
            <input className="mono" placeholder="https://docs.google.com/spreadsheets" spellCheck={false} autoCapitalize="off" aria-invalid={error?.field === 'url'} value={url} onChange={(e) => { setUrl(e.target.value); setError(null); }} data-testid="action-url" />
          </div>
        </label>
        <fieldset className="icon-picker">
          <legend>Icon</legend>
          <div role="radiogroup" aria-label="Icon">
            {ACTION_ICONS.map((id) => {
              const { label, Icon } = ACTION_ICON_ART[id];
              return (
                <button key={id} type="button" role="radio" aria-checked={icon === id} aria-label={label} title={label} className={`tool${icon === id ? ' current' : ''}`} onClick={() => setIcon(id)} data-testid={`action-icon-${id}`}>
                  <Icon />
                </button>
              );
            })}
          </div>
        </fieldset>
        {error && (
          <p className="field-error" role="alert">
            {error.message}
          </p>
        )}
        <div className="modal-actions">
          {button && (
            <button type="button" className="text-button underline left danger" onClick={() => void actions.removeActionButton(button.id)} data-testid="action-remove">
              Remove this button
            </button>
          )}
          <span className="tool-space" />
          <button type="button" className="button" onClick={actions.closeActionEditor}>
            Cancel
          </button>
          <button type="submit" className="button primary" data-testid="action-save">
            {button ? 'Save' : 'Add to the toolbar'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
