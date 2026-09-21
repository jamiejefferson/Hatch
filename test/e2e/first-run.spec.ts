// An update opens the guide's "what changed" panel once, in a tab of its own.
// A fresh install opens the guide to Hatch in Fit to view with the sidebar closed, and saves two links.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { freshHome, inPages, launch, serveSite } from './helpers';

test('a first start shows the guide page in Fit to view, and a second start keeps what the user left', async () => {
  const site = await serveSite();
  const home = freshHome();
  const welcome = `${site.url}/docs.html`;
  const first = await launch(home, 0, { HATCH_WELCOME: '1', HATCH_WELCOME_URL: welcome, HATCH_GUIDE: '1' });
  try {
    await expect.poll(async () => (await inPages<string>(first.app, 'location.href'))[0] ?? '').toBe(welcome);
    await expect(first.win.locator('.tab .fit-bar')).toBeVisible();
    await expect(first.win.locator('.sidebar')).toHaveCount(0);
    // The guide page stands in for the coach marks.
    await expect(first.win.getByTestId('guide')).toHaveCount(0);

    const links = JSON.parse(readFileSync(join(home, 'links.json'), 'utf8')) as { name: string; url: string }[];
    expect(links.map((l) => [l.name, l.url])).toEqual([['Hatch guide', welcome], ['Google', 'https://www.google.com/']]);
    expect(JSON.parse(readFileSync(join(home, 'settings.json'), 'utf8')).newHatchPage).toBe(welcome);

    // The user opens the sidebar and leaves Fit to view, and both choices last.
    await first.win.getByTestId('sidebar-toggle').click();
    await first.win.keyboard.press('Escape');
    await expect(first.win.locator('.tab .fit-bar')).toHaveCount(0);
    await first.win.waitForTimeout(800);
  } finally {
    await first.app.close();
  }

  const second = await launch(home, 0, { HATCH_WELCOME: '1', HATCH_WELCOME_URL: `${site.url}/contact.html` });
  try {
    await expect(second.win.locator('.sidebar')).toHaveCount(1);
    await expect(second.win.locator('.tab .fit-bar')).toHaveCount(0);
    expect((await inPages<string>(second.app, 'location.href'))[0]).toBe(welcome);
  } finally {
    await second.app.close();
    await site.close();
  }
});

test('with the welcome switched off, a fresh start is an empty canvas', async () => {
  const home = freshHome();
  const { app, win } = await launch(home, 0);
  try {
    await expect(win.getByText('This tab has no pages yet.')).toBeVisible();
    expect(existsSync(join(home, 'links.json'))).toBe(false);
  } finally {
    await app.close();
  }
});

test('the first start of a new version opens the guide at #new in its own tab, and the next start adds nothing', async () => {
  const site = await serveSite();
  const home = freshHome();
  const welcome = `${site.url}/docs.html`;
  // The user already has a canvas from an earlier version, which wrote no version.json.
  writeFileSync(join(home, 'workspace.json'), JSON.stringify({ version: 1, sidebarOpen: true, activeTabId: 'tab_mine', tabs: [{ id: 'tab_mine', name: 'Shop', hatches: [], selectedHatchId: null, pan: { x: 0, y: 0 }, zoom: 1 }] }));
  writeFileSync(join(home, 'settings.json'), JSON.stringify({ guideSeen: true, jevRunSeen: true }));
  const first = await launch(home, 0, { HATCH_WELCOME: '1', HATCH_WELCOME_URL: welcome });
  try {
    await expect.poll(async () => (await inPages<string>(first.app, 'location.href'))[0] ?? '').toBe(`${welcome}#new`);
    await expect(first.win.locator('.tab')).toHaveCount(2);
    await expect(first.win.locator('.tab.active')).toContainText('New in Hatch');
    await expect(first.win.locator('.tab .fit-bar')).toBeVisible();
    await expect(first.win.locator('.sidebar')).toHaveCount(0);
    await expect(first.win.locator('.tab').first()).toContainText('Shop');
    expect(typeof JSON.parse(readFileSync(join(home, 'version.json'), 'utf8')).seen).toBe('string');
    await first.win.waitForTimeout(800);
  } finally {
    await first.app.close();
  }

  const second = await launch(home, 0, { HATCH_WELCOME: '1', HATCH_WELCOME_URL: welcome });
  try {
    await expect(second.win.locator('.tab')).toHaveCount(2);
  } finally {
    await second.app.close();
    await site.close();
  }
});
