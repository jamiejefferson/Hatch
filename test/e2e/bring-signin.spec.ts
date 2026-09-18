// The user brings a site's sign-in from another browser. The test builds a stand-in Chrome folder with an encrypted cookie,
// so it reads neither the user's browser nor the Keychain.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
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

    await win.getByTestId('panel-signins').click();
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
    await win.getByTestId('panel-signins').click();
    await win.getByTestId('bring-signin-go').click();
    await expect(win.getByTestId('bring-signin-said')).toHaveText('Chrome holds no cookies for 127.0.0.1. Sign in to 127.0.0.1 in Chrome first, then try again.');
  } finally {
    await app.close();
    await site.close();
  }
});
