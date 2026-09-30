// Pure parts of "bring favourites from another browser". Chrome, Arc, Brave and Edge write one JSON file per profile,
// named Bookmarks, with three roots: the bar, other favourites and mobile favourites. Each folder may hold folders.
import { cleanFolderName } from './canvases';

export interface BookmarkLink {
  name: string;
  url: string;
  folder: string;
}

interface Node {
  type?: string;
  name?: string;
  url?: string;
  children?: Node[];
}

/**
 * Every web address in a Bookmarks file, in the browser's order. Everything lands under one folder named after the
 * browser, so an import never mixes with the user's own links and removes as one group. Links has one level of
 * folders, so a nested folder becomes a path such as "Chrome / Design / Type". The bar's own links sit in "Chrome",
 * and the other two roots keep their names below it.
 */
export function linksFromBookmarks(file: unknown, browser: string): BookmarkLink[] {
  const roots = (file as { roots?: Record<string, Node> } | null)?.roots;
  if (!roots || typeof roots !== 'object') return [];
  const found: BookmarkLink[] = [];
  const walk = (node: Node, path: string[]): void => {
    if (node.type === 'url') {
      if (typeof node.url !== 'string' || !/^https?:\/\//i.test(node.url)) return;
      found.push({ name: (node.name ?? '').trim() || node.url, url: node.url, folder: cleanFolderName(path.join(' / ')) });
      return;
    }
    for (const child of Array.isArray(node.children) ? node.children : []) walk(child, child.type === 'folder' ? [...path, (child.name ?? '').trim() || 'Folder'] : path);
  };
  for (const [key, root] of Object.entries(roots)) {
    if (!root || typeof root !== 'object' || !Array.isArray(root.children)) continue;
    walk(root, key === 'bookmark_bar' ? [browser] : [browser, (root.name ?? '').trim() || key]);
  }
  return found;
}

/** Adds the imported links that Links does not hold yet, matched by address, and counts what it skipped. */
export function addImported<T extends { url: string }>(links: T[], incoming: BookmarkLink[], make: (link: BookmarkLink) => T): { links: T[]; added: number; skipped: number } {
  const held = new Set(links.map((l) => l.url));
  const added: T[] = [];
  for (const link of incoming) {
    if (held.has(link.url)) continue;
    held.add(link.url);
    added.push(make(link));
  }
  return { links: [...links, ...added], added: added.length, skipped: incoming.length - added.length };
}
