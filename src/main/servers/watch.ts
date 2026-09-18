// A static folder or file has no dev server to push changes, so Hatch watches it and reloads the Hatches that show it.
import { watch, type FSWatcher } from 'node:fs';
import { dirname } from 'node:path';
import { projectHost } from '@shared/project-address';
import { allPages } from '../hatches/registry';
import { listProjects } from './manager';

const watchers = new Map<string, FSWatcher>();

export async function syncWatchers(): Promise<void> {
  const wanted = new Map((await listProjects()).filter((p) => p.kind !== 'server').map((p) => [p.name, p.kind === 'file' ? dirname(p.folder) : p.folder]));
  for (const [name, watcher] of watchers) {
    if (wanted.has(name)) continue;
    watcher.close();
    watchers.delete(name);
  }
  for (const [name, folder] of wanted) {
    if (watchers.has(name)) continue;
    let timer: NodeJS.Timeout | null = null;
    try {
      const watcher = watch(folder, { recursive: true }, (_event, file) => {
        if (file && String(file).split('/').some((part) => part.startsWith('.') || part === 'node_modules')) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          for (const page of allPages()) {
            const url = page.guest.isDestroyed() ? '' : page.guest.getURL();
            if (URL.canParse(url) && new URL(url).hostname === projectHost(name)) page.guest.reload();
          }
        }, 150);
      });
      watchers.set(name, watcher);
    } catch {
      // A folder that has gone leaves the project listed and unwatched.
    }
  }
}

export function closeWatchers(): void {
  watchers.forEach((w) => w.close());
  watchers.clear();
}
