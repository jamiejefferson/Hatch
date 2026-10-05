// Writes <project>/.hatch/canvas.json for each project that has a canvas, and removes it when the canvas lets go,
// so an agent that looks in its folder finds which canvas is its own (the user, 5 Oct 2026).
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { canvasNote, projectRoot } from '@shared/project-canvas';
import type { Workspace } from '@shared/types';
import { projectsState } from './servers/manager';

/** What Hatch last wrote for each project, so a workspace save that changed nothing writes nothing. */
const written = new Map<string, string>();

export async function syncProjectCanvases(workspace: Workspace): Promise<void> {
  const { projects } = await projectsState(false);
  for (const project of projects) {
    const dir = join(projectRoot(project), '.hatch');
    const file = join(dir, 'canvas.json');
    const tab = workspace.tabs.find((t) => t.project === project.name);
    const text = tab ? canvasNote({ id: tab.id, label: tab.name || project.name }, project.name) : '';
    if (written.get(project.name) === text) continue;
    try {
      if (text) {
        await mkdir(dir, { recursive: true });
        // The note describes this Mac's Hatch, so it stays out of the project's history unless the project says otherwise.
        if (!existsSync(join(dir, '.gitignore'))) await writeFile(join(dir, '.gitignore'), 'canvas.json\n');
        await writeFile(file, text);
      } else if (existsSync(file)) {
        // Only a note Hatch wrote goes, recognised by its fields.
        const old = JSON.parse(await readFile(file, 'utf8')) as { canvas?: unknown; forAgents?: unknown };
        if (typeof old.canvas === 'string' && typeof old.forAgents === 'string') await rm(file);
      }
      written.set(project.name, text);
    } catch (error) {
      console.error(`[projects] Hatch could not update ${file}:`, error);
    }
  }
}
