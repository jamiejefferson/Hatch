import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { bounds, measureAt, unitsFor, withAttached, type ArrangeMode, type Box } from '@shared/arrange';
import { toScreen, type Point } from '@shared/geometry';
import { HEADER_OFFSET } from '@shared/workspace';
import type { Group, Tab } from '@shared/types';
import { CloseIcon, MoreIcon } from '../icons';
import { actions, hatchLabel, NOTE_SIZE, useStore } from '../state/store';
import { noteAuthor } from './Notes';

/** The strip a group label or the selection caption takes above an outline, on screen. */
const LABEL_ROOM = 32;
const GROUP_LABEL_WIDTH = 320;
/** The prompt popover's width. It opens beside the bar, clear of the selected pages, when the canvas has room. */
const PROMPT_WIDTH = 420;
/** Room between a group's items and its outline, on screen. */
const PAD = 16;

const screenBox = (box: Box, pan: Point, zoom: number): Box => {
  const r = toScreen(box, pan, zoom);
  return { x: r.x - PAD, y: r.y - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };
};

function boxOf(tab: Tab, ids: string[]): Box | null {
  const units = unitsFor(tab, ids, measureAt(tab.zoom, NOTE_SIZE, HEADER_OFFSET));
  return units.length ? bounds(units.map((u) => u.box)) : null;
}

/** The items a selection names, as the units that move: an attached note counts through its Hatch. */
function unitsOfSelection(tab: Tab, selection: string[]): string[] {
  const out = new Set<string>();
  for (const id of selection) out.add(tab.notes?.find((n) => n.id === id)?.attachedTo ?? id);
  return [...out].filter((id) => tab.hatches.some((h) => h.id === id) || tab.notes?.some((n) => n.id === id));
}

/** Each group's solid outline, with its name and item count above. A click on the name selects the group; a double-click renames it. */
export function GroupOutlines({ tab, pan, zoom }: { tab: Tab; pan: Point; zoom: number }) {
  const renaming = useStore((s) => s.renamingGroup);
  const selectedGroup = useStore((s) => s.selectedGroup);
  return (
    <>
      {(tab.groups ?? []).map((g) => {
        const box = boxOf(tab, g.members);
        if (!box) return null;
        const r = screenBox(box, pan, zoom);
        return (
          <div key={g.id} className={`group-outline${selectedGroup === g.id ? ' selected' : ''}${g.locked ? ' locked' : ''}`} style={{ left: r.x, top: r.y, width: r.width, height: r.height }} data-testid={`group-${g.id}`}>
            <div className="group-label">
              {renaming === g.id ? (
                <GroupName group={g} />
              ) : (
                <button onClick={() => actions.selectGroup(g.id)} onDoubleClick={() => actions.startRenamingGroup(g.id)} title={g.name} data-detail="Selects the group. Double-click to rename it." data-testid="group-name">
                  <strong>{g.name}</strong>
                  <span>{` · ${g.members.length + (tab.notes ?? []).filter((n) => n.attachedTo && g.members.includes(n.attachedTo)).length} items${g.locked ? ' · Locked' : ''}`}</span>
                </button>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}

function GroupName({ group }: { group: Group }) {
  const [text, setText] = useState(group.name);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);
  return (
    <input
      ref={field}
      className="group-name-field"
      // The field grows with the name, so it reads as the label being edited.
      style={{ width: `${Math.max(6, text.length + 2)}ch` }}
      aria-label="Group name"
      value={text}
      maxLength={60}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => actions.renameGroup(group.id, text)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') actions.startRenamingGroup(null);
      }}
      data-testid="group-name-field"
    />
  );
}

/** Two or more selected items show a dashed outline, which says the selection is no group. */
export function SelectionOutline({ tab, pan, zoom }: { tab: Tab; pan: Point; zoom: number }) {
  const selection = useStore((s) => s.selection);
  const selectedGroup = useStore((s) => s.selectedGroup);
  const units = unitsOfSelection(tab, selection);
  if (units.length < 2 || selectedGroup) return null;
  const box = boxOf(tab, units);
  if (!box) return null;
  const r = screenBox(box, pan, zoom);
  // A group's label sits above its top left corner. The caption gives way when a label shares its strip, so the two never print over each other.
  const crowded = (tab.groups ?? []).some((g) => {
    const gb = boxOf(tab, g.members);
    if (!gb) return false;
    const gr = screenBox(gb, pan, zoom);
    return Math.abs(gr.y - r.y) < LABEL_ROOM && gr.x < r.x + r.width && gr.x + GROUP_LABEL_WIDTH > r.x;
  });
  return (
    <div className="selection-outline" style={{ left: r.x, top: r.y, width: r.width, height: r.height }} data-testid="selection-outline">
      {!crowded && <span className="selection-caption">{withAttached(tab, selection).length} items selected · Not grouped</span>}
    </div>
  );
}

const ALIGN: { mode: ArrangeMode; label: string }[] = [
  { mode: 'align-left', label: 'Left edges' },
  { mode: 'align-centre', label: 'Centres' },
  { mode: 'align-right', label: 'Right edges' },
  { mode: 'align-top', label: 'Top edges' },
  { mode: 'align-middle', label: 'Middles' },
  { mode: 'align-bottom', label: 'Bottom edges' },
];
const DISTRIBUTE: { mode: ArrangeMode; label: string }[] = [
  { mode: 'distribute-horizontal', label: 'Across, left to right' },
  { mode: 'distribute-vertical', label: 'Down, top to bottom' },
];

/**
 * The bar under a selection. One Hatch offers its context link and a prompt; two or more items add Group, Arrange and More.
 * A group's More menu renames, locks and ungroups it. The bar waits while a Hatch fills the view.
 */
export function SelectionBar({ tab, pan, zoom, area }: { tab: Tab; pan: Point; zoom: number; area: { width: number; height: number } }) {
  const selection = useStore((s) => s.selection);
  const selectedGroup = useStore((s) => s.selectedGroup);
  const promptOpen = useStore((s) => s.promptOpen);
  const [menu, setMenu] = useState<'arrange' | 'more' | null>(null);
  const [sub, setSub] = useState<'align' | 'distribute' | null>(null);
  const bar = useRef<HTMLDivElement>(null);
  const units = unitsOfSelection(tab, selection);
  const hasHatch = units.some((id) => tab.hatches.some((h) => h.id === id));
  const group = tab.groups?.find((g) => g.id === selectedGroup) ?? null;
  const key = selection.join(',');
  const [drawnWidth, setDrawnWidth] = useState(0);
  useLayoutEffect(() => {
    const w = bar.current?.offsetWidth ?? 0;
    if (w && w !== drawnWidth) setDrawnWidth(w);
  });

  useEffect(() => {
    setMenu(null);
    setSub(null);
  }, [key]);

  // A click anywhere else closes an open menu.
  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent): void => {
      if (!bar.current?.contains(e.target as Node)) setMenu(null);
    };
    window.addEventListener('pointerdown', close, true);
    return () => window.removeEventListener('pointerdown', close, true);
  }, [menu]);

  if (!hasHatch && units.length < 2) return null;
  const box = boxOf(tab, units);
  if (!box) return null;
  const r = screenBox(box, pan, zoom);
  // The bar's drawn width keeps it inside the canvas; the first frame uses an estimate.
  const width = drawnWidth || (units.length > 1 ? 560 : 360);
  const left = Math.min(Math.max(r.x + r.width / 2 - width / 2, 12), Math.max(12, area.width - width - 12));
  // The bar stops short of the canvas's foot, where toasts and the Undo notice appear.
  const top = Math.min(Math.max(r.y + r.height + 12, 12), area.height - 64);
  const several = units.length > 1;
  const count = group ? '1 group' : several ? `${withAttached(tab, selection).length} selected` : '1 Hatch';
  const run = (mode: ArrangeMode): void => {
    setMenu(null);
    actions.arrangeSelection(mode);
  };

  return (
    <div ref={bar} className="selection-bar" style={{ left, top }} role="toolbar" aria-label="Selection" onPointerDown={(e) => e.stopPropagation()} data-testid="selection-bar">
      <span className="selection-count" title="Selection" data-detail="Shift-click a Hatch or a note to add it or take it out. Shift-drag on empty canvas to draw a selection box." data-keys="⌘A" data-testid="selection-count">
        {count}
      </span>
      <span className="bar-rule" aria-hidden="true" />
      <button className="bar-action" onClick={() => void actions.copyContext()} title="Copy context link" data-detail="Copies a link to these Hatches and their notes. Paste it into your own agent, which reads it through Hatch." data-testid="copy-context">
        Copy context link
      </button>
      <button className="bar-action" aria-expanded={promptOpen} onClick={() => actions.openPrompt(!promptOpen)} title="Add a prompt" data-detail="Writes instructions to paste into your own agent with the context link. Nothing runs in Hatch." data-testid="add-prompt">
        Add a prompt…
      </button>
      {several && (
        <>
          <span className="bar-rule" aria-hidden="true" />
          {!group && (
            <button className="bar-action" onClick={() => actions.groupSelection()} title="Group" data-detail="Names these items as a group that moves and arranges as one." data-keys="⌘G" data-testid="group-selection">
              Group
            </button>
          )}
          <div className="bar-menu">
            <button className="bar-action" aria-haspopup="menu" aria-expanded={menu === 'arrange'} onClick={() => setMenu(menu === 'arrange' ? null : 'arrange')} title="Arrange" data-detail="Tidies, lines up or spreads out the selection. Pages keep their sizes." data-testid="arrange">
              Arrange <span aria-hidden="true">⌄</span>
            </button>
            {menu === 'arrange' && (
              <div className="bar-popup arrange-menu" role="menu" data-testid="arrange-menu">
                <button role="menuitem" className="menu-lead" onClick={() => run('tidy')} data-testid="arrange-tidy">
                  <strong>Tidy up</strong>
                  <span>Keep sizes and attached notes.</span>
                </button>
                <button role="menuitem" onClick={() => run('row')} data-testid="arrange-row">Arrange in a row</button>
                <button role="menuitem" onClick={() => run('column')} data-testid="arrange-column">Arrange in a column</button>
                <button role="menuitem" onClick={() => run('grid')} data-testid="arrange-grid">Arrange in a grid</button>
                <hr />
                <button role="menuitem" aria-expanded={sub === 'align'} onClick={() => setSub(sub === 'align' ? null : 'align')} data-testid="arrange-align">
                  Align edges or centres <span aria-hidden="true">{sub === 'align' ? '⌄' : '›'}</span>
                </button>
                {sub === 'align' && ALIGN.map((a) => <button key={a.mode} role="menuitem" className="menu-sub" onClick={() => run(a.mode)} data-testid={`arrange-${a.mode}`}>{a.label}</button>)}
                <button role="menuitem" aria-expanded={sub === 'distribute'} onClick={() => setSub(sub === 'distribute' ? null : 'distribute')} data-testid="arrange-distribute">
                  Distribute evenly <span aria-hidden="true">{sub === 'distribute' ? '⌄' : '›'}</span>
                </button>
                {sub === 'distribute' && DISTRIBUTE.map((a) => <button key={a.mode} role="menuitem" className="menu-sub" onClick={() => run(a.mode)} data-testid={`arrange-${a.mode}`}>{a.label}</button>)}
                <hr />
                <button role="menuitem" onClick={() => (setMenu(null), actions.fitSelection())} data-testid="fit-selection">Fit selection to view</button>
              </div>
            )}
          </div>
          <div className="bar-menu">
            <button className="round small quiet" aria-label="More for this selection" aria-haspopup="menu" aria-expanded={menu === 'more'} onClick={() => setMenu(menu === 'more' ? null : 'more')} title="More" data-testid="selection-more">
              <MoreIcon size={14} />
            </button>
            {menu === 'more' && (
              <div className="bar-popup more-menu" role="menu" data-testid="more-menu">
                {group ? (
                  <>
                    <button role="menuitem" onClick={() => (setMenu(null), actions.startRenamingGroup(group.id))} data-testid="rename-group">Rename this group</button>
                    <button role="menuitem" onClick={() => (setMenu(null), actions.toggleLock(group.id))} data-testid="lock-group">{group.locked ? 'Unlock positions' : 'Lock positions'}</button>
                    <hr />
                    <button role="menuitem" onClick={() => (setMenu(null), actions.ungroup(group.id))} data-testid="ungroup">
                      <span>Ungroup</span>
                      <span className="menu-hint">Keep all Hatches and notes.</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button role="menuitem" onClick={() => (setMenu(null), actions.selectAll())}>Select everything on this canvas</button>
                    <button role="menuitem" onClick={() => (setMenu(null), actions.clearSelection())}>Clear the selection</button>
                  </>
                )}
              </div>
            )}
          </div>
        </>
      )}
      {!several && !group && (
        // One Hatch selected is where a user first meets the bar, so it says how to take in more.
        <span className="selection-hint" data-testid="selection-hint">
          Shift-click to add more
        </span>
      )}
      {promptOpen && <PromptPopover tab={tab} beside={area.width - (left + width) >= PROMPT_WIDTH + 24} />}
    </div>
  );
}

/** Add a prompt: one field, the sources it carries with a way to review and leave some out, and a copy button. Nothing runs in Hatch. */
function PromptPopover({ tab, beside }: { tab: Tab; beside: boolean }) {
  const [prompt, setPrompt] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [left, setLeft] = useState<string[]>([]);
  const items = actions.contextItems();
  const kept = items.filter((id) => !left.includes(id));
  const hatches = kept.filter((id) => tab.hatches.some((h) => h.id === id)).length;
  const notes = kept.length - hatches;
  const summary = [hatches ? `${hatches} ${hatches === 1 ? 'Hatch' : 'Hatches'}` : '', notes ? `${notes} ${notes === 1 ? 'note' : 'notes'}` : ''].filter(Boolean).join(' and ') || 'nothing';
  const label = (id: string): string => {
    const h = tab.hatches.find((x) => x.id === id);
    if (h) return hatchLabel(h);
    const n = tab.notes?.find((x) => x.id === id);
    return n ? `${noteAuthor(n)}: ${n.text.slice(0, 60)}` : id;
  };
  return (
    <div className={`bar-popup prompt-popover${beside ? ' beside' : ''}`} role="dialog" aria-labelledby="prompt-title" data-testid="prompt-popover">
      <div className="prompt-head">
        <h2 id="prompt-title">Add a prompt</h2>
        <button className="round small quiet" aria-label="Close" onClick={() => actions.openPrompt(false)}>
          <CloseIcon size={12} />
        </button>
      </div>
      <p className="prompt-sources">
        Uses {summary} ·{' '}
        <button className="text-button underline" aria-expanded={reviewing} onClick={() => setReviewing(!reviewing)} data-testid="prompt-review">
          Review
        </button>
      </p>
      {reviewing && (
        <ul className="prompt-review" data-testid="prompt-review-list">
          {items.map((id) => (
            <li key={id}>
              <label>
                <input type="checkbox" checked={!left.includes(id)} onChange={(e) => setLeft(e.target.checked ? left.filter((x) => x !== id) : [...left, id])} />
                <span>{label(id)}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <textarea aria-label="Prompt for your agent" placeholder="Tell your agent what to do with these pages" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} autoFocus data-testid="prompt-text" />
      <div className="prompt-foot">
        <p>
          Paste into your own agent.
          <br />
          Nothing runs in Hatch.
        </p>
        <button className="button primary" disabled={kept.length === 0} onClick={() => void actions.copyContext({ prompt, exclude: left })} data-testid="copy-prompt">
          Copy prompt + link
        </button>
      </div>
    </div>
  );
}

/** The notice after an arrangement: what changed, and Undo. */
export function LayoutNotice() {
  const text = useStore((s) => s.layoutNotice);
  const canUndo = useStore((s) => s.layoutPast.length > 0);
  if (!text) return null;
  return (
    <div className="layout-notice" role="status" data-testid="layout-notice">
      <span>{text}</span>
      {canUndo && (
        <button onClick={actions.undoLayout} data-testid="layout-undo">
          Undo <kbd>⌘Z</kbd>
        </button>
      )}
    </div>
  );
}

/** The box a Shift-drag draws on the empty canvas. */
export function Marquee({ box }: { box: Box | null }) {
  if (!box) return null;
  return <div className="marquee" style={{ left: box.x, top: box.y, width: box.width, height: box.height }} data-testid="marquee" />;
}
