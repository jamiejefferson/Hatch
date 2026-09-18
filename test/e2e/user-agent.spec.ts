// Google refuses a sign-in from a browser that names Electron, so a page and its pop-up must both see an ordinary Chrome.
import { expect, test } from '@playwright/test';
import { freshHome, inPages, launch, openHatch, serveSite } from './helpers';

test('a page and its pop-up see a plain Chrome user agent', async () => {
  const site = await serveSite();
  const { app, win } = await launch(freshHome(), 0);
  try {
    await openHatch(win, `${site.url}/popup-login.html`);
    await expect.poll(async () => (await inPages<string>(app, 'navigator.userAgent'))[0] ?? '').toMatch(/Chrome\/\d+/);
    const pageUa = (await inPages<string>(app, 'navigator.userAgent'))[0]!;
    expect(pageUa).not.toMatch(/electron|hatch/i);

    // The pop-up opens for a Hatch in Fit to view.
    await win.getByRole('button', { name: 'Fit to view' }).first().click();
    await expect.poll(() => inPages<boolean>(app, `!!window.open('/popup-provider.html', 'provider', 'width=480,height=600')`).then((r) => r[0])).toBe(true);
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(2);
    const popupUa = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((w) => w.webContents).find((wc) => wc.getURL().includes('popup-provider'))!.getUserAgent());
    expect(popupUa).toBe(pageUa);
  } finally {
    await app.close();
    await site.close();
  }
});
