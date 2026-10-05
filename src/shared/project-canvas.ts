// A canvas may belong to a working folder, the folder where the work on a project takes place, so an agent working in that
// folder works on its canvas and leaves the user's other canvases alone (the user, 5 Oct 2026). The folder need not be a
// registered project with a dev server: any folder counts. One canvas belongs to a folder at most.
import type { Project, Tab } from './types';

/** The folder that holds a registered project's files. A single-file project lives in the folder around its file. */
export const projectRoot = (project: Pick<Project, 'folder' | 'kind'>): string => (project.kind === 'file' ? project.folder.replace(/\/[^/]*$/, '') : project.folder);

/** A folder path without its trailing slash. */
export const cleanPath = (folder: string): string => folder.replace(/\/+$/, '');

/** The folder's own name, for labels. */
export const folderName = (folder: string): string => cleanPath(folder).split('/').pop() || folder;

/** True when `inner` is `outer` or sits inside it. */
export const holds = (outer: string, inner: string): boolean => {
  const a = cleanPath(outer);
  const b = cleanPath(inner);
  return !!a && (b === a || b.startsWith(`${a}/`));
};

/**
 * The canvas whose working folder holds an agent's folder: the folder itself or one above it, the deepest when folders nest.
 * The home folder matches nothing, because an agent app started there works on no project.
 */
export function canvasForFolderIn<T extends { id: string; folder?: string }>(folder: string, tabs: T[], home = ''): T | null {
  const clean = cleanPath(folder);
  if (!clean || clean === cleanPath(home)) return null;
  let best: T | null = null;
  for (const t of tabs) {
    if (!t.folder || !holds(t.folder, clean)) continue;
    if (!best || cleanPath(t.folder).length > cleanPath(best.folder!).length) best = t;
  }
  return best;
}

/** Keeps one canvas per folder: the first tab that names a folder keeps it, and a later tab that names the same one lets go. */
export function oneCanvasPerFolder(tabs: Tab[], keep?: string): Tab[] {
  const holder = new Map<string, string>();
  if (keep) {
    const kept = tabs.find((t) => t.id === keep);
    if (kept?.folder) holder.set(kept.folder, kept.id);
  }
  for (const t of tabs) if (t.folder && !holder.has(t.folder)) holder.set(t.folder, t.id);
  return tabs.map((t) => {
    if (!t.folder || holder.get(t.folder) === t.id) return t;
    const { folder: _gone, ...rest } = t;
    return rest;
  });
}

/** The note Hatch writes to <folder>/.hatch/canvas.json, which tells an agent in the folder which canvas is its own. */
export function canvasNote(tab: { id: string; label: string }, folder: string): string {
  return `${JSON.stringify(
    {
      canvas: tab.id,
      name: tab.label,
      folder,
      forAgents: `Hatch, the browser on this Mac, shows the pages for the work in this folder on the canvas ${tab.id}. Work there and leave the user's other canvases alone. An agent whose Hatch command starts in this folder, or in a folder inside it, lands there by itself. Otherwise call use_project with this folder, or pass "${tab.id}" as the canvas argument. When unsure, call use_project: it opens a fresh canvas for the folder if this one has closed.`,
    },
    null,
    2,
  )}\n`;
}
