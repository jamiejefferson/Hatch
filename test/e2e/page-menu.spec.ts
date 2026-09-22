// A right-click on an image in a page offers to save it, and Hatch says when the file has landed. A right-click on a link opens it in a new Hatch, copies it or saves it to Links.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { freshHome, launch, openHatch, serveSite } from './helpers';

test('a right-click on an image saves it, a right-click on a link opens or saves it, and a right-click elsewhere shows no menu', async () => {
  const site = await serveSite();
  const home = freshHome();
  const { app, win } = await launch(home, 0);

  try {
    await openHatch(win, `${site.url}/gallery.html`);
    await expect.poll(() => app.evaluate(({ webContents }) => webContents.getAllWebContents().some((wc) => wc.getType() === 'webview' && wc.getTitle() === 'Gallery'))).toBe(true);

    // A native menu cannot be clicked from here, so the test keeps each menu Hatch builds in place of showing it, and sends every download to the test folder with no dialog.
    await app.evaluate(({ Menu, session }, folder) => {
      const kept = globalThis as unknown as { menus: Electron.Menu[] };
      kept.menus = [];
      Menu.prototype.popup = function () {
        kept.menus.push(this);
      };
      session.fromPartition('persist:hatch-pages').on('will-download', (_e, item) => item.setSavePath(`${folder}/${item.getFilename()}`));
    }, home);

    const rightClick = (selector: string): Promise<void> =>
      app.evaluate(async ({ webContents }, sel) => {
        const guest = webContents.getAllWebContents().find((wc) => wc.getType() === 'webview')!;
        const spot = (await guest.executeJavaScript(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`)) as { x: number; y: number };
        guest.sendInputEvent({ type: 'mouseDown', button: 'right', clickCount: 1, ...spot });
        guest.sendInputEvent({ type: 'mouseUp', button: 'right', clickCount: 1, ...spot });
      }, selector);
    const menus = (): Promise<string[][]> => app.evaluate(() => (globalThis as unknown as { menus: Electron.Menu[] }).menus.map((m) => m.items.map((i) => i.label)));

    await rightClick('#plain');
    await rightClick('#mark');
    await expect.poll(menus).toEqual([['Save Image As…', 'Copy Image', 'Copy Image Address']]);

    await app.evaluate(() => (globalThis as unknown as { menus: Electron.Menu[] }).menus[0]!.items[0]!.click());
    await expect(win.locator('.toast')).toHaveText('Hatch saved mark.svg.');
    expect(existsSync(join(home, 'mark.svg'))).toBe(true);
    expect(readFileSync(join(home, 'mark.svg'), 'utf8')).toContain('#E9C534');

    await app.evaluate(() => (globalThis as unknown as { menus: Electron.Menu[] }).menus[0]!.items[2]!.click());
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(`${site.url}/mark.svg`);

    await rightClick('#link');
    await expect.poll(menus).toEqual([
      ['Save Image As…', 'Copy Image', 'Copy Image Address'],
      ['Open Link in New Hatch', 'Copy Link Address', 'Save Link to Links'],
    ]);

    await app.evaluate(() => (globalThis as unknown as { menus: Electron.Menu[] }).menus[1]!.items[1]!.click());
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(`${site.url}/docs.html`);

    await app.evaluate(() => (globalThis as unknown as { menus: Electron.Menu[] }).menus[1]!.items[2]!.click());
    await expect(win.locator('.toast')).toHaveText('Hatch saved this link in Links.');
    await expect.poll(() => JSON.parse(readFileSync(join(home, 'links.json'), 'utf8')) as { name: string; url: string }[]).toContainEqual(expect.objectContaining({ name: 'Read the docs', url: `${site.url}/docs.html` }));

    await app.evaluate(() => (globalThis as unknown as { menus: Electron.Menu[] }).menus[1]!.items[0]!.click());
    await expect.poll(() => app.evaluate(({ webContents }) => webContents.getAllWebContents().filter((wc) => wc.getType() === 'webview').map((wc) => wc.getTitle()).sort())).toEqual(['Gallery', 'Getting started | Acme Docs']);
    await expect(win.locator('.hatch-page')).toHaveCount(2);
  } finally {
    await app.close();
    await site.close();
  }
});
