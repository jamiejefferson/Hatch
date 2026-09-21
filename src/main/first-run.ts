// A fresh install opens the guide to Hatch in Fit to view, with the sidebar closed, and saves two links.
// An update opens the guide's "what changed" panel the same way, once, in a tab of its own.
// Both run before the interface asks for anything, so they write the files directly.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { DEFAULT_SETTINGS } from '@shared/types';
import { WELCOME_URL, welcomeLinks, welcomeWorkspace, withUpdateTab } from '@shared/welcome';
import { repairWorkspace } from '@shared/workspace';
import { dataFile, hatchHome } from './paths';

/** version.json holds the version whose changes the user has been shown. */
function seenVersion(): string {
  try {
    const seen = (JSON.parse(readFileSync(dataFile('version.json'), 'utf8')) as { seen?: unknown }).seen;
    return typeof seen === 'string' ? seen : '';
  } catch {
    return '';
  }
}

/** HATCH_WELCOME=0 keeps a fresh start empty and an update quiet, which the tests rely on. HATCH_WELCOME_URL points them at a stand-in page. */
export function seedFirstRun(version: string): void {
  if (process.env.HATCH_WELCOME === '0') return;
  const url = process.env.HATCH_WELCOME_URL || WELCOME_URL;
  const write = (name: string, value: unknown): void => {
    if (!existsSync(dataFile(name))) writeFileSync(dataFile(name), JSON.stringify(value, null, 2));
  };
  try {
    // workspace.json exists from the first moment Hatch has run, so a Hatch the user already knows keeps its tabs.
    if (existsSync(dataFile('workspace.json'))) return showUpdate(version, url);
    mkdirSync(hatchHome(), { recursive: true });
    write('links.json', welcomeLinks(url));
    // The guide page stands in for the coach marks on a first open. Help > Show the Guide still runs them.
    write('settings.json', { ...DEFAULT_SETTINGS, newHatchPage: url, guideSeen: true, jevRunSeen: true });
    write('workspace.json', welcomeWorkspace(url));
    // A fresh install has nothing to catch up on.
    write('version.json', { seen: version });
  } catch (error) {
    console.error('[first-run] Hatch could not write its starting files:', error);
  }
}

/** The first start of a new version adds one tab that holds the guide. A workspace Hatch fails to read is left alone. */
function showUpdate(version: string, url: string): void {
  if (seenVersion() === version) return;
  const workspace = repairWorkspace(JSON.parse(readFileSync(dataFile('workspace.json'), 'utf8')));
  writeFileSync(dataFile('workspace.json'), JSON.stringify(withUpdateTab(workspace, url), null, 2));
  writeFileSync(dataFile('version.json'), JSON.stringify({ seen: version }, null, 2));
}
