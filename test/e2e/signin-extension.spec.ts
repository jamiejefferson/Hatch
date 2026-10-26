// Sign-ins that last: session cookies survive a restart, and Hatch's browser extension hands a site's sign-in over with no Keychain question.
import { readFileSync, statSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, expect, test } from '@playwright/test';
import { EXTENSION_IDS } from '@shared/signin-handoff';
import { freshHome, inPages, launch, openHatch, serveSite } from './helpers';

const portOf = (home: string): number => (JSON.parse(readFileSync(join(home, 'server.json'), 'utf8')) as { port: number }).port;

test('a session cookie lasts through a restart', async () => {
  const site = await serveSite();
  const home = freshHome();
  try {
    const first = await launch(home);
    await openHatch(first.win, `${site.url}/index.html`);
    await expect.poll(async () => (await inPages<string>(first.app, 'document.title'))[0]).toBe('Pricing | Acme');
    // No expiry makes it a session cookie, which Chromium drops on quit.
    await inPages(first.app, `document.cookie = 'kept=yes; path=/'`);
    await first.app.close();
    // The file holds sign-ins, so only the user's account reads it.
    expect(statSync(join(home, 'session-cookies.json')).mode & 0o777).toBe(0o600);

    const second = await launch(home);
    // The test opens the page again itself, so it checks the cookie and not whether the workspace saved before the quit.
    await openHatch(second.win, `${site.url}/docs.html`);
    await expect.poll(async () => (await inPages<string>(second.app, 'document.cookie')).join(' '), { timeout: 10_000 }).toContain('kept=yes');
    await second.app.close();
  } finally {
    await site.close();
  }
});

test("Hatch takes a site's cookies from its own extension alone, and opens the site's pages again", async () => {
  const site = await serveSite();
  const home = freshHome();
  const { app, win } = await launch(home);
  try {
    await openHatch(win, `${site.url}/index.html`);
    await expect.poll(async () => (await inPages<string>(app, 'document.title'))[0]).toBe('Pricing | Acme');
    const port = portOf(home);
    const body = JSON.stringify({ site: '127.0.0.1', browser: 'Chrome', cookies: [{ domain: '127.0.0.1', hostOnly: true, name: 'sid', value: 'forged', path: '/', secure: false, httpOnly: false, sameSite: 'lax', session: false, expirationDate: Date.now() / 1000 + 3600 }] });
    const post = (origin?: string) => fetch(`http://127.0.0.1:${port}/signin`, { method: 'POST', headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) }, body });

    // A web page, another extension or a bare request is refused.
    expect((await post('https://evil.example')).status).toBe(403);
    expect((await post('chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).status).toBe(403);
    expect((await post()).status).toBe(403);
    await expect.poll(async () => (await inPages<string>(app, 'document.cookie'))[0]).not.toContain('sid=');

    // The extension itself, in Chromium, reads the site's cookies and sends them with the origin Hatch checks.
    const extension = resolve('browser-extension');
    const browser = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'hatch-chromium-')), { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
    try {
      // The site signs the user in inside the browser.
      const tab = await browser.newPage();
      await tab.goto(`${site.url}/index.html`);
      await browser.addCookies([{ name: 'sid', value: 'from-chrome', domain: '127.0.0.1', path: '/', expires: Math.round(Date.now() / 1000) + 3600, sameSite: 'Lax' }]);
      // The popup normally reads the tab it opened over, and tries Hatch's usual ports. The test points both at its own copies,
      // so a Hatch the user has running is never reached.
      const popup = await browser.newPage();
      await popup.addInitScript(({ pageUrl, port }) => {
        const c = (globalThis as unknown as { chrome: { tabs: { query: unknown } } }).chrome;
        c.tabs.query = async () => [{ url: pageUrl }];
        const real = globalThis.fetch;
        globalThis.fetch = (input, init) => {
          const url = String(input);
          if (!url.includes(':42824/')) return Promise.reject(new TypeError('not this port'));
          return real(url.replace(':42824/', `:${port}/`), init);
        };
      }, { pageUrl: `${site.url}/index.html`, port });
      await popup.goto(`chrome-extension://${EXTENSION_IDS[0]}/popup.html`);
      await popup.getByRole('button', { name: 'Send my sign-in for 127.0.0.1 to Hatch' }).click();
      await expect(popup.getByRole('status')).toHaveText('Hatch has your sign-in for 127.0.0.1 and opened its pages again.');
      await expect(win.getByText('Hatch brought your sign-in for 127.0.0.1 from your browser and opened its pages again.')).toBeVisible();
    } finally {
      await browser.close();
    }
    await expect.poll(async () => (await inPages<string>(app, 'document.cookie'))[0]).toContain('sid=from-chrome');

    // The agent door still refuses anything that comes from a browser.
    const mcp = await fetch(`http://127.0.0.1:${port}/mcp`, { method: 'POST', headers: { origin: `chrome-extension://${EXTENSION_IDS[0]}`, 'content-type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(5000) }).then((r) => r.status, (e: Error) => e.message);
    expect(mcp).toBe(403);
  } finally {
    await app.close();
    await site.close();
  }
});
