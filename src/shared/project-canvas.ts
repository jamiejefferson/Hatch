// A canvas may belong to a project, so an agent working in that project's folder works on the project's canvas and leaves the
// user's other canvases alone (the user, 5 Oct 2026). One canvas belongs to a project at most.
import type { Project, Tab } from './types';

/** The folder that holds a project's files. A single-file project lives in the folder around its file. */
export const projectRoot = (project: Pick<Project, 'folder' | 'kind'>): string => (project.kind === 'file' ? project.folder.replace(/\/[^/]*$/, '') : project.folder);

/**
 * The registered project a folder belongs to: the project whose folder is the folder itself or holds it, the deepest one when
 * projects nest. The home folder belongs to no project, because an agent app started there has no project at all.
 */
export function projectForFolder<P extends Pick<Project, 'name' | 'folder' | 'kind'>>(folder: string, projects: P[], home = ''): P | null {
  const clean = folder.replace(/\/+$/, '');
  if (!clean || clean === home.replace(/\/+$/, '')) return null;
  let best: P | null = null;
  for (const p of projects) {
    const root = projectRoot(p).replace(/\/+$/, '');
    if (!root || (clean !== root && !clean.startsWith(`${root}/`))) continue;
    if (!best || root.length > projectRoot(best).length) best = p;
  }
  return best;
}

/** Keeps one canvas per project: the first tab that names a project keeps it, and a later tab that names the same one lets go. */
export function oneCanvasPerProject(tabs: Tab[], keep?: string): Tab[] {
  const holder = new Map<string, string>();
  if (keep) {
    const kept = tabs.find((t) => t.id === keep);
    if (kept?.project) holder.set(kept.project, kept.id);
  }
  for (const t of tabs) if (t.project && !holder.has(t.project)) holder.set(t.project, t.id);
  return tabs.map((t) => {
    if (!t.project || holder.get(t.project) === t.id) return t;
    const { project: _gone, ...rest } = t;
    return rest;
  });
}

/** The note Hatch writes to <project>/.hatch/canvas.json, which tells an agent in the folder which canvas is its own. */
export function canvasNote(tab: { id: string; label: string }, project: string): string {
  return `${JSON.stringify(
    {
      canvas: tab.id,
      name: tab.label,
      project,
      forAgents: `Hatch, the browser on this Mac, shows this project's pages on the canvas ${tab.id}. Work there and leave the user's other canvases alone. An agent whose Hatch command starts in this folder lands there by itself. Otherwise call use_project with this folder, or pass "${tab.id}" as the canvas argument. When unsure, call use_project: it opens a fresh canvas for the project if this one has closed.`,
    },
    null,
    2,
  )}\n`;
}
