// One store for the whole interface. The workspace half persists; the rest lives for the session.
import { useSyncExternalStore } from 'react';
import { labelForUrl, parseAddress, parseAddressOrName } from '@shared/address';
import { clampZoom, nextZoomStep, panToReveal, placeNewHatch, zoomAround, type Point } from '@shared/geometry';
import { clampSize, TEMPLATES, templateForSize } from '@shared/templates';
import { hatchLink } from '@shared/hatch-link';
import { hatchAddress, projectOf, projectUrl, PROXY_PORT } from '@shared/project-address';
import type { Anchor, CommentStatus, PageComments } from '@shared/comments';
import type { ConsentAnswer, ConsentRequest, SignIn } from '@shared/signins';
import type { SignInThrough } from '@shared/signin-through';
import type { ConnectionInfo, Outcome } from '../../../preload/api';
import type { CanvasContext, Group, ActionButton, ProjectsState, ActivityEntry, AgentAct, AgentWorkState, DialogState, Hatch, HatchView, InterfaceState, Note, SavedCanvas, SavedLink, Settings, Tab, TemplateId, ViewRequest, Workspace } from '@shared/types';
import { savedCanvasFromTab, tabFromSavedCanvas } from '@shared/canvases';
import { folderName, oneCanvasPerFolder } from '@shared/project-canvas';
import { DEFAULT_SETTINGS } from '@shared/types';
import { emptyTab, emptyWorkspace, HEADER_OFFSET, MAX_CONTEXTS, MAX_GROUP_NAME, MAX_NOTE_LENGTH, newId, repairGroups } from '@shared/workspace';
import { pages } from '../canvas/webviews';
import { applyMoves, arrange, bounds, freshIds, groupOf, lockedAmong, measureAt, unitsFor, withAttached, type ArrangeMode, type Box } from '@shared/arrange';

/** The right sidebar's three tabs, and the two pages its top-strip buttons open. */
export type SidebarPanel = 'hatch' | 'comments' | 'activity' | 'settings' | 'feedback';
/** The left column's two tabs. */
export type LeftPanel = 'canvases' | 'library';

/** A Hatch or a canvas the user closed this session, which Reopen brings back with its pages and places. */
export type Closed = { id: string; kind: 'hatch'; tabId: string; hatch: Hatch } | { id: string; kind: 'canvas'; tab: Tab; index: number; name: string; blank?: string };
/** Reopen remembers this many closed Hatches and canvases. */
const CLOSED_LIMIT = 20;
/** Undo remembers this many layout edits. */
const UNDO_LIMIT = 50;
let noticeTimer: ReturnType<typeof setTimeout> | null = null;
/** After a swipe goes back or forward, the next one waits this long. */
const SWIPE_PAUSE_MS = 700;
let lastSwipe = 0;

export interface LoadState {
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  error: { code: number; description: string; url: string } | null;
}

export interface State {
  ready: boolean;
  workspace: Workspace;
  links: SavedLink[];
  /** The canvases the user saved to open again. */
  savedCanvases: SavedCanvas[];
  settings: Settings;
  panel: SidebarPanel;
  leftPanel: LeftPanel;
  /** Which threads the Comments tab lists. */
  commentFilter: 'open' | 'resolved';
  /** Which kinds the Comments tab lists: comments, notes, or both. */
  listKinds: { comments: boolean; notes: boolean };
  /** The next click on the canvas places a note. */
  placingNote: boolean;
  /** The note the user selected, and the one open for typing. */
  selectedNote: string | null;
  editingNote: string | null;
  newHatchOpen: boolean;
  /** The canvas area in screen pixels, which Fit to view and New Hatch placement need. */
  viewport: { width: number; height: number };
  load: Record<string, LoadState>;
  activity: ActivityEntry[];
  work: AgentWorkState;
  /** The element an agent last acted on in each Hatch, which the Hatch marks for a moment. */
  acts: Record<string, AgentAct & { at: number }>;
  logPath: string;
  mcpPort: number | null;
  /** An agent's open request to switch a Hatch's view, by Hatch id. */
  viewRequests: Record<string, ViewRequest>;
  /** The JavaScript dialog a page has open, by Hatch id. */
  dialogs: Record<string, DialogState>;
  /** Counts page changes per Hatch, so an open agent view knows when to read again. */
  pageVersion: Record<string, number>;
  projects: ProjectsState;
  /** The project whose detail the Library shows. */
  openProject: string | null;
  projectLogs: Record<string, string[]>;
  /** The comments for the page each Hatch shows. */
  comments: Record<string, PageComments>;
  /** The Hatch where the user is choosing an element to comment on. */
  picking: string | null;
  /** What the picked element is for: a comment, or a copy for the Paper design tool. */
  pickPurpose: 'comment' | 'grab';
  /** The outcome of the last grab, shown under the button. */
  grabbed: { hatchId: string; ok: boolean; text: string } | null;
  /** A picked element that waits for the comment's words. */
  draft: { hatchId: string; anchor: Anchor; label: string } | null;
  openThread: { hatchId: string; threadId: string } | null;
  commentError: string | null;
  /** Per Hatch, the comments whose element the page no longer holds. */
  missing: Record<string, string[]>;
  signIns: SignIn[];
  connection: ConnectionInfo | null;
  bannerClosed: boolean;
  /** Per Hatch, an agent's request to fill a saved sign-in that waits for the user. */
  consents: Record<string, ConsentRequest>;
  /** Per Hatch, a pop-up the page tried to open while it sat on the canvas. */
  popups: Record<string, { url: string }>;
  /** Where a double tap asked for the next new Hatch, in canvas pixels. */
  newHatchAt: Point | null;
  /** The New Hatch box was opened from Fit to view, so the page it opens fills the view too. */
  newHatchFit: boolean;
  /** The right-click menu: where it opened, and the tab and Hatch it speaks for. */
  contextMenu: { x: number; y: number; tabId: string; hatchId: string | null } | null;
  /** The canvas whose working folder Hatch asks for: a canvas the user just made, or one the user chose to attach. */
  attachPrompt: string | null;
  /** A sign-in the user may finish in another browser: offered when a page asks for a passkey, or asked for from the menu. */
  signInThrough: SignInThrough | null;
  /** The action button editor: null when shut, `id` null while adding a new button. */
  actionEditor: { id: string | null } | null;
  /** One line of feedback that shows for a moment at the foot of the canvas. */
  toast: string | null;
  /** The guide to the interface is showing. */
  guideOpen: boolean;
  /** The capture of Hatch's window that the feedback form offers to attach, as a data URL. */
  feedbackShot: string | null;
  /** The Hatches whose page plays sound now, by Hatch id. */
  audible: Record<string, boolean>;
  /** The window is in macOS full screen, where the toolbar may tuck away at the left edge. */
  fullScreen: boolean;
  /** What the user closed this session, the latest last. */
  closed: Closed[];
  /** The Hatches and notes the user selected on the active canvas. A click selects one; Shift adds and removes. */
  selection: string[];
  /** The group the user selected by its name, whose members make the selection. */
  selectedGroup: string | null;
  /** The group whose name the user is typing. */
  renamingGroup: string | null;
  /** The Add a prompt popover over the selection is open. */
  promptOpen: boolean;
  /** Layout edits the user can undo and redo, the latest last. */
  layoutPast: LayoutSnapshot[];
  layoutFuture: LayoutSnapshot[];
  /** The notice that says what an arrangement changed and offers Undo. */
  layoutNotice: string | null;
}

/** Where every Hatch and note sat, and the groups, before a layout edit. Undo puts them back and touches nothing else. */
interface LayoutSnapshot {
  tabId: string;
  hatches: { id: string; x: number; y: number }[];
  notes: { id: string; x: number; y: number; attachedTo?: string }[];
  groups: Group[];
}

const IDLE: LoadState = { loading: false, canGoBack: false, canGoForward: false, error: null };

let state: State = {
  ready: false,
  workspace: emptyWorkspace(),
  links: [],
  savedCanvases: [],
  settings: DEFAULT_SETTINGS,
  panel: 'hatch',
  leftPanel: 'canvases',
  commentFilter: 'open',
  listKinds: { comments: true, notes: true },
  placingNote: false,
  selectedNote: null,
  editingNote: null,
  newHatchOpen: false,
  viewport: { width: 960, height: 752 },
  load: {},
  activity: [],
  work: { tabs: {}, hatches: {} },
  acts: {},
  logPath: '',
  mcpPort: null,
  viewRequests: {},
  dialogs: {},
  pageVersion: {},
  projects: { projects: [], found: [], proxyPort: null },
  openProject: null,
  projectLogs: {},
  comments: {},
  picking: null,
  pickPurpose: 'comment',
  grabbed: null,
  draft: null,
  openThread: null,
  commentError: null,
  missing: {},
  signIns: [],
  connection: null,
  bannerClosed: false,
  consents: {},
  popups: {},
  newHatchAt: null,
  newHatchFit: false,
  contextMenu: null,
  actionEditor: null,
  attachPrompt: null,
  signInThrough: null,
  toast: null,
  guideOpen: false,
  feedbackShot: null,
  audible: {},
  selection: [],
  selectedGroup: null,
  renamingGroup: null,
  promptOpen: false,
  layoutPast: [],
  layoutFuture: [],
  layoutNotice: null,
  fullScreen: false,
  closed: [],
};

let toastTimer: ReturnType<typeof setTimeout> | null = null;

const listeners = new Set<() => void>();
const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getState = (): State => state;

function set(change: Partial<State> | ((s: State) => Partial<State>)): void {
  const patch = typeof change === 'function' ? change(state) : change;
  const workspaceChanged = 'workspace' in patch && patch.workspace !== state.workspace;
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
  if (workspaceChanged) reportFit();
  if (workspaceChanged && state.ready) scheduleSave();
}

/** The main process opens a page's pop-up only for a Hatch in Fit to view, so it hears which Hatches those are. */
let reportedFit = '';
function reportFit(): void {
  const ids = state.workspace.tabs.flatMap((t) => t.hatches.filter((h) => h.template === 'fit').map((h) => h.id));
  if (ids.join() === reportedFit) return;
  reportedFit = ids.join();
  window.hatch.setFitHatches(ids);
  // Fit to view is the answer to a blocked pop-up, so its notice leaves.
  if (ids.some((id) => state.popups[id])) set((s) => ({ popups: Object.fromEntries(Object.entries(s.popups).filter(([id]) => !ids.includes(id))) }));
}

export function useStore<T>(select: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => select(state));
}

// ---- persistence ----

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 400);
}
export function flushSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  if (!state.ready) return;
  void window.hatch.saveWorkspace(state.workspace);
  syncPinned();
}

/** What each pinned canvas last sent to canvases.json, without its date, so an unchanged canvas sends nothing. */
const pinnedSent = new Map<string, string>();
/** A pinned canvas follows its tab: each save of the workspace updates the copy of every pinned tab that changed. */
function syncPinned(): void {
  for (const tab of state.workspace.tabs) {
    if (!tab.savedId || !state.savedCanvases.some((c) => c.id === tab.savedId)) continue;
    const copy = savedCanvasFromTab(tab, tabLabel(state, tab), new Date(), tab.savedId);
    const key = JSON.stringify({ ...copy, savedAt: '' });
    if (pinnedSent.get(tab.savedId) === key) continue;
    pinnedSent.set(tab.savedId, key);
    void window.hatch.saveCanvas(copy).then((savedCanvases) => set({ savedCanvases }));
  }
}

let markBooted: () => void = () => {};
/** Settles once the saved workspace has loaded. A call that arrived earlier would change a workspace that boot then replaces. */
/** How long the mark on an element stays after an agent acts on it. */
export const ACT_MS = 1800;

const booted = new Promise<void>((resolve) => (markBooted = resolve));

export async function boot(): Promise<void> {
  const [workspace, links, savedCanvases, settings, activity, projects] = await Promise.all([window.hatch.loadWorkspace(), window.hatch.listLinks(), window.hatch.savedCanvases(), window.hatch.getSettings(), window.hatch.activity(), window.hatch.projects()]);
  void window.hatch.signIns().then((signIns) => set({ signIns }));
  void window.hatch.connection().then((connection) => set({ connection }));
  void window.hatch.isFullScreen().then((fullScreen) => set({ fullScreen }));
  reportedFit = '-';
  set({ projects, workspace, links, savedCanvases, settings, activity: activity.entries, work: activity.work, logPath: activity.logPath, mcpPort: activity.port, ready: true, guideOpen: window.hatch.guide && !settings.guideSeen });
  markBooted();
}

/** Wires the messages the main process pushes. Returns the function that unwires them. */
export function listen(): () => void {
  const offs = [
    window.hatch.on('activity:event', (entry) =>
      set((s) => {
        const known = s.activity.findIndex((e) => e.id === entry.id);
        const activity = known === -1 ? [...s.activity, entry].slice(-300) : s.activity.map((e) => (e.id === entry.id ? entry : e));
        return { activity };
      }),
    ),
    window.hatch.on('agents:work', (work) => set({ work })),
    window.hatch.on('agent:act', (act) => {
      const at = Date.now();
      set((s) => ({ acts: { ...s.acts, [act.hatchId]: { ...act, at } } }));
      // The mark fades on its own, and a newer action keeps its own mark.
      setTimeout(() => set((s) => (s.acts[act.hatchId]?.at === at ? { acts: Object.fromEntries(Object.entries(s.acts).filter(([id]) => id !== act.hatchId)) } : {})), ACT_MS);
    }),
    window.hatch.on('page:escape', (hatchId) => actions.escape(hatchId)),
    window.hatch.on('window:fullscreen', (fullScreen) => set({ fullScreen })),
    window.hatch.on('window:swipe', (direction) => actions.swipeWindow(direction)),
    window.hatch.on('page:audible', ({ hatchId, audible }) =>
      set((s) => {
        const { [hatchId]: _old, ...rest } = s.audible;
        return { audible: audible ? { ...rest, [hatchId]: true } : rest };
      }),
    ),
    window.hatch.on('toast', (text) => actions.toast(text)),
    window.hatch.on('signin:through', (through) => set({ signInThrough: through })),
    // The browser extension brought the sign-in this dialog waits for, so the Hatch opens the page it began from, signed in.
    window.hatch.on('signin:arrived', ({ site }) => {
      const through = state.signInThrough;
      if (!through || through.site !== site) return;
      pages.navigate(through.hatchId, through.url);
      actions.closeSignInThrough();
    }),
    window.hatch.on('popup:blocked', ({ hatchId, url }) => set((s) => ({ popups: { ...s.popups, [hatchId]: { url } } }))),
    window.hatch.on('page:changed', (hatchId) => set((s) => ({ pageVersion: { ...s.pageVersion, [hatchId]: (s.pageVersion[hatchId] ?? 0) + 1 } }))),
    window.hatch.on('dialog:state', ({ hatchId, dialog }) =>
      set((s) => {
        const { [hatchId]: _old, ...rest } = s.dialogs;
        return { dialogs: dialog ? { ...rest, [hatchId]: dialog } : rest };
      }),
    ),
  ];
  offs.push(
    window.hatch.on('projects:state', (projects) => set({ projects })),
    window.hatch.on('projects:log', ({ name, lines }) => set((s) => ({ projectLogs: { ...s.projectLogs, [name]: lines } }))),
    window.hatch.on('links:state', (links) => set({ links })),
    window.hatch.on('signins:state', (signIns) => set({ signIns })),
    window.hatch.on('connection:state', (connection) => set({ connection })),
    window.hatch.on('consent:state', ({ hatchId, request }) =>
      set((s) => {
        const { [hatchId]: _old, ...rest } = s.consents;
        return { consents: request ? { ...rest, [hatchId]: request } : rest };
      }),
    ),
    window.hatch.on('comments:changed', (file) => {
      for (const [hatchId, page] of Object.entries(state.comments)) if (page.file === file) void actions.loadComments(hatchId);
    }),
  );
  // An agent can call in the first moments after Hatch starts, so each request waits for the saved workspace.
  window.hatch.serve(async (method, params) => {
    await booted;
    return serve(method, params);
  });
  return () => offs.forEach((off) => off());
}


// ---- selection, groups, arrangement and undo ----

/** How the canvas measures items for arranging: a note keeps its size on screen, and a Hatch's title row sits above its page. */
const measureOf = (t: Tab) => measureAt(t.zoom, NOTE_SIZE, HEADER_OFFSET);

function snapshotOf(t: Tab): LayoutSnapshot {
  return {
    tabId: t.id,
    hatches: t.hatches.map((h) => ({ id: h.id, x: h.x, y: h.y })),
    notes: (t.notes ?? []).map((n) => ({ id: n.id, x: n.x, y: n.y, ...(n.attachedTo ? { attachedTo: n.attachedTo } : {}) })),
    groups: t.groups ?? [],
  };
}

/** Puts places, attachments and groups back. A Hatch or note closed since then stays closed, and pages are never touched. */
function restoreLayout(t: Tab, snap: LayoutSnapshot): Tab {
  const hatchAt = new Map(snap.hatches.map((h) => [h.id, h]));
  const noteAt = new Map(snap.notes.map((n) => [n.id, n]));
  const hatches = t.hatches.map((h) => {
    const at = hatchAt.get(h.id);
    return at ? { ...h, x: at.x, y: at.y } : h;
  });
  const ids = new Set(hatches.map((h) => h.id));
  const notes = (t.notes ?? []).map((n) => {
    const at = noteAt.get(n.id);
    if (!at) return n;
    const { attachedTo: _old, ...rest } = n;
    return { ...rest, x: at.x, y: at.y, ...(at.attachedTo && ids.has(at.attachedTo) ? { attachedTo: at.attachedTo } : {}) };
  });
  const groups = repairGroups(snap.groups, new Set([...ids, ...notes.filter((n) => !n.attachedTo).map((n) => n.id)]));
  return { ...t, hatches, notes, groups };
}

/** Remembers the layout before a change, so Undo can put it back. A new change clears Redo. */
function recordLayout(tabId: string): void {
  const t = state.workspace.tabs.find((x) => x.id === tabId);
  if (!t) return;
  set((s) => ({ layoutPast: [...s.layoutPast, snapshotOf(t)].slice(-UNDO_LIMIT), layoutFuture: [] }));
}

function noticeLayout(text: string): void {
  set({ layoutNotice: text });
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => set({ layoutNotice: null }), 6000);
}

const itemsWord = (n: number): string => `${n} ${n === 1 ? 'item' : 'items'}`;

/** The items a selection stands for, as Hatch ids and free-note ids. An attached note stands for its Hatch. */
function unitIds(t: Tab, ids: string[]): string[] {
  const out = new Set<string>();
  for (const id of ids) {
    const note = t.notes?.find((n) => n.id === id);
    out.add(note?.attachedTo ?? id);
  }
  return [...out].filter((id) => t.hatches.some((h) => h.id === id) || t.notes?.some((n) => n.id === id));
}

/** Takes items out of whatever group holds them. A group left with fewer than two items ends. */
const withoutInGroups = (groups: Group[], ids: string[]): Group[] =>
  groups.map((g) => ({ ...g, members: g.members.filter((m) => !ids.includes(m)) })).filter((g) => g.members.length >= 2);

/** A Hatch or note that leaves the canvas lets go of its attachments and its group. */
function forgetItem(t: Tab, id: string): Tab {
  const notes = t.notes?.map((n) => {
    if (n.attachedTo !== id) return n;
    const { attachedTo: _gone, ...rest } = n;
    return rest;
  });
  const groups = t.groups ? withoutInGroups(t.groups, [id]) : undefined;
  return { ...t, ...(notes ? { notes } : {}), ...(groups ? { groups } : {}) };
}

/** Where a note goes when it attaches: under its Hatch, below the notes already attached there. */
function attachSpot(t: Tab, hatchId: string, noteId: string): Point {
  const h = t.hatches.find((x) => x.id === hatchId)!;
  const gap = 16 / t.zoom;
  const others = (t.notes ?? []).filter((n) => n.attachedTo === hatchId && n.id !== noteId);
  const below = others.length ? Math.max(...others.map((n) => n.y + NOTE_SIZE.height / t.zoom)) : h.y + h.height;
  return { x: Math.round(h.x), y: Math.round(below + gap) };
}

/** What the main process asks of the interface on an agent's behalf. */
function serve(method: string, params: unknown): unknown {
  const p = (params ?? {}) as unknown;
  switch (method) {
    case 'state': {
      const { workspace } = state;
      const answer: InterfaceState = {
        activeTabId: workspace.activeTabId,
        tabs: workspace.tabs.map((t) => ({
          id: t.id,
          label: tabLabel(state, t),
          ...(t.folder ? { folder: t.folder } : {}),
          selectedHatchId: t.selectedHatchId,
          hatches: t.hatches.map((h) => ({ id: h.id, url: h.url, title: h.title, template: h.template, view: h.view, ...effectiveSize(h) })),
        })),
      };
      return answer;
    }
    case 'newTab': {
      const { name, folder } = (p as { name?: string; folder?: string }) ?? {};
      const tabId = actions.newTab(false);
      if (name) actions.renameTab(tabId, name);
      if (folder) actions.attachCanvas(tabId, folder);
      return tabId;
    }
    case 'closeTab':
      return actions.closeTab((p as { tabId: string }).tabId);
    case 'addNote': {
      const { tabId, text, author, attachTo } = p as { tabId: string; text: string; author: string; attachTo?: string };
      const tab = state.workspace.tabs.find((t) => t.id === tabId);
      if (attachTo && !tab?.hatches.some((h) => h.id === attachTo)) throw new Error(`No Hatch on that canvas has the id ${attachTo}.`);
      const id = actions.addNote(tabId, text, author);
      // An agent's attachment is no user's layout edit, so it goes straight in, under the Hatch.
      if (attachTo) editTab(tabId, (t) => ({ ...t, notes: (t.notes ?? []).map((n) => (n.id === id ? { ...n, ...attachSpot(t, attachTo, id), attachedTo: attachTo } : n)) }));
      return id;
    }
    case 'context': {
      const { id } = p as { id: string };
      for (const t of state.workspace.tabs) {
        const context = t.contexts?.find((c) => c.id === id);
        if (!context) continue;
        const items = context.members.map((m) => {
          const h = t.hatches.find((x) => x.id === m);
          if (h) return { kind: 'hatch', id: m, open: true, title: h.title, url: h.url, group: groupOf(t, m)?.name ?? null };
          const n = t.notes?.find((x) => x.id === m);
          if (n) return { kind: 'note', id: m, open: true, text: n.text, author: n.author, attachedTo: n.attachedTo ?? null, group: groupOf(t, m)?.name ?? null };
          return { kind: 'gone', id: m, open: false };
        });
        return { tabId: t.id, canvas: tabLabel(state, t), prompt: context.prompt ?? null, createdAt: context.createdAt, items };
      }
      throw new Error('No open canvas holds that context. Its canvas may have closed, so ask the user to copy the link again.');
    }
    case 'groups': {
      const tab = state.workspace.tabs.find((t) => t.id === (p as { tabId: string }).tabId);
      if (!tab) throw new Error('That canvas has closed.');
      return (tab.groups ?? []).map((g) => ({
        id: g.id,
        name: g.name,
        locked: g.locked === true,
        members: g.members.map((m) => {
          const h = tab.hatches.find((x) => x.id === m);
          return h ? { kind: 'hatch', id: m, title: hatchLabel(h) } : { kind: 'note', id: m, title: tab.notes?.find((x) => x.id === m)?.text.slice(0, 80) ?? m };
        }),
        attachedNotes: (tab.notes ?? []).filter((n) => n.attachedTo && g.members.includes(n.attachedTo)).map((n) => n.id),
      }));
    }
    case 'groupItems': {
      const { tabId, ids, name } = p as { tabId: string; ids: string[]; name: string };
      const tab = state.workspace.tabs.find((t) => t.id === tabId);
      if (!tab) throw new Error('That canvas has closed.');
      const unknown = ids.filter((id) => !tab.hatches.some((h) => h.id === id) && !tab.notes?.some((n) => n.id === id));
      if (unknown.length) throw new Error(`No Hatch or note on that canvas has the id ${unknown.join(', ')}.`);
      const members = unitIds(tab, ids);
      if (members.length < 2) throw new Error('A group needs two or more Hatches or notes.');
      if (lockedAmong(tab, members).length) throw new Error('Some of those items sit in a locked group. The user locked it, so leave it as it is.');
      recordLayout(tabId);
      const group: Group = { id: newId('group'), name: name.trim().slice(0, MAX_GROUP_NAME) || 'Group', members };
      editTab(tabId, (t) => ({ ...t, groups: [...withoutInGroups(t.groups ?? [], members), group] }));
      return group.id;
    }
    case 'arrangeItems': {
      const { tabId, ids, groupId, mode } = p as { tabId: string; ids?: string[]; groupId?: string; mode: ArrangeMode };
      const tab = state.workspace.tabs.find((t) => t.id === tabId);
      if (!tab) throw new Error('That canvas has closed.');
      const group = groupId ? tab.groups?.find((g) => g.id === groupId) : null;
      if (groupId && !group) throw new Error(`No group on that canvas has the id ${groupId}. Call list_groups to see them.`);
      const result = actions.arrangeItems(tabId, group ? group.members : (ids ?? []), mode);
      if ('error' in result) throw new Error(result.error);
      return result.moved;
    }
    case 'notes': {
      const tab = state.workspace.tabs.find((t) => t.id === (p as { tabId: string }).tabId);
      if (!tab) throw new Error('That canvas has closed.');
      return tab.notes ?? [];
    }
    case 'openHatch': {
      const { tabId, url, preset, width, height } = p as { tabId: string; url: string; preset?: Exclude<TemplateId, 'custom'>; width?: number; height?: number };
      const opened = actions.openHatch(url, { tabId, byAgent: true });
      if ('error' in opened) throw new Error(opened.error);
      if (preset) actions.applyTemplate(opened.hatchId, preset);
      else if (width && height) actions.resizeHatch(opened.hatchId, width, height);
      return opened.hatchId;
    }
    case 'openForUser': {
      const opened = actions.openHatch((p as { input: string }).input);
      if ('error' in opened) throw new Error(opened.error);
      return opened.hatchId;
    }
    case 'closeHatch':
      return actions.closeHatch((p as { hatchId: string }).hatchId);
    case 'sizeHatch': {
      const { hatchId, preset, width, height } = p as { hatchId: string; preset?: Exclude<TemplateId, 'custom'>; width?: number; height?: number };
      if (preset) actions.applyTemplate(hatchId, preset);
      else if (width && height) actions.resizeHatch(hatchId, width, height);
      const hatch = findHatch(hatchId);
      if (!hatch) throw new Error('That Hatch has closed.');
      return effectiveSize(hatch);
    }
    case 'requestView': {
      const { hatchId, view, reason, agent, ask } = p as ViewRequest & { ask: boolean };
      const hatch = findHatch(hatchId);
      if (!hatch) throw new Error('That Hatch has closed.');
      if (hatch.view === view) return 'same';
      set((s) => ({ viewRequests: { ...s.viewRequests, [hatchId]: { hatchId, view, reason, agent } } }));
      if (ask) return 'asked';
      // With the question switched off, the reason still shows for a few seconds after the switch.
      actions.setView(hatchId, view, { keepNotice: true });
      setTimeout(() => actions.dismissViewRequest(hatchId), 8000);
      return 'switched';
    }
    default:
      throw new Error(`The interface has no method called ${method}.`);
  }
}

/** A note's size on screen, which stays the same at every zoom. Revealing a note needs it. */
export const NOTE_SIZE = { width: 176, height: 120 };

function findNote(noteId: string): { tabId: string; note: Note } | null {
  for (const t of state.workspace.tabs) {
    const note = t.notes?.find((n) => n.id === noteId);
    if (note) return { tabId: t.id, note };
  }
  return null;
}

function editNotes(noteId: string, change: (note: Note) => Note): void {
  const found = findNote(noteId);
  if (found) editTab(found.tabId, (t) => ({ ...t, notes: (t.notes ?? []).map((n) => (n.id === noteId ? change(n) : n)) }));
}

function remember(entry: Closed): void {
  set((s) => ({ closed: [...s.closed, entry].slice(-CLOSED_LIMIT) }));
}

function findHatch(hatchId: string): Hatch | null {
  for (const t of state.workspace.tabs) {
    const h = t.hatches.find((x) => x.id === hatchId);
    if (h) return h;
  }
  return null;
}
/** A Hatch in Fit to view takes its size from the window. */
export function effectiveSize(hatch: Hatch): { width: number; height: number } {
  if (hatch.template !== 'fit') return { width: hatch.width, height: hatch.height };
  return { width: Math.max(240, state.viewport.width), height: Math.max(240, state.viewport.height) };
}

// ---- selectors ----

export const activeTab = (s: State): Tab => s.workspace.tabs.find((t) => t.id === s.workspace.activeTabId) ?? s.workspace.tabs[0]!;
export const selectedHatch = (s: State): Hatch | null => {
  const tab = activeTab(s);
  return tab.hatches.find((h) => h.id === tab.selectedHatchId) ?? null;
};
export const fitHatch = (tab: Tab): Hatch | null => tab.hatches.find((h) => h.template === 'fit') ?? null;
export const loadStateOf = (s: State, hatchId: string): LoadState => s.load[hatchId] ?? IDLE;
export const hatchLabel = (hatch: Hatch): string => hatch.title || labelForUrl(hatch.url);
/** A tab is a canvas, so it carries the user's name for it, its folder's or its project's name, and never the title of one page. */
export function tabLabel(s: State, tab: Tab): string {
  if (tab.name) return tab.name;
  if (tab.folder) return folderName(tab.folder);
  for (const h of tab.hatches) {
    const project = projectOf(h.url, s.projects.projects, s.projects.proxyPort);
    if (project) return project.name;
  }
  const index = s.workspace.tabs.findIndex((t) => t.id === tab.id);
  return index > 0 ? `Canvas ${index + 1}` : 'Canvas';
}

// ---- workspace edits ----

function editTab(tabId: string, change: (tab: Tab) => Tab): void {
  set((s) => ({ workspace: { ...s.workspace, tabs: s.workspace.tabs.map((t) => (t.id === tabId ? change(t) : t)) } }));
}
const editActiveTab = (change: (tab: Tab) => Tab): void => editTab(state.workspace.activeTabId, change);

const tabOf = (hatchId: string): string | null => state.workspace.tabs.find((t) => t.hatches.some((h) => h.id === hatchId))?.id ?? null;

function editHatch(hatchId: string, change: (hatch: Hatch) => Hatch): void {
  set((s) => ({
    workspace: {
      ...s.workspace,
      tabs: s.workspace.tabs.map((t) => (t.hatches.some((h) => h.id === hatchId) ? { ...t, hatches: t.hatches.map((h) => (h.id === hatchId ? change(h) : h)) } : t)),
    },
  }));
}

/** Leaving Fit to view restores the size the Hatch had before. */
const leaveFit = (h: Hatch): Hatch => (h.template === 'fit' ? { ...h, template: templateForSize(h.width, h.height) } : h);

export const actions = {
  setViewport(width: number, height: number): void {
    if (width !== state.viewport.width || height !== state.viewport.height) set({ viewport: { width, height } });
  },

  // tabs
  /** An agent's new tab opens behind the one the user is looking at. */
  newTab(activate = true): string {
    const tab = emptyTab();
    set((s) => ({ workspace: { ...s.workspace, tabs: [...s.workspace.tabs, tab], activeTabId: activate ? tab.id : s.workspace.activeTabId } }));
    return tab.id;
  },
  /** A canvas the user makes asks which working folder it belongs to. The question may be skipped. */
  newCanvasFromUser(): string {
    const tabId = actions.newTab();
    set({ attachPrompt: tabId });
    return tabId;
  },
  /** Asks which working folder a canvas belongs to. */
  askFolderFor(tabId: string): void {
    set({ attachPrompt: tabId });
  },
  closeAttachPrompt(): void {
    set({ attachPrompt: null });
  },
  /** Offers to sign in to a Hatch's site through another browser. */
  async askSignInThrough(hatchId: string): Promise<void> {
    const through = await window.hatch.signInThrough(hatchId);
    if (through) set({ signInThrough: through });
    else actions.toast('Open a web page in this Hatch first, then sign in through another browser.');
  },
  closeSignInThrough(): void {
    set({ signInThrough: null });
  },
  /** Gives a canvas to a working folder, or takes it away with null. The folder's previous canvas lets go, as one canvas belongs to a folder. */
  attachCanvas(tabId: string, folder: string | null): void {
    const clean = folder?.replace(/\/+$/, '') || null;
    set((s) => ({
      attachPrompt: s.attachPrompt === tabId ? null : s.attachPrompt,
      workspace: {
        ...s.workspace,
        tabs: s.workspace.tabs.map((t) => {
          if (t.id === tabId) {
            const { folder: _old, ...rest } = t;
            return clean ? { ...rest, folder: clean } : rest;
          }
          if (clean && t.folder === clean) {
            const { folder: _taken, ...rest } = t;
            return rest;
          }
          return t;
        }),
      },
    }));
  },
  activateTab(tabId: string): void {
    // A selection belongs to the canvas it was made on.
    set((s) => ({ workspace: { ...s.workspace, activeTabId: tabId }, ...(s.workspace.activeTabId === tabId ? {} : { selection: [], selectedGroup: null, promptOpen: false }) }));
  },
  closeTab(tabId: string): void {
    const index = state.workspace.tabs.findIndex((t) => t.id === tabId);
    const closing = state.workspace.tabs[index];
    if (!closing) return;
    // Hatch always shows a canvas, so closing the last one leaves an empty one, which reopening the closed canvas replaces.
    const blank = state.workspace.tabs.length === 1 ? emptyTab() : null;
    if (closing.hatches.length > 0) remember({ id: newId('closed'), kind: 'canvas', tab: { ...closing, hatches: closing.hatches.map(leaveFit) }, index, name: tabLabel(state, closing), ...(blank ? { blank: blank.id } : null) });
    set((s) => {
      let tabs = s.workspace.tabs.filter((t) => t.id !== tabId);
      if (tabs.length === 0) tabs = [blank ?? emptyTab()];
      const activeTabId = s.workspace.activeTabId === tabId ? tabs[Math.min(index, tabs.length - 1)]!.id : s.workspace.activeTabId;
      return { workspace: { ...s.workspace, tabs, activeTabId } };
    });
  },
  /** An empty name returns the tab to its project's name. */
  renameTab(tabId: string, name: string): void {
    const next = name.trim().slice(0, 60);
    editTab(tabId, ({ name: _old, ...rest }) => (next ? { ...rest, name: next } : rest));
  },
  /** The switch at the left end of the top strip opens and closes the left column alone. */
  toggleLeft(): void {
    set((s) => ({ workspace: { ...s.workspace, leftOpen: s.workspace.leftOpen === false } }));
  },
  toggleSidebar(): void {
    set((s) => ({ workspace: { ...s.workspace, sidebarOpen: !s.workspace.sidebarOpen } }));
  },
  /** Feedback and Settings: a press shows the panel, and a second press on the panel showing closes the sidebar. */
  togglePanel(panel: 'settings' | 'feedback'): void {
    if (state.workspace.sidebarOpen && state.panel === panel) return set((s) => ({ workspace: { ...s.workspace, sidebarOpen: false } }));
    if (panel === 'feedback') return void actions.openFeedback();
    actions.showPanel(panel);
  },
  /**
   * « and »: select the previous or next Hatch in the Hatches list, wrapping at either end, and centre it at the current zoom.
   * With none selected, » starts at the first and « at the last. In Fit to view the next Hatch takes the window.
   */
  jumpHatch(step: 1 | -1): void {
    const tab = activeTab(state);
    const list = tab.hatches;
    if (list.length === 0) return;
    const at = list.findIndex((h) => h.id === tab.selectedHatchId);
    const next = list[at < 0 ? (step > 0 ? 0 : list.length - 1) : (at + step + list.length) % list.length]!;
    if (fitHatch(tab)) return actions.applyTemplate(next.id, 'fit');
    const { width, height } = state.viewport;
    editActiveTab((t) => ({ ...t, selectedHatchId: next.id, pan: { x: width / 2 - (next.x + next.width / 2) * t.zoom, y: height / 2 - (next.y + next.height / 2) * t.zoom } }));
    if (state.panel !== 'comments') set({ panel: 'hatch' });
  },

  // selection, groups and arrangement
  /** Shift-click: adds an item to the selection, or takes it out. A Hatch added becomes the one the sidebar shows. */
  toggleSelected(id: string): void {
    const t = activeTab(state);
    const base = state.selection.length ? state.selection : [t.selectedHatchId].filter((x): x is string => !!x);
    const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    const hatch = [...next].reverse().find((x) => t.hatches.some((h) => h.id === x)) ?? null;
    if (state.editingNote) actions.finishNote();
    editActiveTab((tab) => ({ ...tab, selectedHatchId: hatch, hatches: tab.hatches.map(leaveFit) }));
    set({ selection: next, selectedGroup: null, selectedNote: next.length === 1 && !hatch ? next[0]! : null, promptOpen: false });
  },
  /** A selection box or Cmd+A: these items, and no group. */
  selectItems(ids: string[]): void {
    const t = activeTab(state);
    const hatch = ids.find((x) => t.hatches.some((h) => h.id === x)) ?? null;
    if (state.editingNote) actions.finishNote();
    editActiveTab((tab) => ({ ...tab, selectedHatchId: hatch }));
    set({ selection: ids, selectedGroup: null, selectedNote: ids.length === 1 && !hatch ? ids[0]! : null, promptOpen: false });
  },
  selectAll(): void {
    const t = activeTab(state);
    if (fitHatch(t)) return;
    actions.selectItems([...t.hatches.map((h) => h.id), ...(t.notes ?? []).filter((n) => !n.attachedTo).map((n) => n.id)]);
  },
  clearSelection(): void {
    editActiveTab((t) => (t.selectedHatchId ? { ...t, selectedHatchId: null } : t));
    set({ selection: [], selectedGroup: null, selectedNote: null, promptOpen: false });
  },
  /** A click on a group's name selects its items as one. */
  selectGroup(groupId: string): void {
    const g = activeTab(state).groups?.find((x) => x.id === groupId);
    if (!g) return;
    actions.selectItems(g.members);
    set({ selectedGroup: groupId });
  },

  /**
   * Starts a drag of a Hatch's title or a note. The selection moves together when the item is part of it, and a group moves as one.
   * A Hatch takes its attached notes along. Returns null when a locked group holds the item.
   */
  beginMove(id: string): { to(dx: number, dy: number): void; end(moved: boolean): void } | null {
    const t = activeTab(state);
    const note = t.notes?.find((n) => n.id === id);
    const group = groupOf(t, id);
    const own = note?.attachedTo ? [id] : state.selection.includes(id) && state.selection.length > 1 ? unitIds(t, state.selection) : group && !note?.attachedTo ? group.members : [id];
    const ids = note?.attachedTo ? own : withAttached(t, own);
    if (lockedAmong(t, ids).length) {
      actions.toast('This group is locked. Unlock it from the group menu to move it.');
      return null;
    }
    const start = new Map<string, Point>([...t.hatches, ...(t.notes ?? [])].filter((x) => ids.includes(x.id)).map((x) => [x.id, { x: x.x, y: x.y }]));
    let recorded = false;
    return {
      to: (dx, dy) => {
        if (!recorded) {
          recordLayout(t.id);
          recorded = true;
        }
        editTab(t.id, (tab) => ({
          ...tab,
          hatches: tab.hatches.map((h) => (start.has(h.id) ? { ...h, x: Math.round(start.get(h.id)!.x + dx), y: Math.round(start.get(h.id)!.y + dy) } : h)),
          ...(tab.notes ? { notes: tab.notes.map((n) => (start.has(n.id) ? { ...n, x: Math.round(start.get(n.id)!.x + dx), y: Math.round(start.get(n.id)!.y + dy) } : n)) } : {}),
        }));
      },
      end: (moved) => {
        // A lone note dropped on a page attaches to that Hatch; an attached note dropped far from its Hatch lets go.
        if (moved && note && ids.length === 1) actions.dropNote(id);
      },
    };
  },
  /** Decides what a dropped note belongs to. */
  dropNote(noteId: string): void {
    const t = activeTab(state);
    const n = t.notes?.find((x) => x.id === noteId);
    if (!n) return;
    const m = measureOf(t);
    const centre = { x: n.x + m.note.width / 2, y: n.y + m.note.height / 2 };
    const over = [...t.hatches].reverse().find((h) => centre.x >= h.x && centre.x <= h.x + h.width && centre.y >= h.y - m.title && centre.y <= h.y + h.height);
    if (over && over.id !== n.attachedTo) return actions.attachNote(noteId, over.id, { recorded: true });
    if (!n.attachedTo) return;
    const h = t.hatches.find((x) => x.id === n.attachedTo);
    const reach = 200;
    const near = h && centre.x >= h.x - reach && centre.x <= h.x + h.width + reach && centre.y >= h.y - reach && centre.y <= h.y + h.height + reach;
    if (!near) actions.attachNote(noteId, null, { recorded: true });
  },
  /** Attaches a note to a Hatch, under its page, or lets it go when `hatchId` is null. */
  attachNote(noteId: string, hatchId: string | null, options: { recorded?: boolean } = {}): void {
    const found = findNote(noteId);
    if (!found) return;
    if (!options.recorded) recordLayout(found.tabId);
    editTab(found.tabId, (t) => {
      const spot = hatchId ? attachSpot(t, hatchId, noteId) : null;
      const groups = hatchId && t.groups ? withoutInGroups(t.groups, [noteId]) : t.groups;
      return {
        ...t,
        ...(groups ? { groups } : {}),
        notes: (t.notes ?? []).map((n) => {
          if (n.id !== noteId) return n;
          const { attachedTo: _old, ...rest } = n;
          return spot ? { ...rest, ...spot, attachedTo: hatchId! } : rest;
        }),
      };
    });
    const t = state.workspace.tabs.find((x) => x.id === found.tabId)!;
    const h = hatchId ? t.hatches.find((x) => x.id === hatchId) : null;
    noticeLayout(h ? `Attached the note to ${hatchLabel(h)}` : 'The note stands on its own now');
  },

  /** Group: the selected Hatches and free notes become one named group. Items leave any group they were in. */
  groupSelection(): string | null {
    const t = activeTab(state);
    const members = unitIds(t, state.selection);
    if (members.length < 2) return null;
    recordLayout(t.id);
    const used = new Set((t.groups ?? []).map((g) => g.name));
    let n = (t.groups?.length ?? 0) + 1;
    while (used.has(`Group ${n}`)) n++;
    const group: Group = { id: newId('group'), name: `Group ${n}`, members };
    editActiveTab((tab) => ({ ...tab, groups: [...withoutInGroups(tab.groups ?? [], members), group] }));
    set({ selectedGroup: group.id, renamingGroup: group.id });
    return group.id;
  },
  ungroup(groupId: string): void {
    const t = activeTab(state);
    if (!t.groups?.some((g) => g.id === groupId)) return;
    recordLayout(t.id);
    editActiveTab((tab) => ({ ...tab, groups: (tab.groups ?? []).filter((g) => g.id !== groupId) }));
    set((s) => ({ selectedGroup: s.selectedGroup === groupId ? null : s.selectedGroup }));
    noticeLayout('Ungrouped. Every Hatch and note stays.');
  },
  renameGroup(groupId: string, name: string): void {
    const clean = name.trim().slice(0, MAX_GROUP_NAME);
    set({ renamingGroup: null });
    const t = activeTab(state);
    const g = t.groups?.find((x) => x.id === groupId);
    if (!g || !clean || clean === g.name) return;
    recordLayout(t.id);
    editActiveTab((tab) => ({ ...tab, groups: (tab.groups ?? []).map((x) => (x.id === groupId ? { ...x, name: clean } : x)) }));
  },
  startRenamingGroup(groupId: string | null): void {
    set({ renamingGroup: groupId });
  },
  toggleLock(groupId: string): void {
    const t = activeTab(state);
    const g = t.groups?.find((x) => x.id === groupId);
    if (!g) return;
    recordLayout(t.id);
    editActiveTab((tab) => ({ ...tab, groups: (tab.groups ?? []).map((x) => (x.id === groupId ? (x.locked ? { id: x.id, name: x.name, members: x.members } : { ...x, locked: true }) : x)) }));
    noticeLayout(g.locked ? `Unlocked ${g.name}` : `Locked ${g.name}. Its items stay where they are.`);
  },

  /** Arrange: tidies, lines up or spreads the selection. Pages keep their sizes, attached notes travel with their Hatch, and nothing else moves. */
  arrangeSelection(mode: ArrangeMode): void {
    const t = activeTab(state);
    const ids = unitIds(t, state.selection);
    const result = actions.arrangeItems(t.id, ids, mode);
    if ('error' in result) return actions.toast(result.error);
    if (result.moved === 0) return noticeLayout('Everything was in place already');
    // The notice counts what the user arranged, attached notes included, whatever moved.
    const count = withAttached(t, ids).length;
    const verb = mode === 'tidy' ? 'Tidied' : mode.startsWith('align') ? 'Aligned' : mode.startsWith('distribute') ? 'Spread out' : 'Arranged';
    noticeLayout(`${verb} ${itemsWord(count)}`);
  },
  /** Arranges items on any canvas, for the user or an agent. Refuses locked items by name, and counts what moved. */
  arrangeItems(tabId: string, ids: string[], mode: ArrangeMode): { moved: number } | { error: string } {
    const t = state.workspace.tabs.find((x) => x.id === tabId);
    if (!t) return { error: 'That canvas has closed.' };
    if (fitHatch(t)) return { error: 'Leave Fit to view to arrange the canvas.' };
    const units = unitsFor(t, unitIds(t, ids), measureOf(t));
    if (units.length < 2) return { error: 'Choose two or more Hatches or notes to arrange.' };
    const locked = lockedAmong(t, units.map((u) => u.id));
    if (locked.length) return { error: `${itemsWord(locked.length)} sit in a locked group, so Hatch left everything where it was. Unlock the group to arrange it.` };
    const moves = arrange(units, mode);
    if (moves.size === 0) return { moved: 0 };
    recordLayout(tabId);
    editTab(tabId, (tab) => applyMoves(tab, moves));
    return { moved: moves.size };
  },
  /** Fit selection to view moves the camera alone: every selected item shows, and nothing on the canvas moves. */
  fitSelection(): void {
    const t = activeTab(state);
    const units = unitsFor(t, unitIds(t, state.selection), measureOf(t));
    if (!units.length || fitHatch(t)) return;
    actions.showBox(bounds(units.map((u) => u.box)));
  },
  showBox(box: Box): void {
    const margin = 64;
    editActiveTab((t) => {
      const zoom = clampZoom(Math.min((state.viewport.width - margin * 2) / box.width, (state.viewport.height - margin * 2) / box.height, 1));
      return { ...t, zoom, pan: { x: (state.viewport.width - box.width * zoom) / 2 - box.x * zoom, y: (state.viewport.height - box.height * zoom) / 2 - box.y * zoom } };
    });
  },

  /** Undo for the canvas layout. Typing in a page or a note keeps its own undo, which the caller decides. */
  undoLayout(): void {
    const snap = state.layoutPast[state.layoutPast.length - 1];
    const t = snap && state.workspace.tabs.find((x) => x.id === snap.tabId);
    if (!snap || !t) return actions.toast('There is no canvas change to undo.');
    set((s) => ({ layoutPast: s.layoutPast.slice(0, -1), layoutFuture: [...s.layoutFuture, snapshotOf(t)] }));
    editTab(snap.tabId, (tab) => restoreLayout(tab, snap));
    noticeLayout('Undid the last canvas change');
  },
  redoLayout(): void {
    const snap = state.layoutFuture[state.layoutFuture.length - 1];
    const t = snap && state.workspace.tabs.find((x) => x.id === snap.tabId);
    if (!snap || !t) return;
    set((s) => ({ layoutFuture: s.layoutFuture.slice(0, -1), layoutPast: [...s.layoutPast, snapshotOf(t)] }));
    editTab(snap.tabId, (tab) => restoreLayout(tab, snap));
    noticeLayout('Redid the canvas change');
  },
  dismissLayoutNotice(): void {
    set({ layoutNotice: null });
  },

  // context links
  openPrompt(open: boolean): void {
    set({ promptOpen: open });
  },
  /** The items a context link would carry for the current selection: the selected Hatches, their attached notes and the selected notes. */
  contextItems(): string[] {
    const t = activeTab(state);
    const ids = state.selection.length ? state.selection : [t.selectedHatchId].filter((x): x is string => !!x);
    return withAttached(t, unitIds(t, ids));
  },
  /** Stores the chosen items, fixed, and copies a link an agent reads through get_context. With a prompt, the prompt goes first. */
  async copyContext(options: { prompt?: string; exclude?: string[] } = {}): Promise<string | null> {
    const t = activeTab(state);
    const members = actions.contextItems().filter((id) => !options.exclude?.includes(id));
    if (!members.length) {
      actions.toast('Choose at least one Hatch or note for the context.');
      return null;
    }
    const prompt = options.prompt?.trim().slice(0, MAX_NOTE_LENGTH);
    const context: CanvasContext = { id: newId('ctx'), members, createdAt: new Date().toISOString(), ...(prompt ? { prompt } : {}) };
    editActiveTab((tab) => ({ ...tab, contexts: [...(tab.contexts ?? []), context].slice(-MAX_CONTEXTS) }));
    const link = hatchLink(context.id);
    const hatches = members.filter((id) => t.hatches.some((h) => h.id === id)).length;
    const notes = members.length - hatches;
    const count = [hatches ? `${hatches} ${hatches === 1 ? 'Hatch' : 'Hatches'}` : '', notes ? `${notes} ${notes === 1 ? 'note' : 'notes'}` : ''].filter(Boolean).join(' and ');
    await window.hatch.copyText(prompt ? `${prompt}\n\nHatch context: ${link}\nRead it with Hatch's get_context tool.` : link);
    set({ promptOpen: false });
    actions.toast(prompt ? `Copied your prompt with a context link for ${count}. Paste it into your agent.` : `Copied a context link for ${count}. Paste it into your agent.`);
    return context.id;
  },

  // canvas
  panBy(dx: number, dy: number): void {
    editActiveTab((t) => (fitHatch(t) ? t : { ...t, pan: { x: t.pan.x + dx, y: t.pan.y + dy } }));
  },
  panTo(x: number, y: number): void {
    editActiveTab((t) => (fitHatch(t) ? t : { ...t, pan: { x, y } }));
  },
  zoomTo(zoom: number, anchor?: Point): void {
    editActiveTab((t) => {
      if (fitHatch(t)) return t;
      const next = clampZoom(zoom);
      const at = anchor ?? { x: state.viewport.width / 2, y: state.viewport.height / 2 };
      return { ...t, zoom: next, pan: zoomAround(t.pan, t.zoom, next, at) };
    });
  },
  zoomStep(direction: 1 | -1): void {
    actions.zoomTo(nextZoomStep(activeTab(state).zoom, direction));
  },

  /** Zooms and pans so every Hatch in the tab shows at once. */
  showAll(): void {
    editActiveTab((t) => {
      if (fitHatch(t) || t.hatches.length + (t.notes?.length ?? 0) === 0) return t;
      // A note keeps its size on screen, so its size on the canvas is measured at the current zoom.
      const boxes = [...t.hatches, ...(t.notes ?? []).map((n) => ({ x: n.x, y: n.y - 30 / t.zoom, width: NOTE_SIZE.width / t.zoom, height: (NOTE_SIZE.height + 30) / t.zoom }))];
      const left = Math.min(...boxes.map((h) => h.x));
      const top = Math.min(...boxes.map((h) => h.y));
      const right = Math.max(...boxes.map((h) => h.x + h.width));
      const bottom = Math.max(...boxes.map((h) => h.y + h.height));
      const margin = 64;
      const zoom = clampZoom(Math.min((state.viewport.width - margin * 2) / (right - left), (state.viewport.height - margin * 2) / (bottom - top), 1));
      return { ...t, zoom, pan: { x: (state.viewport.width - (right - left) * zoom) / 2 - left * zoom, y: (state.viewport.height - (bottom - top) * zoom) / 2 - top * zoom } };
    });
  },

  // Hatches
  /** Selects a Hatch from the sidebar list and brings it into view. */
  reveal(hatchId: string): void {
    actions.select(hatchId);
    editActiveTab((t) => {
      const h = t.hatches.find((x) => x.id === hatchId);
      return h && !fitHatch(t) ? { ...t, pan: panToReveal({ x: h.x, y: h.y, width: h.width, height: h.height }, t.pan, t.zoom, state.viewport) } : t;
    });
  },
  /** A two-finger swipe across a page in Fit to view goes back or forward. On the canvas a sideways scroll stays a scroll. */
  swipePage(hatchId: string, direction: 'back' | 'forward'): void {
    const fit = fitHatch(activeTab(state));
    // Momentum from the swipe can reach the page that loads next, so one swipe counts once.
    if (fit?.id !== hatchId || Date.now() - lastSwipe < SWIPE_PAUSE_MS) return;
    lastSwipe = Date.now();
    if (direction === 'back') pages.back(hatchId);
    else pages.forward(hatchId);
  },
  /** A three-finger swipe in Fit to view moves to the next or previous Hatch, as the jump buttons do. */
  swipeWindow(direction: 'left' | 'right'): void {
    if (!fitHatch(activeTab(state))) return;
    actions.jumpHatch(direction === 'left' ? 1 : -1);
  },
  /** Fit to view is a toggle: on, one Hatch fills the window; off, the Hatch returns to its size on the canvas. */
  toggleFit(hatchId: string): void {
    const hatch = findHatch(hatchId);
    if (!hatch) return;
    if (hatch.template === 'fit') editHatch(hatchId, leaveFit);
    else actions.applyTemplate(hatchId, 'fit');
  },
  /** Esc leaves Fit to view first. On the canvas it deselects, but only when the key came from Hatch's own interface. */
  escape(fromHatchId?: string): void {
    if (!fromHatchId && state.placingNote) return set({ placingNote: false });
    if (!fromHatchId && state.editingNote) return actions.finishNote();
    if (!fromHatchId && state.promptOpen) return set({ promptOpen: false });
    if (!fromHatchId && state.selectedNote) return set({ selectedNote: null, selection: [] });
    if (!fromHatchId && state.selection.length > 1) return actions.clearSelection();
    const tab = activeTab(state);
    const fit = fitHatch(tab);
    if (fit) return fromHatchId && fromHatchId !== fit.id ? undefined : editHatch(fit.id, leaveFit);
    if (!fromHatchId) actions.select(null);
  },
  select(hatchId: string | null): void {
    if (state.selectedNote) {
      actions.finishNote();
      set({ selectedNote: null });
    }
    editActiveTab((t) => {
      if (t.selectedHatchId === hatchId) return t;
      // Fit to view shows one Hatch, so selecting nothing or another Hatch leaves it.
      return { ...t, selectedHatchId: hatchId, hatches: t.hatches.map((h) => (h.id === hatchId ? h : leaveFit(h))) };
    });
    set({ selection: hatchId ? [hatchId] : [], selectedGroup: null, promptOpen: false });
    // The user's selection opens a closed sidebar on the Hatch tab, which no switch in the top strip opens.
    if (hatchId) set((s) => ({ panel: s.panel === 'comments' ? s.panel : 'hatch', workspace: s.workspace.sidebarOpen ? s.workspace : { ...s.workspace, sidebarOpen: true } }));
  },
  /** Opens a Hatch for an address, or returns an error message when the address does not parse. */
  openHatch(input: string, options: { tabId?: string; byAgent?: boolean } = {}): { hatchId: string } | { error: string } {
    // The user may type a site's name. An agent passes links.
    const resolved = resolveAddress(input, !options.byAgent);
    if ('error' in resolved) return resolved;
    const hatch: Hatch = { id: newId('hatch'), url: resolved.url, title: '', x: 0, y: 0, width: 960, height: 752, template: 'desktop', view: 'page' };
    editTab(options.tabId ?? state.workspace.activeTabId, (t) => {
      const spot = (!options.byAgent && state.newHatchAt) || placeNewHatch(t.hatches);
      Object.assign(hatch, spot);
      // A Hatch an agent opens leaves the user's selection, Fit to view and canvas position alone.
      if (options.byAgent) return { ...t, hatches: [...t.hatches, hatch] };
      const pan = panToReveal({ ...spot, width: hatch.width, height: hatch.height }, t.pan, t.zoom, state.viewport);
      return { ...t, hatches: [...t.hatches.map(leaveFit), hatch], selectedHatchId: hatch.id, pan };
    });
    if (!options.byAgent) {
      const fit = state.newHatchFit;
      set({ newHatchOpen: false, newHatchAt: null, newHatchFit: false, panel: 'hatch' });
      if (fit) actions.applyTemplate(hatch.id, 'fit');
    }
    return { hatchId: hatch.id };
  },
  /** A double tap on the canvas opens the new Hatch where the user tapped. */
  requestNewHatchAt(at: Point): void {
    set({ newHatchAt: { x: Math.round(at.x), y: Math.round(at.y) } });
    actions.requestNewHatch();
  },
  dismissPopup(hatchId: string): void {
    set((s) => ({ popups: Object.fromEntries(Object.entries(s.popups).filter(([id]) => id !== hatchId)) }));
  },
  /** Opens the New Hatch box, or the default page when Settings names one. A Hatch opened from Fit to view takes the view in turn. */
  requestNewHatch(): void {
    set({ newHatchFit: fitHatch(activeTab(state)) !== null });
    const page = state.settings.newHatchPage;
    if (page && 'hatchId' in actions.openHatch(page)) return;
    set({ newHatchOpen: true });
  },
  closeNewHatch(): void {
    set({ newHatchOpen: false, newHatchAt: null, newHatchFit: false });
  },
  closeHatch(hatchId: string): void {
    const tabId = tabOf(hatchId);
    const hatch = findHatch(hatchId);
    if (!tabId || !hatch) return;
    remember({ id: newId('closed'), kind: 'hatch', tabId, hatch: leaveFit(hatch) });
    editTab(tabId, (t) => forgetItem({ ...t, hatches: t.hatches.filter((h) => h.id !== hatchId), selectedHatchId: t.selectedHatchId === hatchId ? null : t.selectedHatchId }, hatchId));
    set((s) => ({ selection: s.selection.filter((x) => x !== hatchId) }));
    set((s) => {
      const { [hatchId]: _load, ...load } = s.load;
      const { [hatchId]: _request, ...viewRequests } = s.viewRequests;
      const { [hatchId]: _dialog, ...dialogs } = s.dialogs;
      const { [hatchId]: _popup, ...popups } = s.popups;
      const { [hatchId]: _audible, ...audible } = s.audible;
      return { load, viewRequests, dialogs, popups, audible };
    });
  },
  /**
   * Brings back the last thing the user closed, or the one entry they chose, with fresh ids: a Hatch to its canvas and place, a canvas as a tab where it sat.
   */
  reopenClosed(closedId?: string): void {
    const entry = closedId ? state.closed.find((c) => c.id === closedId) : state.closed[state.closed.length - 1];
    if (!entry) return;
    set((s) => ({ closed: s.closed.filter((c) => c.id !== entry.id) }));
    if (entry.kind === 'hatch') {
      const tabId = state.workspace.tabs.some((t) => t.id === entry.tabId) ? entry.tabId : state.workspace.activeTabId;
      const hatch: Hatch = { ...entry.hatch, id: newId('hatch') };
      editTab(tabId, (t) => ({ ...t, hatches: [...t.hatches.map(leaveFit), hatch], selectedHatchId: hatch.id, pan: panToReveal(hatch, t.pan, t.zoom, state.viewport) }));
      set((s) => ({ workspace: { ...s.workspace, activeTabId: tabId }, panel: s.panel === 'comments' ? s.panel : 'hatch' }));
      return;
    }
    // A pinned canvas lives on in the Canvases list, so reopening it opens it from its pin, or shows it when the pin opened it already.
    // A second copy would list the same canvas twice.
    const { savedId, ...closedTab } = entry.tab;
    if (savedId && state.savedCanvases.some((c) => c.id === savedId)) return actions.openSavedCanvas(savedId);
    // Fresh ids for every Hatch and note, carried into attachments and groups. Context links named the old ids, so they stay behind.
    const { map: ids, contexts: _contexts, ...fresh } = freshIds(closedTab, newId);
    const tab: Tab = { ...fresh, id: newId('tab'), selectedHatchId: entry.tab.selectedHatchId ? (ids.get(entry.tab.selectedHatchId) ?? null) : null };
    set((s) => {
      // The empty canvas that stood in for the closed one gives way to it, while the user has left it empty.
      const tabs = s.workspace.tabs.filter((t) => t.id !== entry.blank || t.hatches.length > 0 || t.name);
      const at = Math.min(entry.index, tabs.length);
      // A reopened canvas gives its folder up when another canvas took the folder meanwhile.
      const holder = tabs.find((t) => t.folder && t.folder === tab.folder)?.id;
      return { workspace: { ...s.workspace, tabs: oneCanvasPerFolder([...tabs.slice(0, at), tab, ...tabs.slice(at)], holder), activeTabId: tab.id } };
    });
  },
  /** A muted Hatch keeps its mute through navigations and restarts. */
  toggleMute(hatchId: string): void {
    editHatch(hatchId, ({ muted, ...rest }) => (muted ? rest : { ...rest, muted: true }));
  },
  /**
   * Opens a second Hatch on the same page at the same size, selected, and returns its id.
   * With `at` it sits there, as a Cmd-drag places it; otherwise it joins the end of the row.
   */
  duplicateHatch(hatchId: string, at?: Point): string | null {
    const tabId = tabOf(hatchId);
    const source = state.workspace.tabs.find((t) => t.id === tabId)?.hatches.find((h) => h.id === hatchId);
    if (!tabId || !source) return null;
    // A duplicate belongs to no action button, so the button keeps returning to the Hatch it opened.
    const { action: _action, ...rest } = leaveFit(source);
    const copy: Hatch = { ...rest, id: newId('hatch'), title: source.title };
    editTab(tabId, (t) => {
      Object.assign(copy, at ?? placeNewHatch(t.hatches));
      const pan = at ? t.pan : panToReveal(copy, t.pan, t.zoom, state.viewport);
      return { ...t, hatches: [...t.hatches.map(leaveFit), copy], selectedHatchId: copy.id, pan };
    });
    if (state.panel !== 'comments') set({ panel: 'hatch' });
    return copy.id;
  },
  moveHatch(hatchId: string, x: number, y: number): void {
    editHatch(hatchId, (h) => ({ ...h, x: Math.round(x), y: Math.round(y) }));
  },
  resizeHatch(hatchId: string, width: number, height: number): void {
    const w = clampSize(width);
    const h = clampSize(height);
    editHatch(hatchId, (hatch) => ({ ...hatch, width: w, height: h, template: templateForSize(w, h) }));
  },
  applyTemplate(hatchId: string, template: Exclude<TemplateId, 'custom'>): void {
    const size = TEMPLATES.find((t) => t.id === template)?.size;
    const tabId = tabOf(hatchId);
    if (!tabId) return;
    editTab(tabId, (t) => ({
      ...t,
      selectedHatchId: hatchId,
      hatches: t.hatches.map((h) => {
        if (h.id !== hatchId) return leaveFit(h);
        return size ? { ...h, ...size, template } : { ...h, template: 'fit' };
      }),
    }));
  },
  setView(hatchId: string, view: HatchView, options: { keepNotice?: boolean } = {}): void {
    editHatch(hatchId, (h) => ({ ...h, view }));
    if (!options.keepNotice) actions.dismissViewRequest(hatchId);
  },
  toggleView(hatchId: string): void {
    const hatch = findHatch(hatchId);
    if (hatch) actions.setView(hatchId, hatch.view === 'agent' ? 'page' : 'agent');
  },
  dismissViewRequest(hatchId: string): void {
    set((s) => {
      const { [hatchId]: _gone, ...viewRequests } = s.viewRequests;
      return { viewRequests };
    });
  },
  async updateSettings(change: Partial<Settings>): Promise<void> {
    set({ settings: await window.hatch.setSettings(change) });
  },
  pageChanged(hatchId: string, change: { url?: string; title?: string }): void {
    editHatch(hatchId, (h) => ({ ...h, ...change }));
  },
  setLoad(hatchId: string, change: Partial<LoadState>): void {
    set((s) => ({ load: { ...s.load, [hatchId]: { ...loadStateOf(s, hatchId), ...change } } }));
  },

  // comments
  async loadComments(hatchId: string): Promise<void> {
    const hatch = findHatch(hatchId);
    if (!hatch || !/^https?:/.test(hatch.url)) return;
    const url = hatch.url;
    const result = await window.hatch.comments(url);
    // The page may have moved on while the file was read.
    if (findHatch(hatchId)?.url !== url) return;
    if (result.ok) set((s) => ({ comments: { ...s.comments, [hatchId]: result.value } }));
  },
  setMissing(hatchId: string, ids: string[]): void {
    if ((state.missing[hatchId] ?? []).join() !== ids.join()) set((s) => ({ missing: { ...s.missing, [hatchId]: ids } }));
  },
  startPicking(hatchId: string): void {
    set({ picking: hatchId, pickPurpose: 'comment', draft: null, openThread: null, commentError: null });
    actions.showPanel('comments');
    if (!state.settings.showComments) void actions.updateSettings({ showComments: true });
  },
  startGrab(hatchId: string): void {
    set({ picking: hatchId, pickPurpose: 'grab', draft: null, openThread: null, grabbed: null });
  },
  async finishGrab(hatchId: string, result: { html?: string; elements?: number; label: string; error?: string }): Promise<void> {
    set({ picking: null });
    if (!result.html) return set({ grabbed: { hatchId, ok: false, text: result.error ?? 'Hatch could not copy that element.' } });
    await window.hatch.copyForPaper(result.html);
    const text = `Copied “${result.label}”, ${result.elements} ${result.elements === 1 ? 'layer' : 'layers'}. Paste it into Paper with Cmd+V.`;
    set({ grabbed: { hatchId, ok: true, text } });
    actions.toast(text);
  },
  stopPicking(): void {
    set({ picking: null });
  },
  setDraft(draft: State['draft']): void {
    set({ draft, picking: null });
  },
  async submitDraft(text: string): Promise<void> {
    const { draft } = state;
    const hatch = draft && findHatch(draft.hatchId);
    if (!draft || !hatch) return;
    const result = await window.hatch.addComment(hatch.url, { anchor: draft.anchor, label: draft.label, text });
    if (!applyComments(draft.hatchId, result)) return;
    const added = result.ok ? result.value.threads.at(-1) : undefined;
    set({ draft: null, openThread: added ? { hatchId: draft.hatchId, threadId: added.id } : null });
  },
  openThread(hatchId: string, threadId: string): void {
    set({ openThread: { hatchId, threadId }, draft: null, picking: null, commentError: null });
    const hatch = findHatch(hatchId);
    if (hatch && state.comments[hatchId]?.threads.find((t) => t.id === threadId)?.unread) void window.hatch.markCommentSeen(hatch.url, threadId).then((r) => applyComments(hatchId, r));
  },
  closeThread(): void {
    set({ openThread: null, draft: null, commentError: null });
  },
  async replyComment(hatchId: string, threadId: string, text: string): Promise<boolean> {
    const hatch = findHatch(hatchId);
    return hatch ? applyComments(hatchId, await window.hatch.replyComment(hatch.url, threadId, text)) : false;
  },
  async setCommentStatus(hatchId: string, threadId: string, status: CommentStatus): Promise<void> {
    const hatch = findHatch(hatchId);
    if (hatch) applyComments(hatchId, await window.hatch.setCommentStatus(hatch.url, threadId, status));
  },
  async editComment(hatchId: string, threadId: string, index: number, text: string): Promise<boolean> {
    const hatch = findHatch(hatchId);
    return hatch ? applyComments(hatchId, await window.hatch.editComment(hatch.url, threadId, index, text)) : false;
  },
  async removeComment(hatchId: string, threadId: string): Promise<void> {
    const hatch = findHatch(hatchId);
    if (hatch && applyComments(hatchId, await window.hatch.removeComment(hatch.url, threadId))) set({ openThread: null });
  },

  openContextMenu(e: { clientX: number; clientY: number; preventDefault(): void; stopPropagation(): void }, tabId: string, hatchId: string | null): void {
    e.preventDefault();
    e.stopPropagation();
    set({ contextMenu: { x: e.clientX, y: e.clientY, tabId, hatchId } });
  },
  closeContextMenu(): void {
    if (state.contextMenu) set({ contextMenu: null });
  },
  /** Copies the link an agent follows to one Hatch or to a whole canvas. */
  async copyLink(id: string, what: 'Hatch' | 'canvas'): Promise<void> {
    await window.hatch.copyText(hatchLink(id));
    actions.toast(`Link to this ${what} copied. Paste it to your agent.`);
  },
  toast(text: string): void {
    set({ toast: text });
    if (toastTimer) clearTimeout(toastTimer);
    // A longer notice stays longer, so the user can read an instruction to the end.
    toastTimer = setTimeout(() => set({ toast: null }), Math.max(2400, text.length * 50));
  },

  closeBanner(): void {
    set({ bannerClosed: true });
  },

  // sign-ins
  answerConsent(hatchId: string, answer: ConsentAnswer): void {
    void window.hatch.answerConsent(hatchId, answer);
  },

  // sidebar
  /** Choosing a panel also opens a closed sidebar. */
  showPanel(panel: SidebarPanel): void {
    set((st) => ({ panel, workspace: st.workspace.sidebarOpen ? st.workspace : { ...st.workspace, sidebarOpen: true } }));
  },
  /** Choosing a tab of the left column also opens the column. */
  showLeft(leftPanel: LeftPanel): void {
    set((st) => ({ leftPanel, workspace: st.workspace.leftOpen !== false ? st.workspace : { ...st.workspace, leftOpen: true } }));
    if (leftPanel === 'library') void window.hatch.refreshProjects();
  },
  setCommentFilter(commentFilter: 'open' | 'resolved'): void {
    set({ commentFilter });
  },
  /** Selects a thread's Hatch, brings it into view and opens the thread over its pin. */
  // notes
  /** The note button: the next click on the canvas places a note. Notes hide in Fit to view, so the button waits there. */
  togglePlacingNote(): void {
    if (fitHatch(activeTab(state))) return;
    set((s) => ({ placingNote: !s.placingNote }));
  },
  /** The user's click in note mode: a new note at that canvas point, open for typing. */
  placeNote(at: Point): string {
    const note: Note = { id: newId('note'), text: '', x: Math.round(at.x), y: Math.round(at.y), author: 'user', createdAt: new Date().toISOString() };
    editActiveTab((t) => ({ ...t, selectedHatchId: null, notes: [...(t.notes ?? []), note] }));
    set({ placingNote: false, selectedNote: note.id, editingNote: note.id });
    return note.id;
  },
  /** An agent's note. Without a place it sits to the right of the canvas's Hatches, below the agent notes already there. */
  addNote(tabId: string, text: string, author: string, at?: Point): string {
    const tab = state.workspace.tabs.find((t) => t.id === tabId);
    if (!tab) throw new Error('That canvas has closed.');
    const clean = text.trim().slice(0, MAX_NOTE_LENGTH);
    if (!clean) throw new Error('A note needs words.');
    const right = tab.hatches.length ? Math.max(...tab.hatches.map((h) => h.x + h.width)) + 48 : 40;
    const top = tab.hatches.length ? Math.min(...tab.hatches.map((h) => h.y)) : 40;
    const below = (tab.notes ?? []).filter((n) => n.author !== 'user' && n.x === right).length;
    const note: Note = { id: newId('note'), text: clean, x: Math.round(at?.x ?? right), y: Math.round(at?.y ?? top + below * 160), author, createdAt: new Date().toISOString() };
    editTab(tabId, (t) => ({ ...t, notes: [...(t.notes ?? []), note] }));
    return note.id;
  },
  /** Only the user changes a note's words. */
  editNote(noteId: string, text: string): void {
    editNotes(noteId, (n) => ({ ...n, text: text.slice(0, MAX_NOTE_LENGTH) }));
  },
  startEditingNote(noteId: string): void {
    set({ selectedNote: noteId, editingNote: noteId });
  },
  /** Ends typing. A note left empty goes away, as an unwritten note is no note. */
  finishNote(): void {
    const id = state.editingNote;
    if (!id) return;
    set({ editingNote: null });
    const note = findNote(id)?.note;
    if (note && !note.text.trim()) actions.deleteNote(id);
  },
  moveNote(noteId: string, x: number, y: number): void {
    editNotes(noteId, (n) => ({ ...n, x: Math.round(x), y: Math.round(y) }));
  },
  deleteNote(noteId: string): void {
    const found = findNote(noteId);
    if (!found) return;
    editTab(found.tabId, (t) => forgetItem({ ...t, notes: (t.notes ?? []).filter((n) => n.id !== noteId) }, noteId));
    set((s) => ({ selection: s.selection.filter((x) => x !== noteId) }));
    set((s) => ({ selectedNote: s.selectedNote === noteId ? null : s.selectedNote, editingNote: s.editingNote === noteId ? null : s.editingNote }));
  },
  selectNote(noteId: string | null): void {
    if (state.editingNote && state.editingNote !== noteId) actions.finishNote();
    if (noteId) editActiveTab((t) => (t.selectedHatchId ? { ...t, selectedHatchId: null } : t));
    set({ selectedNote: noteId, selection: noteId ? [noteId] : [], selectedGroup: null, promptOpen: false });
  },
  /** A note picked in the Comments tab: Fit to view lets go, and the canvas brings the note into sight. */
  showNote(noteId: string): void {
    const found = findNote(noteId);
    if (!found) return;
    actions.activateTab(found.tabId);
    editTab(found.tabId, (t) => ({ ...t, hatches: t.hatches.map(leaveFit) }));
    // A note keeps its size on screen, so its size in canvas pixels grows as the canvas zooms out.
    editTab(found.tabId, (t) => ({ ...t, pan: panToReveal({ x: found.note.x, y: found.note.y - 30 / t.zoom, width: NOTE_SIZE.width / t.zoom, height: (NOTE_SIZE.height + 30) / t.zoom }, t.pan, t.zoom, state.viewport) }));
    actions.selectNote(noteId);
  },
  setListKind(kind: 'comments' | 'notes', on: boolean): void {
    set((s) => ({ listKinds: { ...s.listKinds, [kind]: on } }));
  },

  showThread(hatchId: string, threadId: string): void {
    actions.reveal(hatchId);
    actions.openThread(hatchId, threadId);
  },

  /** Captures the window first, so the image holds what the user was looking at and leaves the form out. */
  async openFeedback(): Promise<void> {
    if (state.panel === 'feedback' && state.workspace.sidebarOpen) return;
    set({ feedbackShot: await window.hatch.captureForFeedback() });
    actions.showPanel('feedback');
  },
  startGuide(): void {
    set({ guideOpen: true });
  },
  endGuide(): void {
    set({ guideOpen: false });
    if (!state.settings.guideSeen) void actions.updateSettings({ guideSeen: true });
  },

  // projects
  showProject(name: string | null): void {
    set({ openProject: name });
    actions.showLeft('library');
    if (name) void window.hatch.projectLog(name).then((lines) => set((s) => ({ projectLogs: { ...s.projectLogs, [name]: lines } })));
  },
  /** Opens a project in a new Hatch. A stopped dev server starts first, and the page loads as soon as it answers. */
  async openProjectInHatch(name: string): Promise<string | null> {
    const project = state.projects.projects.find((p) => p.name === name);
    if (!project) return `No project is named ${name}.`;
    if (project.kind === 'server' && project.status !== 'running') {
      const started = await window.hatch.startProject(name);
      if (!started.ok) return started.error;
    }
    const opened = actions.openHatch(`hatch:${name}`);
    return 'error' in opened ? opened.error : null;
  },
  async addProject(): Promise<string | null> {
    const folder = await window.hatch.pickProject();
    if (!folder) return null;
    const added = await window.hatch.addProject(folder);
    if (!added.ok) return added.error;
    actions.showProject(added.value.name);
    return null;
  },
  async saveLink(name: string, url: string, folder = ''): Promise<void> {
    set({ links: await window.hatch.addLink({ name, url, ...(folder.trim() ? { folder: folder.trim() } : {}) }) });
  },
  async removeLink(id: string): Promise<void> {
    set({ links: await window.hatch.removeLink(id) });
  },
  /** Files a link under a folder. An empty name takes it out of its folder. */
  async moveLink(id: string, folder: string): Promise<void> {
    set({ links: await window.hatch.moveLink(id, folder) });
  },
  async renameLinkFolder(from: string, to: string): Promise<void> {
    set({ links: await window.hatch.renameLinkFolder(from, to) });
  },
  /** Adds a browser profile's favourites to Links. Returns the sentence the panel shows. */
  async importBookmarks(profileId: string): Promise<{ ok: boolean; text: string }> {
    const result = await window.hatch.importBookmarks(profileId);
    if (!result.ok) return { ok: false, text: result.error };
    const { browser, added, skipped, links } = result.value;
    set({ links });
    const already = skipped ? ` Links already held ${skipped} of them.` : '';
    if (!added) return { ok: true, text: `Hatch found no new links in ${browser}.${already}` };
    return { ok: true, text: `Hatch added ${added} ${added === 1 ? 'link' : 'links'} from ${browser} under the folder “${browser}”.${already}` };
  },

  // pinned canvases
  /**
   * Pins a canvas: Hatch keeps a copy that follows the canvas while it is open and stays in the Canvases list after it closes.
   * A second press unpins it and forgets the copy.
   */
  async togglePin(tabId: string): Promise<void> {
    const tab = state.workspace.tabs.find((t) => t.id === tabId);
    if (!tab) return;
    if (tab.savedId && state.savedCanvases.some((c) => c.id === tab.savedId)) return actions.unpinCanvas(tab.savedId);
    const copy = savedCanvasFromTab(tab, tabLabel(state, tab));
    editTab(tabId, (t) => ({ ...t, savedId: copy.id }));
    pinnedSent.set(copy.id, JSON.stringify({ ...copy, savedAt: '' }));
    set({ savedCanvases: await window.hatch.saveCanvas(copy) });
  },
  /** Opens a pinned canvas that has closed, with every Hatch where it was. A pinned canvas that is open already comes to the front. */
  openSavedCanvas(id: string): void {
    // The canvas leaves Recently closed, because it is open again.
    set((s) => ({ closed: s.closed.filter((c) => c.kind !== 'canvas' || c.tab.savedId !== id) }));
    const open = state.workspace.tabs.find((t) => t.savedId === id);
    if (open) return actions.activateTab(open.id);
    const saved = state.savedCanvases.find((c) => c.id === id);
    if (!saved) return;
    const tab = tabFromSavedCanvas(saved);
    set((s) => ({ workspace: { ...s.workspace, tabs: oneCanvasPerFolder([...s.workspace.tabs, tab]), activeTabId: tab.id }, panel: 'hatch' }));
  },
  /** Unpins a canvas, open or closed. An open canvas stays open, and only the copy goes. */
  async unpinCanvas(id: string): Promise<void> {
    set((s) => ({ workspace: { ...s.workspace, tabs: s.workspace.tabs.map(({ savedId, ...t }) => (savedId === id ? t : { ...t, ...(savedId ? { savedId } : {}) })) } }));
    pinnedSent.delete(id);
    set({ savedCanvases: await window.hatch.removeSavedCanvas(id) });
  },
  setNewHatchPage: (page: string): Promise<void> => actions.updateSettings({ newHatchPage: page }),
  /**
   * An action button returns to the Hatch it opened on this canvas, in Fit to view, so the app keeps its place.
   * With none there, it opens the app in a new Hatch in Fit to view.
   */
  launchAction(buttonId: string): void {
    const button = state.settings.actionButtons.find((b) => b.id === buttonId);
    if (!button) return;
    const open = activeTab(state).hatches.find((h) => h.action === button.id);
    if (open) return actions.applyTemplate(open.id, 'fit');
    const opened = actions.openHatch(button.url);
    if ('error' in opened) return actions.toast(opened.error);
    editHatch(opened.hatchId, (h) => ({ ...h, action: button.id, title: h.title || button.name }));
    actions.applyTemplate(opened.hatchId, 'fit');
  },
  openActionEditor(id: string | null): void {
    set({ actionEditor: { id } });
  },
  closeActionEditor(): void {
    set({ actionEditor: null });
  },
  /** Adds or changes a button. Resolves to an error message when the address does not parse, and to null once saved. */
  async saveActionButton(input: Omit<ActionButton, 'id'> & { id: string | null }): Promise<string | null> {
    const name = input.name.trim();
    if (!name) return 'Give the button a name.';
    const typed = input.url.trim();
    const parsed = parseAddressOrName(typed);
    if (!parsed.ok) return parsed.error;
    const url = parsed.kind === 'url' ? parsed.url : typed;
    const buttons = state.settings.actionButtons;
    const next = input.id && buttons.some((b) => b.id === input.id)
      ? buttons.map((b) => (b.id === input.id ? { id: b.id, name, url, icon: input.icon } : b))
      : [...buttons, { id: newId('action'), name, url, icon: input.icon }];
    await actions.updateSettings({ actionButtons: next });
    set({ actionEditor: null });
    return null;
  },
  async removeActionButton(id: string): Promise<void> {
    await actions.updateSettings({ actionButtons: state.settings.actionButtons.filter((b) => b.id !== id) });
    set({ actionEditor: null });
  },
};

/**
 * Turns what a person types into a link a Hatch loads. A hatch: address resolves through the registered projects.
 * With `byName`, text that is no link, such as a site's name, opens the first search result.
 */
export function resolveAddress(input: string, byName = false): { url: string } | { error: string } {
  const parsed = byName ? parseAddressOrName(input) : parseAddress(input);
  if (!parsed.ok) return { error: parsed.error };
  if (parsed.kind === 'url') return { url: parsed.url };
  const project = state.projects.projects.find((p) => p.name === parsed.project);
  if (!project) return { error: `No project is named ${parsed.project}. Projects in the Library lists the registered ones.` };
  return { url: projectUrl(project, state.projects.proxyPort ?? PROXY_PORT, parsed.path) };
}

/** A project page shows as hatch:name/path, the form people use for it. */
export const displayAddress = (s: State, url: string): string => hatchAddress(url, s.projects.projects, s.projects.proxyPort) ?? url;

function applyComments(hatchId: string, result: Outcome<PageComments>): boolean {
  if (result.ok) set((s) => ({ comments: { ...s.comments, [hatchId]: result.value }, commentError: null }));
  else set({ commentError: result.error });
  return result.ok;
}
