// The right-click menu inside a live page. It appears over a link or an image. A link opens in a new Hatch, or is copied or saved to Links; an image is saved or copied.
import { basename } from 'node:path';
import { BrowserWindow, clipboard, Menu, session, type ContextMenuParams, type MenuItemConstructorOptions, type WebContents } from 'electron';
import type { SavedLink } from '@shared/types';
import { newId } from '@shared/workspace';
import { PAGES_PARTITION } from '../paths';
import { callInterface, push } from '../renderer-rpc';
import { linksStore } from '../store/stores';

const isWebLink = (url: string): boolean => /^https?:\/\//i.test(url);

/** The items for one right-click. A spot with no link and no image gets no menu. */
export function pageMenu(guest: WebContents, params: ContextMenuParams): MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] = [];
  if (params.linkURL && isWebLink(params.linkURL)) {
    const url = params.linkURL;
    items.push(
      // The Hatch opens on the user's own tab and takes the selection, as a Hatch the user opens from the sidebar does.
      { label: 'Open Link in New Hatch', click: () => void callInterface('openForUser', { input: url }).catch((e: Error) => push('toast', e.message)) },
      { label: 'Copy Link Address', click: () => clipboard.writeText(url) },
      { label: 'Save Link to Links', click: () => void saveLink(params.linkText.trim() || url, url) },
    );
  }
  if (params.mediaType === 'image' && params.srcURL) {
    if (items.length > 0) items.push({ type: 'separator' });
    items.push(
      // The download runs in the page's own session, so an image behind a sign-in arrives as the page shows it.
      { label: 'Save Image As…', click: () => guest.downloadURL(params.srcURL) },
      { label: 'Copy Image', enabled: params.hasImageContents, click: () => guest.copyImageAt(params.x, params.y) },
      { label: 'Copy Image Address', click: () => clipboard.writeText(params.srcURL) },
    );
  }
  return items;
}

/** Adds one link to Links, as the Hatch right-click menu does, and tells the interface. A link already saved stays as it is. */
async function saveLink(name: string, url: string): Promise<void> {
  const links = await linksStore.update((links) => {
    if (links.some((l) => l.url === url)) return links;
    const saved: SavedLink = { id: newId('link'), name, url };
    return [...links, saved];
  });
  push('links:state', links);
  push('toast', 'Hatch saved this link in Links.');
}

export function addPageMenu(host: WebContents, guest: WebContents): void {
  guest.on('context-menu', (_event, params) => {
    const items = pageMenu(guest, params);
    if (items.length > 0) Menu.buildFromTemplate(items).popup({ window: BrowserWindow.fromWebContents(host) ?? undefined });
  });
}

/** Electron asks the user where a download goes. Hatch says when the file has landed, because a download shows nowhere else. */
export function watchDownloads(): void {
  session.fromPartition(PAGES_PARTITION).on('will-download', (_event, item) => {
    item.once('done', (_done, state) => {
      if (state === 'completed') push('toast', `Hatch saved ${basename(item.getSavePath())}.`);
      else if (state === 'interrupted') push('toast', `Hatch could not save ${item.getFilename()}.`);
    });
  });
}
