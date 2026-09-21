// The right-click menu inside a live page. It appears over an image, and saves or copies it.
import { basename } from 'node:path';
import { BrowserWindow, clipboard, Menu, session, type ContextMenuParams, type MenuItemConstructorOptions, type WebContents } from 'electron';
import { PAGES_PARTITION } from '../paths';
import { push } from '../renderer-rpc';

/** The items for one right-click. A spot with no image gets no menu. */
export function pageMenu(guest: WebContents, params: ContextMenuParams): MenuItemConstructorOptions[] {
  if (params.mediaType !== 'image' || !params.srcURL) return [];
  return [
    // The download runs in the page's own session, so an image behind a sign-in arrives as the page shows it.
    { label: 'Save Image As…', click: () => guest.downloadURL(params.srcURL) },
    { label: 'Copy Image', enabled: params.hasImageContents, click: () => guest.copyImageAt(params.x, params.y) },
    { label: 'Copy Image Address', click: () => clipboard.writeText(params.srcURL) },
  ];
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
