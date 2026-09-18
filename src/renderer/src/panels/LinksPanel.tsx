import { useState } from 'react';
import { labelForUrl } from '@shared/address';
import { CloseIcon, PlusIcon } from '../icons';
import { actions, displayAddress, getState, resolveAddress, useStore } from '../state/store';

export function LinksPanel() {
  const links = useStore((s) => s.links);
  const [address, setAddress] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const add = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const resolved = resolveAddress(address);
    if ('error' in resolved) return setError(resolved.error);
    if (links.some((l) => l.url === resolved.url)) return setError('Links already holds this address.');
    await actions.saveLink(name.trim() || labelForUrl(resolved.url), resolved.url);
    setAddress('');
    setName('');
    setError(null);
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
        <div className="add-row">
          <div className="field">
            <input aria-label="Name" placeholder="Name, if you want one" value={name} onChange={(e) => setName(e.target.value)} data-testid="link-name" />
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

      {links.length === 0 ? (
        <p className="hint">Links keeps the places you open often. Add an address above, or use the bookmark icon beside a Hatch's link.</p>
      ) : (
        <ul className="link-list">
          {links.map((link) => (
            <li key={link.id}>
              <button className="link-open" onClick={() => actions.openHatch(link.url)} title={`Open ${link.name} in a new Hatch`}>
                <span className="name">{link.name}</span>
                <span className="mono url">{displayAddress(getState(), link.url)}</span>
              </button>
              <button className="round small quiet" aria-label={`Remove ${link.name}`} title="Remove this link" onClick={() => void actions.removeLink(link.id)}>
                <CloseIcon size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
