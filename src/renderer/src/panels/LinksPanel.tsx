import { useState } from 'react';
import { labelForUrl } from '@shared/address';
import { groupLinks } from '@shared/canvases';
import type { SavedLink } from '@shared/types';
import { ChevronIcon, CloseIcon, FolderIcon, PlusIcon } from '../icons';
import { actions, displayAddress, getState, resolveAddress, useStore } from '../state/store';

const CLOSED_KEY = 'hatch.closedLinkFolders';

/** The folders the user has closed, kept in this window's storage so they stay closed between visits to the panel. */
function readClosed(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(CLOSED_KEY) ?? '[]') as unknown;
    return new Set(Array.isArray(raw) ? raw.filter((f): f is string => typeof f === 'string') : []);
  } catch {
    return new Set();
  }
}

function writeClosed(closed: Set<string>): void {
  try {
    localStorage.setItem(CLOSED_KEY, JSON.stringify([...closed]));
  } catch {
    // Storage may be off. The folders then open again next time, which loses nothing.
  }
}

export function LinksPanel() {
  const links = useStore((s) => s.links);
  const [address, setAddress] = useState('');
  const [name, setName] = useState('');
  const [folder, setFolder] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState<Set<string>>(readClosed);
  const [renaming, setRenaming] = useState<string | null>(null);
  const groups = groupLinks(links);
  const folders = groups.map((g) => g.folder).filter(Boolean);

  const add = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const resolved = resolveAddress(address);
    if ('error' in resolved) return setError(resolved.error);
    if (links.some((l) => l.url === resolved.url)) return setError('Links already holds this address.');
    await actions.saveLink(name.trim() || labelForUrl(resolved.url), resolved.url, folder);
    setAddress('');
    setName('');
    setError(null);
  };

  const toggle = (name: string): void => {
    const next = new Set(closed);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    writeClosed(next);
    setClosed(next);
  };

  const rename = async (from: string, to: string): Promise<void> => {
    setRenaming(null);
    const next = to.trim();
    if (next === from) return;
    await actions.renameLinkFolder(from, next);
    if (closed.has(from)) {
      const set = new Set(closed);
      set.delete(from);
      if (next) set.add(next);
      writeClosed(set);
      setClosed(set);
    }
  };

  return (
    <>
      <header className="panel-head">
        <h1 className="panel-title">Links</h1>
      </header>

      <form className="add-form" onSubmit={(e) => void add(e)} noValidate>
        <div className={`field${error ? ' invalid' : ''}`}>
          <input className="mono" aria-label="Address" aria-invalid={error !== null} placeholder="Paste an address" spellCheck={false} autoCapitalize="off" value={address} onChange={(e) => setAddress(e.target.value)} data-testid="link-address" />
        </div>
        <div className="field">
          <input aria-label="Name" placeholder="Name, if you want one" value={name} onChange={(e) => setName(e.target.value)} data-testid="link-name" />
        </div>
        <div className="add-row">
          <div className="field">
            <input aria-label="Folder" placeholder="Folder, if you want one" list="link-folders" value={folder} onChange={(e) => setFolder(e.target.value)} data-testid="link-folder" />
          </div>
          <button type="submit" className="round primary" aria-label="Add this link" title="Add this link" disabled={!address.trim()} data-testid="link-add">
            <PlusIcon />
          </button>
        </div>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </form>
      <datalist id="link-folders">
        {folders.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>

      {links.length === 0 ? (
        <p className="hint">Links keeps the places you open often. Add an address above, or use the bookmark icon beside a Hatch's link. A folder name groups links together.</p>
      ) : (
        groups.map((group) =>
          group.folder === '' ? (
            <ul key="" className="link-list" data-testid="link-list">
              {group.links.map((link) => (
                <LinkRow key={link.id} link={link} folders={folders} />
              ))}
            </ul>
          ) : (
            <section key={group.folder} className="link-folder" data-testid={`link-folder-${group.folder}`}>
              {renaming === group.folder ? (
                <input
                  className="tab-rename folder-rename"
                  aria-label="Folder name"
                  defaultValue={group.folder}
                  autoFocus
                  onFocus={(e) => e.target.select()}
                  onBlur={(e) => void rename(group.folder, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                    if (e.key === 'Escape') setRenaming(null);
                  }}
                  data-testid="folder-rename"
                />
              ) : (
                <button className="folder-head" aria-expanded={!closed.has(group.folder)} title={`${group.folder}. Double-click to rename.`} onClick={() => toggle(group.folder)} onDoubleClick={() => setRenaming(group.folder)}>
                  <span className="chevron">
                    <ChevronIcon size={12} />
                  </span>
                  <span className="name">{group.folder}</span>
                  <span className="count">{group.links.length}</span>
                </button>
              )}
              {!closed.has(group.folder) && (
                <ul className="link-list">
                  {group.links.map((link) => (
                    <LinkRow key={link.id} link={link} folders={folders} />
                  ))}
                </ul>
              )}
            </section>
          ),
        )
      )}
    </>
  );
}

/** One saved link. The folder button turns the row into a field that names the folder the link moves to. */
function LinkRow({ link, folders }: { link: SavedLink; folders: string[] }) {
  const [moving, setMoving] = useState(false);
  const shown = displayAddress(getState(), link.url);

  const move = async (to: string): Promise<void> => {
    setMoving(false);
    if (to.trim() === (link.folder ?? '')) return;
    await actions.moveLink(link.id, to);
  };

  if (moving) {
    return (
      <li>
        <form
          className="link-move"
          onSubmit={(e) => {
            e.preventDefault();
            (e.currentTarget.elements.namedItem('folder') as HTMLInputElement).blur();
          }}
        >
          <div className="field">
            <input
              name="folder"
              aria-label={`Folder for ${link.name}`}
              placeholder="Folder name, or empty for none"
              list="link-folders"
              defaultValue={link.folder ?? ''}
              autoFocus
              onFocus={(e) => e.target.select()}
              onBlur={(e) => void move(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setMoving(false);
              }}
              data-testid="link-move"
            />
          </div>
        </form>
      </li>
    );
  }

  return (
    <li>
      <button className="link-open" onClick={() => actions.openHatch(link.url)} title={`Open ${link.name} in a new Hatch`}>
        <span className="name">{link.name}</span>
        <span className="mono url">{shown}</span>
      </button>
      <button className="round small quiet" aria-label={`Move ${link.name} to a folder`} title={folders.length ? 'Move to a folder' : 'Put in a folder'} onClick={() => setMoving(true)}>
        <FolderIcon size={12} />
      </button>
      <button className="round small quiet" aria-label={`Remove ${link.name}`} title="Remove this link" onClick={() => void actions.removeLink(link.id)}>
        <CloseIcon size={12} />
      </button>
    </li>
  );
}
