// The two folders the user may choose: one for saved links and one for the comments on sites outside any project.
// Both default to Hatch's own data folder. Settings holds the choice, and this module answers synchronously for the stores.
import { readFileSync, statSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { dataFile, hatchHome } from '../paths';

let chosen: { links: string; comments: string } | null = null;

const usable = (folder: unknown): string => {
  if (typeof folder !== 'string' || !isAbsolute(folder)) return '';
  try {
    return statSync(folder).isDirectory() ? folder : '';
  } catch {
    return '';
  }
};

/** Keeps a folder only when it is an absolute path to a folder that exists. Anything else means the default. */
export const cleanFolder = usable;

function current(): { links: string; comments: string } {
  if (chosen) return chosen;
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(readFileSync(dataFile('settings.json'), 'utf8')) as Record<string, unknown>;
  } catch {
    // No settings file yet means the defaults.
  }
  chosen = { links: usable(raw.linksFolder), comments: usable(raw.commentsFolder) };
  return chosen;
}

export function setFolders(settings: { linksFolder: string; commentsFolder: string }): void {
  chosen = { links: usable(settings.linksFolder), comments: usable(settings.commentsFolder) };
}

export const linksFile = (): string => join(current().links || hatchHome(), 'links.json');
/** Each site gets a folder of its own inside this one. */
export const sitesFolder = (): string => current().comments || join(hatchHome(), 'sites');
