// Brings the user's favourites from Chrome, Arc, Brave or Edge into Links. The Bookmarks file is plain JSON,
// so no Keychain question comes up. Only web addresses come across, each under a folder named after the browser.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { addImported, linksFromBookmarks } from '@shared/bookmarks';
import type { BrowserProfile } from '@shared/cookie-import';
import type { SavedLink } from '@shared/types';
import { newId } from '@shared/workspace';
import { HatchError } from '../cdp/session';
import { BROWSERS, exists, profilesWith, root, type Browser } from '../credentials/import-cookies';
import { linksStore } from '../store/stores';

const bookmarksFile = async (browser: Browser, profile: string): Promise<string | null> => {
  const path = join(root(), browser.folder, profile, 'Bookmarks');
  return (await exists(path)) ? path : null;
};

/** Every browser profile on this Mac that holds a Bookmarks file. */
export const listBookmarkProfiles = (): Promise<BrowserProfile[]> => profilesWith(bookmarksFile);

export interface BookmarkImport {
  browser: string;
  added: number;
  skipped: number;
  links: SavedLink[];
}

export async function importBookmarks(profileId: string): Promise<BookmarkImport> {
  const [browserId, profile] = profileId.split(':');
  const browser = BROWSERS.find((b) => b.id === browserId);
  const path = browser && profile && /^(Default|Profile \d+)$/.test(profile) ? await bookmarksFile(browser, profile) : null;
  if (!browser || !path) throw new HatchError('Hatch found no favourites for that browser profile.');
  const file = await readFile(path, 'utf8').then(JSON.parse, () => null);
  if (!file) throw new HatchError(`Hatch could not read ${browser.name}'s favourites file.`);
  const incoming = linksFromBookmarks(file, browser.name);
  let added = 0;
  let skipped = 0;
  const links = await linksStore.update((current) => {
    const result = addImported(current, incoming, (l): SavedLink => ({ id: newId('link'), name: l.name, url: l.url, ...(l.folder ? { folder: l.folder } : {}) }));
    added = result.added;
    skipped = result.skipped;
    return result.links;
  });
  return { browser: browser.name, added, skipped, links };
}
