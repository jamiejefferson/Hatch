// A page's own full-screen button works: YouTube's player asks for the fullscreen permission, and Hatch grants it.
// The tests run a hidden window, which never reaches full screen, so the check reads the page's request as Electron hears it.
import { expect, test, type ElectronApplication } from '@playwright/test';
import { freshHome, launch, openHatch, serveSite } from './helpers';

const watchPlayer = (app: ElectronApplication) =>
  app.evaluate(({ webContents }) => {
    const g = webContents.getAllWebContents().find((w) => w.getURL().endsWith('/video.html'));
    if (!g) return false;
    (globalThis as { fullScreenAsked?: boolean }).fullScreenAsked = false;
    g.once('enter-html-full-screen', () => ((globalThis as { fullScreenAsked?: boolean }).fullScreenAsked = true));
    return true;
  });

test("a page's full-screen button reaches full screen", async () => {
  const site = await serveSite();
  const { app, win } = await launch(freshHome());
  try {
    await openHatch(win, `${site.url}/video.html`);
    await expect.poll(() => watchPlayer(app)).toBe(true);
    // A trusted click, as the user's own press on the player's button.
    void app.evaluate(({ webContents }) => webContents.getAllWebContents().find((w) => w.getURL().endsWith('/video.html'))!.executeJavaScript("document.getElementById('full').click()", true));
    await expect.poll(() => app.evaluate(() => (globalThis as { fullScreenAsked?: boolean }).fullScreenAsked)).toBe(true);
  } finally {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await site.close();
  }
});
