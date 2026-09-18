// Builds, repairs and edits the workspace. Pure functions, so the main process and the renderer share them.
import { clampZoom } from './geometry';
import { clampSize, templateForSize } from './templates';
import type { Hatch, Tab, TemplateId, Workspace } from './types';

export const newId = (prefix: string): string => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

export const HEADER_OFFSET = 36; // Hatch header height plus its gap, in screen pixels.

export function emptyTab(): Tab {
  return { id: newId('tab'), hatches: [], selectedHatchId: null, pan: { x: 40, y: 32 + HEADER_OFFSET }, zoom: 0.62 };
}

export function emptyWorkspace(): Workspace {
  const tab = emptyTab();
  return { version: 1, tabs: [tab], activeTabId: tab.id, sidebarOpen: true };
}

const TEMPLATE_IDS: TemplateId[] = ['fit', 'desktop', 'laptop', 'tablet', 'tablet-landscape', 'mobile', 'custom'];
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const str = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback);

/** Accepts whatever sits in workspace.json and returns a workspace Hatch can run. */
export function repairWorkspace(raw: unknown): Workspace {
  if (!raw || typeof raw !== 'object') return emptyWorkspace();
  const source = raw as Record<string, unknown>;
  const tabs = (Array.isArray(source.tabs) ? source.tabs : []).map(repairTab).filter((t): t is Tab => t !== null);
  if (tabs.length === 0) return emptyWorkspace();
  const activeTabId = tabs.some((t) => t.id === source.activeTabId) ? (source.activeTabId as string) : tabs[0]!.id;
  return { version: 1, tabs, activeTabId, sidebarOpen: source.sidebarOpen !== false };
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
  return { id: str(source.id, newId('tab')), ...(name ? { name } : {}), hatches, selectedHatchId: selected, pan: { x: num(pan.x, 40), y: num(pan.y, 68) }, zoom: clampZoom(num(source.zoom, 0.62)) };
}

function repairHatch(raw: unknown): Hatch | null {
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
  };
}
