// A fresh install opens the guide to Hatch in Fit to view, with the sidebar closed, and saves two links.
// It runs before the interface asks for anything, so it writes the files directly.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { DEFAULT_SETTINGS } from '@shared/types';
import { WELCOME_URL, welcomeLinks, welcomeWorkspace } from '@shared/welcome';
import { dataFile, hatchHome } from './paths';

/** HATCH_WELCOME=0 keeps a fresh start empty, which the tests rely on. HATCH_WELCOME_URL points them at a stand-in page. */
export function seedFirstRun(): void {
  if (process.env.HATCH_WELCOME === '0') return;
  // workspace.json exists from the first moment Hatch has run, so a Hatch the user already knows stays as they left it.
  if (existsSync(dataFile('workspace.json'))) return;
  const url = process.env.HATCH_WELCOME_URL || WELCOME_URL;
  const write = (name: string, value: unknown): void => {
    if (!existsSync(dataFile(name))) writeFileSync(dataFile(name), JSON.stringify(value, null, 2));
  };
  try {
    mkdirSync(hatchHome(), { recursive: true });
    write('links.json', welcomeLinks(url));
    // The guide page stands in for the coach marks on a first open. Help > Show the Guide still runs them.
    write('settings.json', { ...DEFAULT_SETTINGS, newHatchPage: url, guideSeen: true });
    write('workspace.json', welcomeWorkspace(url));
  } catch (error) {
    console.error('[first-run] Hatch could not write its starting files:', error);
  }
}
