// The user brings their favourites from another browser into Links. The test points Hatch at a stand-in browser folder.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { capture, freshHome, launch } from './helpers';

test('favourites come across from Chrome into a folder of their own, once', async () => {
  const home = freshHome();
  const browsers = join(home, 'browsers');
  const profile = join(browsers, 'Google', 'Chrome', 'Default');
  mkdirSync(profile, { recursive: true });
  writeFileSync(join(browsers, 'Google', 'Chrome', 'Local State'), JSON.stringify({ profile: { info_cache: { Default: { name: 'Work' } } } }));
  writeFileSync(join(profile, 'Bookmarks'), JSON.stringify({ roots: {
    bookmark_bar: { type: 'folder', name: 'Bookmarks bar', children: [
      { type: 'url', name: 'Figma', url: 'https://figma.com/' },
      { type: 'folder', name: 'Design', children: [{ type: 'url', name: 'Coolors', url: 'https://coolors.co/' }] },
    ] },
    other: { type: 'folder', name: 'Other bookmarks', children: [] },
  } }));
  const { app, win } = await launch(home, 0, { HATCH_BROWSER_ROOT: browsers });
  try {
    await win.getByTestId('panel-links').click();
    const go = win.getByTestId('bring-favourites-go');
    await expect(go).toHaveText('Bring my favourites from Chrome');
    await go.click();
    await expect(win.getByTestId('bring-favourites-said')).toHaveText('Hatch added 2 links from Chrome under the folder “Chrome”.');
    await expect(win.getByTestId('link-folder-Chrome')).toContainText('Figma');
    await expect(win.getByTestId('link-folder-Chrome / Design')).toContainText('Coolors');
    await capture(app, 'test-results/screens/21-bring-favourites.png');

    await go.click();
    await expect(win.getByTestId('bring-favourites-said')).toHaveText('Hatch found no new links in Chrome. Links already held 2 of them.');
  } finally {
    await app.close();
  }
});
