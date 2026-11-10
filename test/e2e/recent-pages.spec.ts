// New Hatch lists the pages the user's Hatches showed lately, newest first, and keeps them through a restart.
import { expect, test } from '@playwright/test';
import { capture, freshHome, inPages, launch, openHatch, serveSite } from './helpers';

test('New Hatch offers recent pages, narrows them as the user types and opens one', async () => {
  const site = await serveSite();
  const home = freshHome();
  let { app, win } = await launch(home);
  try {
    await openHatch(win, site.url);
    await openHatch(win, `${site.url}/docs.html`);
    await expect.poll(async () => (await inPages<string>(app, 'document.title')).sort()).toEqual(['Getting started | Acme Docs', 'Pricing | Acme']);
    // A page reached inside a Hatch joins the list too.
    await inPages(app, `location.pathname === '/docs.html' ? (location.href = '/long.html', 1) : 0`);
    await expect.poll(async () => (await inPages<string>(app, 'document.title')).sort()).toEqual(['Long page', 'Pricing | Acme']);
    await win.waitForTimeout(600);
    await app.close();

    // The list survives a restart, and the pages open at start-up keep their order.
    ({ app, win } = await launch(home));
    await expect(win.locator('webview')).toHaveCount(2);
    await win.getByTestId('left-canvases').click();
    await win.getByTestId('new-hatch').click();
    const rows = win.getByTestId('recent-page');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText('Long page');
    await expect(rows.nth(1)).toContainText('Getting started | Acme Docs');
    await expect(rows.nth(2)).toContainText('Pricing | Acme');
    await capture(app, 'test-results/screens/new-hatch-recent.png');

    await win.getByTestId('new-hatch-url').fill('acme docs');
    await expect(rows).toHaveCount(1);
    await win.getByTestId('new-hatch-url').fill('figma');
    await expect(win.getByTestId('recent-pages')).toHaveCount(0);
    await win.getByTestId('new-hatch-url').fill('docs');
    await rows.first().click();
    await expect(win.getByTestId('new-hatch-modal')).toBeHidden();
    await expect(win.locator('webview')).toHaveCount(3);
    await expect.poll(async () => (await inPages<string>(app, 'document.title')).filter((t) => t.includes('Acme Docs')).length).toBe(1);
  } finally {
    await app.close();
    await site.close();
  }
});
