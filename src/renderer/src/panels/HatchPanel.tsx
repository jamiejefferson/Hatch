import { useEffect, useState } from 'react';
import { DEVICE_TEMPLATES } from '@shared/templates';
import { pages } from '../canvas/webviews';
import { DesktopIcon, LaptopIcon, MobileIcon, TabletLandscapeIcon, TabletPortraitIcon } from '../icons';
import { BackIcon, CheckIcon, CloseIcon, CommentIcon, CopyIcon, EyeIcon, FitIcon, GrabIcon, MinusIcon, OutlineIcon, PlusIcon, ReleaseIcon, ReloadIcon, SaveIcon, SaveLinkIcon, ShowAllIcon, StopIcon } from '../icons';
import { actions, activeTab, displayAddress, effectiveSize, fitHatch, hatchLabel, loadStateOf, resolveAddress, selectedHatch, tabLabel, useStore } from '../state/store';
import type { Hatch, Tab } from '@shared/types';

const DEVICE_ICONS: Record<string, (p: { size?: number }) => React.ReactElement> = { desktop: DesktopIcon, laptop: LaptopIcon, tablet: TabletPortraitIcon, 'tablet-landscape': TabletLandscapeIcon, mobile: MobileIcon };

/** With a Hatch selected the panel holds every control for it. With none selected it lists the tab's Hatches and holds the canvas controls. */
export function HatchPanel() {
  const hatch = useStore(selectedHatch);
  return hatch ? <SelectedHatch hatch={hatch} /> : <CanvasOverview />;
}

function NewHatchButton() {
  return (
    <button className="round primary" aria-label="New Hatch" title="New Hatch" onClick={actions.requestNewHatch} data-testid="new-hatch">
      <PlusIcon />
    </button>
  );
}

function CanvasOverview() {
  const tab = useStore(activeTab);
  const working = useStore((s) => s.work.hatches);
  const fit = fitHatch(tab);
  return (
    <>
      <header className="panel-head">
        <h1 className="panel-title">Hatches</h1>
        <NewHatchButton />
      </header>

      {tab.hatches.length === 0 ? (
        <p className="hint">This canvas has no Hatches yet. A Hatch is one live page in a frame.</p>
      ) : (
        <ul className="hatch-list" data-testid="hatch-list">
          {tab.hatches.map((h) => (
            <li key={h.id} onContextMenu={(e) => actions.openContextMenu(e, tab.id, h.id)}>
              <button className="hatch-row" onClick={() => actions.reveal(h.id)} title={`Select ${hatchLabel(h)}`}>
                <span className="project-text">
                  <span className="name">{hatchLabel(h)}</span>
                  <span className="mono url">
                    {h.width} × {h.height}
                  </span>
                </span>
                {working[h.id] && <span className="working-dot" role="img" aria-label="An agent is working in this Hatch" />}
              </button>
              <button className="round small quiet" aria-label={`Close ${hatchLabel(h)}`} title="Close this Hatch" onClick={() => actions.closeHatch(h.id)}>
                <CloseIcon size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {!fit && (
        <section>
          <h2>Canvas</h2>
          <div className="control-row">
            <div className="zoom" role="group" aria-label="Canvas zoom">
              <button aria-label="Zoom out" title="Zoom out" onClick={() => actions.zoomStep(-1)}>
                <MinusIcon size={14} />
              </button>
              <button className="mono level" aria-label="Show the canvas at 100%" title="Show the canvas at 100%" onClick={() => actions.zoomTo(1)}>
                <output aria-live="polite" data-testid="zoom-level">
                  {Math.round(tab.zoom * 100)}%
                </output>
              </button>
              <button aria-label="Zoom in" title="Zoom in" onClick={() => actions.zoomStep(1)}>
                <PlusIcon size={14} />
              </button>
            </div>
            <button className="round" aria-label="Show every Hatch" title="Show every Hatch" disabled={tab.hatches.length === 0} onClick={actions.showAll} data-testid="show-all">
              <ShowAllIcon />
            </button>
          </div>
          <p className="hint">Drag the canvas to pan it. Pinch, or hold Cmd and scroll, to zoom. Tap a Hatch twice to fit it to the view.</p>
        </section>
      )}

      <CanvasesSection tab={tab} />
    </>
  );
}

const hatchCount = (n: number): string => `${n} ${n === 1 ? 'Hatch' : 'Hatches'}`;

/** Every open canvas, a field that saves this one under a name, and the saved canvases, which open as new tabs. */
function CanvasesSection({ tab }: { tab: Tab }) {
  const tabs = useStore((s) => s.workspace.tabs);
  const labels = useStore((s) => s.workspace.tabs.map((t) => tabLabel(s, t)).join('\n')).split('\n');
  const working = useStore((s) => s.work.tabs);
  const saved = useStore((s) => s.savedCanvases);
  const label = labels[tabs.findIndex((t) => t.id === tab.id)] ?? '';
  const [name, setName] = useState(label);
  const [error, setError] = useState<string | null>(null);
  const [typedFor, setTypedFor] = useState(tab.id);

  // The field offers the canvas's own name until the user types one, and starts again on another canvas.
  if (typedFor !== tab.id) {
    setTypedFor(tab.id);
    setName(label);
  }

  const save = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(await actions.saveCanvas(tab.id, name));
  };

  return (
    <>
      <section data-testid="canvases">
        <h2>Canvases</h2>
        <ul className="hatch-list canvas-list" data-testid="canvas-list">
          {tabs.map((t, i) => (
            <li key={t.id} className={t.id === tab.id ? 'current' : ''}>
              <button className="hatch-row" aria-current={t.id === tab.id ? 'true' : undefined} onClick={() => actions.activateTab(t.id)} title={`Show ${labels[i]}`}>
                <span className="project-text">
                  <span className="name">{labels[i]}</span>
                  <span className="url">{hatchCount(t.hatches.length)}</span>
                </span>
                {working[t.id] && <span className="working-dot" role="img" aria-label="An agent is working in this canvas" />}
              </button>
              <button className="round small quiet" aria-label={`Close ${labels[i]}`} title="Close this canvas" onClick={() => actions.closeTab(t.id)}>
                <CloseIcon size={12} />
              </button>
            </li>
          ))}
        </ul>
        <form className="add-row" onSubmit={(e) => void save(e)} noValidate>
          <div className={`field${error ? ' invalid' : ''}`}>
            <input aria-label="Name for the saved canvas" aria-invalid={error !== null} placeholder="Name this canvas to save it" value={name} onChange={(e) => setName(e.target.value)} onFocus={(e) => e.target.select()} data-testid="canvas-name" />
          </div>
          <button type="submit" className="round primary" aria-label="Save this canvas" title="Save this canvas" disabled={!name.trim() || tab.hatches.length === 0} data-testid="save-canvas">
            <SaveIcon />
          </button>
        </form>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <p className="hint">Saving keeps this canvas's Hatches, sizes and places under the name. Saving again under the same name replaces it.</p>
      </section>

      {saved.length > 0 && (
        <section data-testid="saved-canvases">
          <h2>Saved canvases</h2>
          <ul className="hatch-list" data-testid="saved-canvas-list">
            {saved.map((c) => (
              <li key={c.id}>
                <button className="hatch-row" onClick={() => actions.openSavedCanvas(c.id)} title={`Open ${c.name} as a new canvas`}>
                  <span className="project-text">
                    <span className="name">{c.name}</span>
                    <span className="url">{hatchCount(c.hatches.length)}</span>
                  </span>
                </button>
                <button className="round small quiet" aria-label={`Remove the saved canvas ${c.name}`} title="Remove this saved canvas" onClick={() => void actions.removeSavedCanvas(c.id)}>
                  <CloseIcon size={12} />
                </button>
              </li>
            ))}
          </ul>
          <p className="hint">A saved canvas opens as a new canvas, with every Hatch where it was.</p>
        </section>
      )}
    </>
  );
}

function SelectedHatch({ hatch }: { hatch: Hatch }) {
  useStore((s) => s.viewport);
  const load = useStore((s) => loadStateOf(s, hatch.id));
  const saved = useStore((s) => s.links.some((l) => l.url === hatch.url));
  const fit = hatch.template === 'fit';
  const { width, height } = effectiveSize(hatch);
  const id = hatch.id;

  return (
    <>
      <header className="panel-head">
        <button className="round small quiet" aria-label="Show all Hatches" title="All Hatches" onClick={() => actions.select(null)}>
          <BackIcon size={14} />
        </button>
        <h1 className="panel-title grow">{hatchLabel(hatch)}</h1>
        <NewHatchButton />
      </header>

      <div className="control-row" role="toolbar" aria-label="Hatch controls">
        {load.loading ? (
          <button className="round" aria-label="Stop loading" title="Stop loading" onClick={() => pages.stop(id)}>
            <StopIcon />
          </button>
        ) : (
          <button className="round" aria-label="Reload" title="Reload" onClick={() => pages.reload(id)}>
            <ReloadIcon />
          </button>
        )}
        <div className="view-toggle" role="group" aria-label="What this Hatch shows">
          <button aria-label="Show the page" title="Show the page" aria-pressed={hatch.view === 'page'} onClick={() => actions.setView(id, 'page')} data-testid={`view-page-${id}`}>
            <EyeIcon />
          </button>
          <button aria-label="Show the agent view" title="Show the agent view" aria-pressed={hatch.view === 'agent'} onClick={() => actions.setView(id, 'agent')} data-testid={`view-agent-${id}`}>
            <OutlineIcon />
          </button>
        </div>
        <button className="round" aria-label="Fit to view" title={fit ? 'Leave Fit to view (Esc)' : 'Fit to view'} aria-pressed={fit} onClick={() => actions.toggleFit(id)} data-testid="fit-toggle">
          {fit ? <ReleaseIcon /> : <FitIcon />}
        </button>
      </div>

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
            return (
              <button key={t.id} role="radio" aria-checked={active} aria-label={`${t.name}, ${t.size.width} × ${t.size.height}`} className={`round${active ? ' primary' : ''}`} title={`${t.name} · ${t.size.width} × ${t.size.height}`} onClick={() => actions.applyTemplate(id, t.id)} data-testid={`template-${t.id}`}>
                {(() => {
                  const Icon = DEVICE_ICONS[t.id]!;
                  return <Icon />;
                })()}
              </button>
            );
          })}
        </div>
      </section>

      <CommentsSection hatchId={id} />
      <PaperSection hatchId={id} />
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
    const resolved = resolveAddress(text);
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

function CommentsSection({ hatchId }: { hatchId: string }) {
  const page = useStore((s) => s.comments[hatchId]);
  const show = useStore((s) => s.settings.showComments);
  const picking = useStore((s) => s.picking === hatchId && s.pickPurpose === 'comment');
  const openId = useStore((s) => (s.openThread?.hatchId === hatchId ? s.openThread.threadId : null));
  const missing = useStore((s) => s.missing[hatchId]) ?? [];
  const threads = page?.threads ?? [];
  const openCount = threads.filter((t) => t.status === 'open').length;

  return (
    <section>
      <h2>
        Comments {openCount > 0 && <span className="count">{openCount}</span>}
      </h2>
      <button type="button" role="switch" aria-checked={show} className="switch-row" onClick={() => void actions.updateSettings({ showComments: !show })}>
        <span>Show comments on the page</span>
        <span className="switch" aria-hidden="true" />
      </button>
      <button className={`button${picking ? ' primary' : ''}`} aria-pressed={picking} onClick={() => (picking ? actions.stopPicking() : actions.startPicking(hatchId))} data-testid="add-comment">
        <CommentIcon /> {picking ? 'Cancel' : 'Add a comment'}
      </button>
      {page?.error && (
        <p className="field-error" role="alert">
          {page.error}
        </p>
      )}
      {threads.length > 0 && (
        <ul className="thread-list">
          {threads.map((t) => (
            <li key={t.id}>
              <button className={t.id === openId ? 'active' : ''} onClick={() => actions.openThread(hatchId, t.id)}>
                <span className={`pin-mark ${t.status === 'resolved' ? 'resolved' : t.unread ? 'unread' : 'open'}`}>{t.status === 'resolved' ? <CheckIcon size={12} /> : t.number}</span>
                <span className="name">{t.label}</span>
                <span className="state">{missing.includes(t.id) ? 'Element not found' : t.status === 'resolved' ? 'Resolved' : t.unread ? 'New reply' : `${t.messages.length}`}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PaperSection({ hatchId }: { hatchId: string }) {
  const picking = useStore((s) => s.picking === hatchId && s.pickPurpose === 'grab');
  const grabbed = useStore((s) => (s.grabbed?.hatchId === hatchId ? s.grabbed : null));
  return (
    <section>
      <h2>Edit in Paper</h2>
      <button className={`button${picking ? ' primary' : ''}`} aria-pressed={picking} onClick={() => (picking ? actions.stopPicking() : actions.startGrab(hatchId))} data-testid="grab-element">
        <GrabIcon /> {picking ? 'Cancel' : 'Grab an element'}
      </button>
      {grabbed ? (
        <p className={grabbed.ok ? 'hint' : 'field-error'} role="status" data-testid="grab-result">
          {grabbed.text}
        </p>
      ) : (
        <p className="hint">Pick an element, then paste it into Paper as editable layers.</p>
      )}
    </section>
  );
}
