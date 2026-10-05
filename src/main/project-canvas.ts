// Writes <folder>/.hatch/canvas.json for each working folder that has a canvas, and removes it when the canvas lets go,
// so an agent that looks in its folder finds which canvas is its own (the user, 5 Oct 2026). Keeps the folders agents
// worked in, so the question a new canvas asks offers them.
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { canvasNote, cleanPath, folderName, projectRoot } from '@shared/project-canvas';
import type { Workspace } from '@shared/types';
import { dataFile } from './paths';
import { projectsState } from './servers/manager';
import { JsonStore } from './store/json-store';

/** What Hatch last wrote in each folder, so a workspace save that changed nothing writes nothing, and a folder let go loses its note. */
const written = new Map<string, string>();

export async function syncFolderCanvases(workspace: Workspace): Promise<void> {
  const wanted = new Map<string, string>();
  for (const t of workspace.tabs) if (t.folder) wanted.set(t.folder, canvasNote({ id: t.id, label: t.name || folderName(t.folder) }, t.folder));
  for (const folder of new Set([...wanted.keys(), ...written.keys()])) {
    const text = wanted.get(folder) ?? '';
    if (written.get(folder) === text) continue;
    const dir = join(folder, '.hatch');
    const file = join(dir, 'canvas.json');
    try {
      if (text) {
        await mkdir(dir, { recursive: true });
        // The note describes this Mac's Hatch, so it stays out of the project's history unless the project says otherwise.
        if (!existsSync(join(dir, '.gitignore'))) await writeFile(join(dir, '.gitignore'), 'canvas.json\n');
        await writeFile(file, text);
        written.set(folder, text);
      } else {
        if (existsSync(file)) {
          // Only a note Hatch wrote goes, recognised by its fields.
          const old = JSON.parse(await readFile(file, 'utf8')) as { canvas?: unknown; forAgents?: unknown };
          if (typeof old.canvas === 'string' && typeof old.forAgents === 'string') await rm(file);
        }
        written.delete(folder);
      }
    } catch (error) {
      console.error(`[folders] Hatch could not update ${file}:`, error);
    }
  }
}

const MAX_RECENT = 12;
const recentStore = new JsonStore<string[]>(dataFile('work-folders.json'), (raw) =>
  Array.isArray(raw) ? raw.filter((f): f is string => typeof f === 'string' && f.startsWith('/')).slice(0, MAX_RECENT) : [],
);
let lastNoted = '';

/** Remembers a folder an agent worked in, newest first. The home folder is no project, so it stays out. */
export async function noteWorkFolder(folder: string): Promise<void> {
  const clean = cleanPath(folder);
  if (!clean.startsWith('/') || clean === homedir() || clean === lastNoted) return;
  lastNoted = clean;
  const list = await recentStore.read();
  await recentStore.write([clean, ...list.filter((f) => f !== clean)].slice(0, MAX_RECENT));
}

/** Folders to offer when a canvas asks where its work takes place: those agents worked in lately, then registered projects' folders. */
export async function workFolders(): Promise<string[]> {
  const recent = await recentStore.read();
  const { projects } = await projectsState(false);
  const all = [...recent, ...projects.map((p) => cleanPath(projectRoot(p)))];
  return [...new Set(all)].filter((f) => existsSync(f));
}
