// The user brings a site's sign-in from another browser. The test builds a stand-in Chrome folder with an encrypted cookie,
// so it reads neither the user's browser nor the Keychain.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { encrypt } from '../cookie-fixture';
import { capture, freshHome, inPages, launch, openHatch, serveSite } from './helpers';

const PASSWORD = 'peanuts';

function fakeChrome(root: string, cookies: { host: string; name: string; value: string }[]): void {
  const profile = join(root, 'Google', 'Chrome', 'Default');
  mkdirSync(profile, { recursive: true });
  writeFileSync(join(root, 'Google', 'Chrome', 'Local State'), JSON.stringify({ profile: { info_cache: { Default: { name: 'Work' } } } }));
  const year3000 = (32_503_680_000 + 11_644_473_600) * 1_000_000;
  const rows = cookies.map((c) => `insert into cookies values ('${c.host}', '', '${c.name}', '', X'${encrypt(c.value, c.host, PASSWORD, 24).toString('hex')}', '/', ${year3000}, 0, 1, 1, 1);`);
  const sql = ["create table meta (key text, value text); insert into meta values ('version', '24');", 'create table cookies (host_key text, top_frame_site_key text, name text, value text, encrypted_value blob, path text, expires_utc integer, is_secure integer, is_httponly integer, has_expires integer, samesite integer);', ...rows].join('\n');
  execFileSync('/usr/bin/sqlite3', [join(profile, 'Cookies')], { input: sql });
}

test('a sign-in comes across from another browser, for the one site the Hatch shows', async () => {
  const site = await serveSite();
  const home = freshHome();
  const browsers = join(home, 'browsers');
  fakeChrome(browsers, [
    { host: '127.0.0.1', name: 'session', value: 'sam@example.com' },
    { host: '.other.test', name: 'session', value: 'never-copied' },
  ]);
  const { app, win } = await launch(home, 0, { HATCH_BROWSER_ROOT: browsers, HATCH_BROWSER_KEY: PASSWORD });
  try {
    await openHatch(win, `${site.url}/whoami`);
    await expect.poll(() => inPages<string>(app, 'document.getElementById("who")?.textContent').then((r) => r[0])).toBe('Signed out');

    await win.getByTestId('panel-settings').click();
    const go = win.getByTestId('bring-signin-go');
    await expect(win.getByTestId('bring-signin-site')).toHaveText('The selected Hatch shows 127.0.0.1.');
    await expect(go).toHaveText('Bring my sign-in from Chrome');
    await go.click();
    await expect(win.getByTestId('bring-signin-said')).toHaveText('Hatch copied 1 cookie for 127.0.0.1 from Chrome and reloaded the page.');
    await expect.poll(() => inPages<string>(app, 'document.getElementById("who")?.textContent').then((r) => r[0])).toBe('Signed in as sam@example.com');
    await capture(app, 'test-results/screens/20-bring-signin.png');

    // The cookie is http-only in Chrome and stays so in Hatch, and the other site's cookie never crossed.
    expect((await inPages<string>(app, 'document.cookie'))[0]).toBe('');
    // Every live page runs in the pages session, where Hatch's permission rules apply, and never in the default one.
    expect(await app.evaluate(({ webContents, session }) => webContents.getAllWebContents().filter((w) => w.getType() === 'webview').every((w) => w.session === session.fromPartition('persist:hatch-pages')))).toBe(true);
    const copied = await app.evaluate(({ session }) => session.fromPartition('persist:hatch-pages').cookies.get({}).then((all) => all.map((c) => `${c.domain}:${c.name}`)));
    expect(copied).toEqual(['127.0.0.1:session']);
  } finally {
    await app.close();
    await site.close();
  }
});

test('a browser with no cookies for the site says to sign in there first', async () => {
  const site = await serveSite();
  const home = freshHome();
  fakeChrome(join(home, 'browsers'), [{ host: '.other.test', name: 'session', value: 'x' }]);
  const { app, win } = await launch(home, 0, { HATCH_BROWSER_ROOT: join(home, 'browsers'), HATCH_BROWSER_KEY: PASSWORD });
  try {
    await openHatch(win, `${site.url}/whoami`);
    await win.getByTestId('panel-settings').click();
    await win.getByTestId('bring-signin-go').click();
    await expect(win.getByTestId('bring-signin-said')).toHaveText('Chrome holds no cookies for 127.0.0.1. Sign in to 127.0.0.1 in Chrome first, then try again.');
  } finally {
    await app.close();
    await site.close();
  }
});

test('a passkey sign-in finishes in another browser and the sign-in comes back to the Hatch', async () => {
  // The site's sign-in page asks for a passkey as it loads, as Microsoft's and Apple's do.
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const session = /(?:^|; )session=([^;]+)/.exec(req.headers.cookie ?? '')?.[1];
    res.setHeader('content-type', 'text/html');
    if (url.pathname === '/login') return void res.end(`<title>Sign in</title><h1>Sign in</h1><script>navigator.credentials.get({ publicKey: { challenge: new Uint8Array(32), timeout: 60000 } }).catch(() => {});</script>`);
    res.end(`<title>Account</title><h1 id="who">${session ? `Signed in as ${session}` : 'Signed out'}</h1>`);
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const home = freshHome();
  const browsers = join(home, 'browsers');
  const opened = join(home, 'opened.txt');
  fakeChrome(browsers, [{ host: '127.0.0.1', name: 'session', value: 'sam@example.com' }]);
  const { app, win } = await launch(home, 0, { HATCH_BROWSER_ROOT: browsers, HATCH_BROWSER_KEY: PASSWORD, HATCH_OPEN_LOG: opened });
  try {
    await openHatch(win, `${origin}/account`);
    await expect.poll(() => inPages<string>(app, 'document.title').then((r) => r[0])).toBe('Account');
    await inPages(app, `location.href = '/login?state=one-time'`);

    // The card names the sign-in, and the page that opens in Chrome is the one before the sign-in began.
    const card = win.getByTestId('signin-through');
    await expect(card).toContainText('This sign-in asks for a passkey, which Hatch cannot use');
    await expect(card).toContainText('Hatch then copies the sign-in for 127.0.0.1 into this Hatch.');
    await capture(app, 'test-results/screens/21-signin-through.png');
    await win.getByTestId('through-open').click();
    await expect.poll(() => (existsSync(opened) ? readFileSync(opened, 'utf8') : '')).toBe(`chrome Default ${origin}/account\n`);
    await expect(card).toContainText('Sign in to 127.0.0.1 in Chrome, then come back');
    await capture(app, 'test-results/screens/22-signin-through-back.png');

    await win.getByTestId('through-bring').click();
    await expect(card).toBeHidden();
    await expect(win.locator('.toast')).toHaveText('Hatch copied 1 cookie for 127.0.0.1 from Chrome and opened the page again.');
    await expect.poll(() => inPages<string>(app, 'document.getElementById("who")?.textContent').then((r) => r[0])).toBe('Signed in as sam@example.com');
  } finally {
    await app.close();
    server.close();
  }
});

test('the right-click menu offers to sign in through another browser', async () => {
  const site = await serveSite();
  const home = freshHome();
  fakeChrome(join(home, 'browsers'), [{ host: '127.0.0.1', name: 'session', value: 'sam@example.com' }]);
  const { app, win } = await launch(home, 0, { HATCH_BROWSER_ROOT: join(home, 'browsers'), HATCH_BROWSER_KEY: PASSWORD, HATCH_OPEN_LOG: join(home, 'opened.txt') });
  try {
    await openHatch(win, `${site.url}/whoami`);
    await win.locator('[data-testid^="header-"]').first().click({ button: 'right' });
    await win.getByTestId('menu-signin-through').click();
    await expect(win.getByTestId('signin-through')).toContainText('Sign in to 127.0.0.1 through another browser');
    await win.getByTestId('through-close').click();
    await expect(win.getByTestId('signin-through')).toBeHidden();
  } finally {
    await app.close();
    await site.close();
  }
});
