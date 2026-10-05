import { useEffect, useState } from 'react';
import { DEVICE_TEMPLATES } from '@shared/templates';
import { pages } from '../canvas/webviews';
import { folderName } from '@shared/project-canvas';
import { CheckIcon, CopyIcon, DesktopIcon, FolderIcon, LaptopIcon, MobileIcon, SaveLinkIcon, TabletLandscapeIcon, TabletPortraitIcon } from '../icons';
import { actions, displayAddress, effectiveSize, hatchLabel, resolveAddress, selectedHatch, tabLabel, useStore } from '../state/store';
import type { Hatch } from '@shared/types';

const DEVICE_ICONS: Record<string, (p: { size?: number }) => React.ReactElement> = { desktop: DesktopIcon, laptop: LaptopIcon, tablet: TabletPortraitIcon, 'tablet-landscape': TabletLandscapeIcon, mobile: MobileIcon };

/** The selected Hatch's title, link and size. Page tools sit in the toolbar and comments in their own tab. */
export function HatchPanel() {
  const hatch = useStore(selectedHatch);
  return hatch ? (
    <SelectedHatch hatch={hatch} />
  ) : (
    <CanvasSettings />
  );
}

/** With no Hatch selected, the sidebar speaks for the canvas: its name and the project folder an agent working there uses it for. */
function CanvasSettings() {
  const tabId = useStore((s) => s.workspace.activeTabId);
  const label = useStore((s) => {
    const t = s.workspace.tabs.find((x) => x.id === s.workspace.activeTabId);
    return t ? tabLabel(s, t) : '';
  });
  const folder = useStore((s) => s.workspace.tabs.find((x) => x.id === s.workspace.activeTabId)?.folder ?? '');
  return (
    <>
      <header className="panel-head">
        <h1 className="panel-title grow">{label}</h1>
      </header>
      <section className="canvas-folder" data-testid="canvas-settings">
        <h2>Project folder</h2>
        {folder ? (
          <p className="folder-line">
            <FolderIcon size={14} />
            <span className="project-text">
              <span className="name">{folderName(folder)}</span>
              <span className="mono url">{folder.replace(/^\/Users\/[^/]+/, '~')}</span>
            </span>
          </p>
        ) : null}
        <p className="hint">{folder ? 'An agent working in this folder, or in a folder inside it, opens its pages on this canvas and leaves your other canvases alone.' : 'Attach this canvas to the folder where a project’s work takes place. An agent working in that folder then opens its pages here and leaves your other canvases alone.'}</p>
        <div className="folder-actions">
          <button className="button left" onClick={() => actions.askFolderFor(tabId)} data-testid="attach-current">
            {folder ? 'Change the folder' : 'Attach to a project folder'}
          </button>
          {folder && (
            <button className="text-button underline left" onClick={() => actions.attachCanvas(tabId, null)} data-testid="detach-folder">
              Detach the folder
            </button>
          )}
        </div>
      </section>
      <p className="hint">Select a Hatch on the canvas or in the Hatches list to see its link and size here.</p>
    </>
  );
}

function SelectedHatch({ hatch }: { hatch: Hatch }) {
  useStore((s) => s.viewport);
  const saved = useStore((s) => s.links.some((l) => l.url === hatch.url));
  const grabbed = useStore((s) => (s.grabbed?.hatchId === hatch.id ? s.grabbed : null));
  const fit = hatch.template === 'fit';
  const { width, height } = effectiveSize(hatch);
  const id = hatch.id;

  return (
    <>
      <header className="panel-head">
        <h1 className="panel-title grow">{hatchLabel(hatch)}</h1>
      </header>

      <section>
        <h2>Link</h2>
        <LinkField key={id} hatchId={id} url={hatch.url} saved={saved} title={hatchLabel(hatch)} />
      </section>

      <section>
        <h2>Size</h2>
        <div className="size-row">
          <SizeField label="W" name="Width" value={width} onCommit={(w) => actions.resizeHatch(id, w, height)} />
          <SizeField label="H" name="Height" value={height} onCommit={(h) => actions.resizeHatch(id, width, h)} />
        </div>
        <div role="radiogroup" aria-label="Device template" className="chips">
          {DEVICE_TEMPLATES.map((t) => {
            const active = !fit && hatch.template === t.id;
            const Icon = DEVICE_ICONS[t.id]!;
            return (
              <button key={t.id} role="radio" aria-checked={active} aria-label={`${t.name}, ${t.size.width} × ${t.size.height}`} className={`round${active ? ' primary' : ''}`} title={`${t.name} · ${t.size.width} × ${t.size.height}`} onClick={() => actions.applyTemplate(id, t.id)} data-testid={`template-${t.id}`}>
                <Icon />
              </button>
            );
          })}
        </div>
      </section>

      {grabbed && (
        <section>
          <h2>Grab for Paper</h2>
          <p className={grabbed.ok ? 'hint' : 'field-error'} role="status" data-testid="grab-result">
            {grabbed.text}
          </p>
        </section>
      )}
    </>
  );
}

function LinkField({ hatchId, url, saved, title }: { hatchId: string; url: string; saved: boolean; title: string }) {
  const shown = useStore((s) => displayAddress(s, url));
  const [text, setText] = useState(shown);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // The field follows the page as it navigates, unless the person is typing in it.
  useEffect(() => {
    setText(shown);
    setError(null);
  }, [shown]);

  const go = (e: React.FormEvent): void => {
    e.preventDefault();
    const resolved = resolveAddress(text, true);
    if ('error' in resolved) return setError(resolved.error);
    setError(null);
    pages.navigate(hatchId, resolved.url);
    (document.activeElement as HTMLElement | null)?.blur();
  };

  const copy = async (): Promise<void> => {
    await window.hatch.copyText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <form onSubmit={go} noValidate>
      <div className={`field${error ? ' invalid' : ''}`}>
        <input
          className="mono"
          aria-label="Link"
          aria-invalid={error !== null}
          aria-describedby={error ? 'link-error' : undefined}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            if (e.key !== 'Escape') return;
            setText(shown);
            setError(null);
            e.currentTarget.blur();
          }}
          data-testid="link-field"
        />
        <button type="button" className="field-action" aria-label={copied ? 'Link copied' : 'Copy link'} onClick={() => void copy()}>
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
        <button type="button" className="field-action" aria-label={saved ? 'This link is saved in Links' : 'Save this link'} title={saved ? 'Saved in Links' : 'Save this link'} aria-pressed={saved} disabled={saved} onClick={() => void actions.saveLink(title, url)} data-testid="save-link">
          <SaveLinkIcon />
        </button>
      </div>
      {error && (
        <p className="field-error" id="link-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

function SizeField({ label, name, value, onCommit }: { label: string; name: string; value: number; onCommit(n: number): void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);

  const commit = (): void => {
    const n = Number.parseInt(text, 10);
    if (Number.isFinite(n) && n !== value) onCommit(n);
    else setText(String(value));
  };

  return (
    <label className="field size-field">
      <span className="prefix" aria-hidden="true">
        {label}
      </span>
      <input
        className="mono"
        aria-label={`${name} in pixels`}
        inputMode="numeric"
        value={text}
        onChange={(e) => setText(e.target.value.replace(/[^\d]/g, ''))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setText(String(value));
            e.currentTarget.blur();
          }
        }}
        data-testid={`size-${label.toLowerCase()}`}
      />
    </label>
  );
}
