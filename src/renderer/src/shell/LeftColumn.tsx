import { useState } from 'react';
import { ChevronIcon, CloseIcon, DuplicateIcon, HatchIcon, PinIcon, PlusIcon, FolderIcon, MoreIcon, ShowAllIcon } from '../icons';
import { LinksPanel } from '../panels/LinksPanel';
import { ProjectsPanel } from '../panels/ProjectsPanel';
import { actions, activeTab, hatchLabel, tabLabel, useStore, type LeftPanel } from '../state/store';
import type { Tab } from '@shared/types';

const TABS: { id: LeftPanel; label: string }[] = [
  { id: 'canvases', label: 'Canvases' },
  { id: 'library', label: 'Library' },
];

/** The left column lists what is open: canvases and their Hatches, then the projects and links a page comes from. */
export function LeftColumn() {
  const panel = useStore((s) => s.leftPanel);
  return (
    <aside className="left-column" aria-label="Canvases and Library" data-testid="left-column">
      <div className="column-tabs" role="tablist" aria-label="Left column">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={panel === t.id} className={`column-tab${panel === t.id ? ' current' : ''}`} onClick={() => actions.showLeft(t.id)} data-testid={`left-${t.id}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="column-body" role="tabpanel">
        {panel === 'canvases' ? <CanvasesTab /> : <LibraryTab />}
      </div>
    </aside>
  );
}

/** A heading that folds its list, with an optional button at its right end. */
function Fold({ title, open, onToggle, action, children, testId }: { title: string; open: boolean; onToggle(): void; action?: React.ReactNode; children: React.ReactNode; testId?: string }) {
  return (
    <section className="fold" data-testid={testId}>
      <div className="fold-head">
        <button className="fold-toggle" aria-expanded={open} onClick={onToggle}>
          <span className="chevron" aria-hidden="true">
            <ChevronIcon size={12} />
          </span>
          <h2>{title}</h2>
        </button>
        {action}
      </div>
      {open && children}
    </section>
  );
}

function CanvasesTab() {
  const tab = useStore(activeTab);
  const [open, setOpen] = useState({ canvases: true, hatches: true, closed: true });
  const closed = useStore((s) => s.closed.some((c) => c.kind !== 'canvas' || !c.tab.savedId || !s.savedCanvases.some((p) => p.id === c.tab.savedId)));
  const flip = (key: keyof typeof open) => () => setOpen({ ...open, [key]: !open[key] });
  return (
    <>
      <Fold
        title="Canvases"
        open={open.canvases}
        onToggle={flip('canvases')}
        testId="canvases"
        action={
          <button className="round small quiet" aria-label="New canvas" title="New canvas" onClick={() => actions.newCanvasFromUser()} data-testid="new-canvas">
            <PlusIcon size={14} />
          </button>
        }
      >
        <CanvasList current={tab.id} />
      </Fold>
      <Fold
        title="Hatches"
        open={open.hatches}
        onToggle={flip('hatches')}
        action={
          <button className="round small quiet" aria-label="New Hatch" title="New Hatch" onClick={actions.requestNewHatch} data-testid="new-hatch">
            <PlusIcon size={14} />
          </button>
        }
      >
        <HatchList tab={tab} />
      </Fold>
      {closed && (
        <Fold title="Recently closed" open={open.closed} onToggle={flip('closed')} testId="recently-closed">
          <ClosedList />
        </Fold>
      )}
    </>
  );
}

const hatchCount = (n: number): string => `${n} ${n === 1 ? 'Hatch' : 'Hatches'}`;

/**
 * Every open canvas, then the pinned canvases that are closed. A click shows a canvas or opens a pinned one, a double-click renames it and a right-click offers its link.
 * The pin keeps a canvas in this list after it closes; a pinned canvas carries its pin in view, and any other shows the pin under the pointer.
 */
function CanvasList({ current }: { current: string }) {
  const tabs = useStore((s) => s.workspace.tabs);
  const labels = useStore((s) => s.workspace.tabs.map((t) => tabLabel(s, t)).join('\n')).split('\n');
  const working = useStore((s) => s.work.tabs);
  const [renaming, setRenaming] = useState<string | null>(null);
  const saved = useStore((s) => s.savedCanvases);
  const pinned = new Set(saved.map((c) => c.id));
  const away = saved.filter((c) => !tabs.some((t) => t.savedId === c.id));

  return (
    <ul className="row-list" data-testid="canvas-list">
      {tabs.map((t, i) => {
        const here = t.id === current;
        const label = labels[i] ?? '';
        return (
          <li key={t.id} className={here ? 'current' : ''} onContextMenu={(e) => actions.openContextMenu(e, t.id, null)}>
            <span className="row-icon" aria-hidden="true">
              <ShowAllIcon size={14} />
            </span>
            {renaming === t.id ? (
              <input
                className="row-rename"
                aria-label="Canvas name"
                defaultValue={t.name ?? ''}
                placeholder={label}
                autoFocus
                onBlur={(e) => {
                  actions.renameTab(t.id, e.target.value);
                  setRenaming(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                  if (e.key === 'Escape') setRenaming(null);
                }}
              />
            ) : (
              <button role="tab" aria-selected={here} className="row-main" title={`${label}. Double-click to rename.`} onClick={() => actions.activateTab(t.id)} onDoubleClick={() => setRenaming(t.id)}>
                {label}
              </button>
            )}
            {t.folder && (
              <button className="row-folder" aria-label={`${label} is attached to the folder ${t.folder}. Change it`} title={`Attached to ${t.folder}. An agent working in that folder uses this canvas. Press to change the folder.`} onClick={() => actions.askFolderFor(t.id)} data-testid="canvas-folder">
                <FolderIcon size={12} />
              </button>
            )}
            {working[t.id] && <span className="working-dot" role="img" aria-label="An agent is working in this canvas" />}
            <span className="row-count" title={hatchCount(t.hatches.length)}>
              {t.hatches.length}
            </span>
            <button
              className="row-more"
              aria-label={`More for ${label}`}
              title="More for this canvas: its link and its project folder"
              onClick={(e) => {
                const box = e.currentTarget.getBoundingClientRect();
                actions.openContextMenu({ clientX: box.left, clientY: box.bottom + 4, preventDefault: () => e.preventDefault(), stopPropagation: () => e.stopPropagation() }, t.id, null);
              }}
              data-testid="canvas-more"
            >
              <MoreIcon size={12} />
            </button>
            <PinButton pinned={!!t.savedId && pinned.has(t.savedId)} label={label} onClick={() => void actions.togglePin(t.id)} />
            <button className="row-close" aria-label={`Close ${label}`} title="Close this canvas" onClick={() => actions.closeTab(t.id)}>
              <CloseIcon size={12} />
            </button>
          </li>
        );
      })}
      {away.map((c) => (
        <li key={c.id} className="away" data-testid="pinned-away">
          <span className="row-icon" aria-hidden="true">
            <ShowAllIcon size={14} />
          </span>
          <button className="row-main" title={`Open ${c.name}. It closed, and its pin kept it here.`} onClick={() => actions.openSavedCanvas(c.id)}>
            {c.name}
          </button>
          <span className="row-count" title={hatchCount(c.hatches.length)}>
            {c.hatches.length}
          </span>
          <PinButton pinned label={c.name} onClick={() => void actions.unpinCanvas(c.id)} />
        </li>
      ))}
    </ul>
  );
}

function PinButton({ pinned, label, onClick }: { pinned: boolean; label: string; onClick(): void }) {
  return (
    <button className={`row-pin${pinned ? ' pinned' : ''}`} aria-pressed={pinned} aria-label={pinned ? `${label} is saved. Stop saving it` : `${label} is not saved. Save it`} title={pinned ? 'Saved. Hatch keeps this canvas in the list after it closes. Press to stop saving it.' : 'Not saved. Press to save this canvas, so Hatch keeps it in the list after it closes.'} onClick={onClick} data-testid="pin-canvas">
      <PinIcon size={12} />
    </button>
  );
}

/** The current canvas's Hatches with each page's width. A click selects the Hatch and moves the canvas to it. */
function HatchList({ tab }: { tab: Tab }) {
  const working = useStore((s) => s.work.hatches);
  if (tab.hatches.length === 0) return <p className="hint fold-hint">This canvas has no Hatches yet. A Hatch is one live page in a frame.</p>;
  return (
    <ul className="row-list" data-testid="hatch-list">
      {tab.hatches.map((h) => {
        const here = h.id === tab.selectedHatchId;
        return (
          <li key={h.id} className={here ? 'current' : ''} onContextMenu={(e) => actions.openContextMenu(e, tab.id, h.id)}>
            <button className="row-main" aria-current={here ? 'true' : undefined} onClick={() => actions.reveal(h.id)} onDoubleClick={() => actions.toggleFit(h.id)} title={`Select ${hatchLabel(h)}. Double-click to fit it to the view.`}>
              {hatchLabel(h)}
            </button>
            {working[h.id] && <span className="working-dot" role="img" aria-label="An agent is working in this Hatch" />}
            <span className="row-count">{h.template === 'fit' ? 'Fit' : h.width}</span>
            <button className="row-action" aria-label={`Duplicate ${hatchLabel(h)}`} title="Duplicate this Hatch (Cmd+D, or Cmd-drag its title)" onClick={() => actions.duplicateHatch(h.id)} data-testid={`duplicate-${h.id}`}>
              <DuplicateIcon size={12} />
            </button>
            <button className="row-close" aria-label={`Close ${hatchLabel(h)}`} title="Close this Hatch" onClick={() => actions.closeHatch(h.id)}>
              <CloseIcon size={12} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** What the user closed this session, the latest first. A click brings it back where it was, as Cmd+Shift+T does for the latest. */
function ClosedList() {
  // A pinned canvas stays in the Canvases list once it closes, so it shows there alone.
  const closed = useStore((s) => s.closed);
  const pinned = useStore((s) => s.savedCanvases);
  const shown = closed.filter((c) => c.kind !== 'canvas' || !c.tab.savedId || !pinned.some((p) => p.id === c.tab.savedId));
  return (
    <ul className="row-list" data-testid="closed-list">
      {[...shown].reverse().map((c, i) => {
        const label = c.kind === 'hatch' ? hatchLabel(c.hatch) : c.name;
        const shortcut = i === 0 ? ' (Cmd+Shift+T)' : '';
        return (
          <li key={c.id}>
            <span className="row-icon" aria-hidden="true">
              {c.kind === 'hatch' ? <HatchIcon size={14} /> : <ShowAllIcon size={14} />}
            </span>
            <button className="row-main" onClick={() => actions.reopenClosed(c.id)} title={`Reopen ${c.kind === 'hatch' ? 'this Hatch' : 'this canvas'}${shortcut}`}>
              {label}
            </button>
            {c.kind === 'canvas' && (
              <span className="row-count" title={hatchCount(c.tab.hatches.length)}>
                {c.tab.hatches.length}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Projects and Links answer the same question, which page to open next, so they share one tab. */
function LibraryTab() {
  return (
    <>
      <div className="library-part" data-testid="library-projects">
        <ProjectsPanel />
      </div>
      <div className="library-part" data-testid="library-links">
        <LinksPanel />
      </div>
    </>
  );
}
