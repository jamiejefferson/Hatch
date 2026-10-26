import { useEffect, useRef, useState } from 'react';
import { jumpSearch, parseAddress } from '@shared/address';
import { googleSearch } from '@shared/search';
import { ArrowRightIcon, SearchIcon } from '../icons';
import { actions, useStore } from '../state/store';

/** Wait this long after the last key before asking for suggestions. */
const SUGGEST_DELAY_MS = 120;

interface SearchRow {
  key: string;
  label: string;
  url: string;
  kind: 'search' | 'jump';
}

/** Text that is no link and no project searches Google. The rows offer the search, the first result straight away, then Google's suggestions. */
function searchRows(text: string, suggestions: string[]): SearchRow[] {
  const query = text.trim();
  return [
    { key: 'search', label: query, url: googleSearch(query), kind: 'search' },
    { key: 'jump', label: query, url: jumpSearch(query), kind: 'jump' },
    ...suggestions.map((s) => ({ key: `s:${s}`, label: s, url: googleSearch(s), kind: 'search' as const })),
  ];
}

export function NewHatchModal() {
  const open = useStore((s) => s.newHatchOpen);
  const links = useStore((s) => s.links);
  const projects = useStore((s) => s.projects.projects);
  const runningFirst = [...projects].sort((a, b) => Number(b.status === 'running') - Number(a.status === 'running'));
  const dialog = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [highlight, setHighlight] = useState(0);
  const named = projects.find((p) => p.name === text.trim().toLowerCase());
  // Text that starts like an address, such as javascript:, stays an address, so the box can say why it will not open.
  const searching = text.trim() !== '' && !named && !parseAddress(text).ok && !/^[a-z][a-z0-9+.-]*:/i.test(text.trim());
  const rows = searching ? searchRows(text, suggestions) : [];

  // Suggestions follow the typing. An answer that arrives after newer typing is dropped.
  useEffect(() => {
    setHighlight(0);
    if (!searching) return setSuggestions([]);
    let live = true;
    const timer = setTimeout(() => void window.hatch.suggest(text).then((list) => live && setSuggestions(list)), SUGGEST_DELAY_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [text, searching]);

  const go = (url: string): void => {
    const opened = actions.openHatch(url);
    setError('error' in opened ? opened.error : null);
  };

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) {
      setText('');
      setSuggestions([]);
      setError(null);
      el.showModal();
    } else if (!open && el.open) el.close();
  }, [open]);

  const submit = (e: React.FormEvent): void => {
    e.preventDefault();
    // A bare project name works here, as the placeholder promises.
    if (named) return void actions.openProjectInHatch(named.name).then(setError);
    const row = rows[highlight];
    go(row ? row.url : text);
  };
  // The arrow keys move through the search rows, and Enter opens the one marked.
  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (!rows.length || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
    e.preventDefault();
    setHighlight((h) => (h + (e.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length);
  };

  return (
    <dialog ref={dialog} className="modal" aria-labelledby="new-hatch-title" onClose={actions.closeNewHatch} onPointerDown={(e) => e.target === e.currentTarget && actions.closeNewHatch()} data-testid="new-hatch-modal">
      <div className="modal-body">
        <h1 id="new-hatch-title">Choose a page for this Hatch</h1>
        <form onSubmit={submit} noValidate>
          <div className={`field large${error ? ' invalid' : ''}`}>
            <input className="mono" aria-label="Link" aria-invalid={error !== null} placeholder="Search Google, paste a link, or type a project name" spellCheck={false} autoCapitalize="off" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKeyDown} aria-controls="new-hatch-search" aria-activedescendant={rows.length ? `search-row-${highlight}` : undefined} autoFocus data-testid="new-hatch-url" />
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

        {rows.length > 0 && (
          <ul className="choice-list search-list" id="new-hatch-search" role="listbox" aria-label="Search" data-testid="search-rows">
            {rows.map((row, i) => (
              <li key={row.key} id={`search-row-${i}`} role="option" aria-selected={i === highlight}>
                <button className={i === highlight ? 'current' : ''} onPointerMove={() => setHighlight(i)} onClick={() => go(row.url)} data-testid={`search-row-${row.key === 'search' || row.key === 'jump' ? row.key : 'suggestion'}`}>
                  {row.kind === 'jump' ? <ArrowRightIcon /> : <SearchIcon />}
                  <span className="query">{row.label}</span>
                  <span className="mono url">{row.kind === 'jump' ? 'Go straight to the first result' : 'Search Google'}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

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
