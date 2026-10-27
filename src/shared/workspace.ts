// Builds, repairs and edits the workspace. Pure functions, so the main process and the renderer share them.
import { cleanPath, oneCanvasPerFolder } from './project-canvas';
import { clampZoom } from './geometry';
import { clampSize, templateForSize } from './templates';
import type { CanvasContext, Group, Hatch, Note, Tab, TemplateId, Workspace } from './types';

export const newId = (prefix: string): string => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

export const HEADER_OFFSET = 36; // Hatch header height plus its gap, in screen pixels.

export function emptyTab(): Tab {
  return { id: newId('tab'), hatches: [], selectedHatchId: null, pan: { x: 40, y: 32 + HEADER_OFFSET }, zoom: 0.62 };
}

export function emptyWorkspace(): Workspace {
  const tab = emptyTab();
  return { version: 1, tabs: [tab], activeTabId: tab.id, sidebarOpen: true, leftOpen: true };
}

const TEMPLATE_IDS: TemplateId[] = ['fit', 'desktop', 'laptop', 'tablet', 'tablet-landscape', 'mobile', 'custom'];
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const str = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback);

/** Accepts whatever sits in workspace.json and returns a workspace Hatch can run. */
export function repairWorkspace(raw: unknown): Workspace {
  if (!raw || typeof raw !== 'object') return emptyWorkspace();
  const source = raw as Record<string, unknown>;
  const tabs = oneCanvasPerFolder((Array.isArray(source.tabs) ? source.tabs : []).map(repairTab).filter((t): t is Tab => t !== null));
  if (tabs.length === 0) return emptyWorkspace();
  const activeTabId = tabs.some((t) => t.id === source.activeTabId) ? (source.activeTabId as string) : tabs[0]!.id;
  return { version: 1, tabs, activeTabId, sidebarOpen: source.sidebarOpen !== false, leftOpen: source.leftOpen !== false };
}

function repairTab(raw: unknown): Tab | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  const hatches = (Array.isArray(source.hatches) ? source.hatches : []).map(repairHatch).filter((h): h is Hatch => h !== null);
  const pan = (source.pan ?? {}) as Record<string, unknown>;
  const selected = hatches.some((h) => h.id === source.selectedHatchId) ? (source.selectedHatchId as string) : null;
  // One Hatch at most may fill the window.
  let fitSeen = false;
  for (const h of hatches) {
    if (h.template !== 'fit') continue;
    if (fitSeen || h.id !== selected) h.template = templateForSize(h.width, h.height);
    else fitSeen = true;
  }
  const name = str(source.name, '').trim().slice(0, 60);
  const notes = repairNotes(source.notes, new Set(hatches.map((h) => h.id)));
  const groups = repairGroups(source.groups, new Set([...hatches.map((h) => h.id), ...notes.filter((n) => !n.attachedTo).map((n) => n.id)]));
  const contexts = repairContexts(source.contexts);
  return { id: str(source.id, newId('tab')), ...(name ? { name } : {}), hatches, selectedHatchId: selected, pan: { x: num(pan.x, 40), y: num(pan.y, 68) }, zoom: clampZoom(num(source.zoom, 0.62)), ...(notes.length ? { notes } : {}), ...(groups.length ? { groups } : {}), ...(contexts.length ? { contexts } : {}), ...(typeof source.savedId === 'string' ? { savedId: source.savedId } : {}), ...(typeof source.folder === 'string' && source.folder.startsWith('/') ? { folder: cleanPath(source.folder) } : {}) };
}

export const MAX_NOTE_LENGTH = 2000;

/** Keeps the notes that hold words. A note left empty is a note the user gave up on. An attachment to a Hatch that has gone lets go. */
export function repairNotes(raw: unknown, hatchIds?: Set<string>): Note[] {
  if (!Array.isArray(raw)) return [];
  const out: Note[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const source = item as Record<string, unknown>;
    const text = str(source.text, '').slice(0, MAX_NOTE_LENGTH);
    if (!text.trim()) continue;
    const attachedTo = typeof source.attachedTo === 'string' && (!hatchIds || hatchIds.has(source.attachedTo)) ? source.attachedTo : null;
    out.push({ id: str(source.id, newId('note')), text, x: num(source.x, 0), y: num(source.y, 0), author: str(source.author, 'user') || 'user', createdAt: str(source.createdAt, ''), ...(attachedTo ? { attachedTo } : {}) });
  }
  return out;
}

export const MAX_GROUP_NAME = 60;
/** A canvas keeps this many context links. The oldest go first. */
export const MAX_CONTEXTS = 50;

/** Keeps groups whose members still exist, each member in one group alone. A group needs two members. */
export function repairGroups(raw: unknown, itemIds: Set<string>): Group[] {
  if (!Array.isArray(raw)) return [];
  const taken = new Set<string>();
  const out: Group[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const source = item as Record<string, unknown>;
    const members = (Array.isArray(source.members) ? source.members : []).filter((m): m is string => typeof m === 'string' && itemIds.has(m) && !taken.has(m));
    if (members.length < 2) continue;
    members.forEach((m) => taken.add(m));
    const name = str(source.name, '').trim().slice(0, MAX_GROUP_NAME) || 'Group';
    out.push({ id: str(source.id, newId('group')), name, members, ...(source.locked === true ? { locked: true } : {}) });
  }
  return out;
}

export function repairContexts(raw: unknown): CanvasContext[] {
  if (!Array.isArray(raw)) return [];
  const out: CanvasContext[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const source = item as Record<string, unknown>;
    const members = (Array.isArray(source.members) ? source.members : []).filter((m): m is string => typeof m === 'string');
    if (typeof source.id !== 'string' || members.length === 0) continue;
    const prompt = str(source.prompt, '').slice(0, MAX_NOTE_LENGTH);
    out.push({ id: source.id, members, createdAt: str(source.createdAt, ''), ...(prompt.trim() ? { prompt } : {}) });
  }
  return out.slice(-MAX_CONTEXTS);
}

export function repairHatch(raw: unknown): Hatch | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  if (typeof source.url !== 'string' || !source.url) return null;
  const template = TEMPLATE_IDS.includes(source.template as TemplateId) ? (source.template as TemplateId) : 'custom';
  return {
    id: str(source.id, newId('hatch')),
    url: source.url,
    title: str(source.title, ''),
    x: num(source.x, 0),
    y: num(source.y, 0),
    width: clampSize(num(source.width, 960)),
    height: clampSize(num(source.height, 752)),
    template,
    view: source.view === 'agent' ? 'agent' : 'page',
    ...(source.muted === true ? { muted: true } : null),
    ...(typeof source.action === 'string' && source.action ? { action: source.action } : null),
  };
}
