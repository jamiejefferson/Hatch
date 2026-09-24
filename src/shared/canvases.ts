// Saved canvases: a snapshot of a tab the user can open again later. Pure functions, so the main process, the renderer and the tests share them.
import { clampZoom } from './geometry';
import { templateForSize } from './templates';
import type { Hatch, SavedCanvas, Tab } from './types';
import { newId, repairHatch } from './workspace';

export const MAX_CANVAS_NAME = 60;

const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** A Hatch in Fit to view is saved at the size it had on the canvas, so the saved canvas opens as a canvas. */
const onCanvas = (h: Hatch): Hatch => (h.template === 'fit' ? { ...h, template: templateForSize(h.width, h.height) } : h);

/** What canvases.json holds, with anything broken left out. */
export function repairSavedCanvases(raw: unknown): SavedCanvas[] {
  if (!Array.isArray(raw)) return [];
  const out: SavedCanvas[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const source = item as Record<string, unknown>;
    if (typeof source.id !== 'string' || typeof source.name !== 'string' || !source.name.trim()) continue;
    const hatches = (Array.isArray(source.hatches) ? source.hatches : []).map(repairHatch).filter((h): h is Hatch => h !== null).map(onCanvas);
    const pan = (source.pan ?? {}) as Record<string, unknown>;
    out.push({ id: source.id, name: source.name.trim().slice(0, MAX_CANVAS_NAME), savedAt: typeof source.savedAt === 'string' ? source.savedAt : '', hatches, pan: { x: num(pan.x, 40), y: num(pan.y, 68) }, zoom: clampZoom(num(source.zoom, 0.62)) });
  }
  return out;
}

/** Takes a snapshot of a tab under a name. */
export function savedCanvasFromTab(tab: Tab, name: string, now = new Date()): SavedCanvas {
  return { id: newId('canvas'), name: name.trim().slice(0, MAX_CANVAS_NAME), savedAt: now.toISOString(), hatches: tab.hatches.map(onCanvas), pan: { ...tab.pan }, zoom: tab.zoom };
}

/** Builds a new tab from a saved canvas. Every Hatch takes a fresh id, so two openings of one saved canvas never share pages. */
export function tabFromSavedCanvas(saved: SavedCanvas): Tab {
  return { id: newId('tab'), name: saved.name, hatches: saved.hatches.map((h) => ({ ...onCanvas(h), id: newId('hatch') })), selectedHatchId: null, pan: { ...saved.pan }, zoom: clampZoom(saved.zoom) };
}

/** Adds a saved canvas to the list. A saved canvas with the same name is replaced, so saving twice keeps one. */
export function putSavedCanvas(list: SavedCanvas[], saved: SavedCanvas): SavedCanvas[] {
  const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();
  const index = list.findIndex((c) => same(c.name, saved.name));
  if (index < 0) return [...list, saved];
  return list.map((c, i) => (i === index ? { ...saved, id: c.id } : c));
}

// ---- links in folders ----

export const MAX_FOLDER_NAME = 60;

/** Trims a folder name to what Hatch stores. An empty result means no folder. */
export const cleanFolderName = (raw: unknown): string => (typeof raw === 'string' ? raw.trim().slice(0, MAX_FOLDER_NAME) : '');

/** Groups links by folder, in the order the folders first appear. Links in no folder come first under an empty name. */
export function groupLinks<T extends { folder?: string }>(links: T[]): { folder: string; links: T[] }[] {
  const groups = new Map<string, T[]>();
  groups.set('', []);
  for (const link of links) {
    const folder = link.folder ?? '';
    if (!groups.has(folder)) groups.set(folder, []);
    groups.get(folder)!.push(link);
  }
  return [...groups.entries()].filter(([, list]) => list.length > 0).map(([folder, list]) => ({ folder, links: list }));
}
