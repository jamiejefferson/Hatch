// The top strip's Hatch jumps and plus, the tooltips, the scroll that follows the pointer, the swipes in Fit to view and search in New Hatch.
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import type { Workspace } from '@shared/types';
import { freshHome, inPages, launch, openHatch, serveSite } from './helpers';

// The page holds the window's own DOM, which this project's test types leave out, so the scripts below go in as text.
const workspace = (win: Page): Promise<Workspace> => win.evaluate('window.hatch.loadWorkspace()');
const stripOrder = (win: Page): Promise<string[]> => win.evaluate(`[...document.querySelectorAll('.top-strip [data-testid]')].map((el) => el.getAttribute('data-testid'))`);
/** Playwright's keys never reach the Mac's menu, so the test presses the menu item the shortcut belongs to, and checks the shortcut. */
const pressMenu = (app: ElectronApplication, label: string) =>
  app.evaluate(({ Menu }, name) => {
    const item = Menu.getApplicationMenu()!.items.flatMap((m) => m.submenu?.items ?? []).find((i) => i.label === name)!;
    item.click();
    return item.accelerator;
  }, label);

test('the jumps sit right of the title, and in Fit to view a plus between them opens a Hatch that fills the view', async () => {
  const site = await serveSite();
  const { app, win } = await launch(freshHome());
  try {
    await openHatch(win, `${site.url}/index.html`);
    await openHatch(win, `${site.url}/docs.html`);
    // The title comes before the jumps in the strip.
    const order = await stripOrder(win);
    expect(order.indexOf('canvas-title')).toBeLessThan(order.indexOf('hatch-previous'));
    expect(order.indexOf('tool-forward')).toBeLessThan(order.indexOf('canvas-title'));
    await expect(win.getByTestId('fit-new-hatch')).toHaveCount(0);

    expect(await pressMenu(app, 'Fit Hatch to View')).toBe('CmdOrCtrl+F');
    await expect(win.getByTestId('zoom-level')).toHaveText('Fit');
    const fitOrder = await stripOrder(win);
    const at = (id: string) => fitOrder.indexOf(id);
    expect([at('hatch-previous') < at('fit-new-hatch'), at('fit-new-hatch') < at('hatch-next'), at('hatch-next') < at('leave-fit')]).toEqual([true, true, true]);

    await win.getByTestId('fit-new-hatch').click();
    await win.getByTestId('new-hatch-url').fill(`${site.url}/contact.html`);
    await win.getByTestId('new-hatch-url').press('Enter');
    await expect.poll(async () => (await workspace(win)).tabs[0]!.hatches.map((h) => h.template)).toEqual(['desktop', 'desktop', 'fit']);

    // Cmd+F leaves Fit to view as it entered it.
    await pressMenu(app, 'Fit Hatch to View');
    await expect(win.getByTestId('zoom-level')).toHaveText(/%$/);
  } finally {
    await app.close();
    await site.close();
  }
});

test('a control shows its name, its shortcut and what it does under the pointer', async () => {
  const site = await serveSite();
  const { app, win } = await launch(freshHome());
  try {
    await openHatch(win, `${site.url}/index.html`);
    await win.getByTestId('tool-reload').hover();
    const tip = win.getByTestId('tooltip');
    await expect(tip).toContainText('Reload');
    await expect(tip).toContainText("Loads the selected Hatch's page again.");
    await expect(win.getByTestId('tooltip-keys')).toHaveText('⌘R');
    // The Mac's own tooltip never shows beside it, and the control keeps its name.
    await expect(win.getByTestId('tool-reload')).not.toHaveAttribute('title');
    await expect(win.getByTestId('tool-reload')).toHaveAccessibleName('Reload');

    // An action button shows its name and where it goes.
    await win.getByTestId('add-action').click();
    await win.getByTestId('action-name').fill('Docs');
    await win.getByTestId('action-url').fill(`${site.url}/docs.html`);
    await win.getByTestId('action-save').click();
    await win.getByRole('button', { name: 'Open Docs' }).hover();
    await expect(tip).toContainText('Docs');
    await expect(tip).toContainText('127.0.0.1');
  } finally {
    await app.close();
    await site.close();
  }
});

test('a scroll over a Hatch scrolls its page, over the canvas it pans, and one gesture keeps its target', async () => {
  const site = await serveSite();
  const { app, win } = await launch(freshHome());
  try {
    await openHatch(win, `${site.url}/long.html`);
    await expect.poll(async () => (await inPages<string>(app, 'document.title'))[0]).toBe('Long page');
    // Nothing selected: the Hatch wears its shield, and the scroll still reaches the page.
    await win.keyboard.press('Escape');
    const shield = win.locator('[data-testid^="shield-"]').first();
    await expect(shield).toBeVisible();
    const box = (await shield.boundingBox())!;
    // The workspace saves 400 ms after a change, so the pan is read once the opening has settled.
    await win.waitForTimeout(700);
    const before = (await workspace(win)).tabs[0]!.pan;
    await win.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < 5; i++) await win.mouse.wheel(0, 80);
    await expect.poll(async () => (await inPages<number>(app, 'scrollY'))[0]).toBeGreaterThan(100);
    await win.waitForTimeout(600);
    expect((await workspace(win)).tabs[0]!.pan).toEqual(before);

    // Over empty canvas the scroll pans, and the page stays where it was.
    const scrolled = (await inPages<number>(app, 'scrollY'))[0]!;
    await win.waitForTimeout(300);
    const canvas = (await win.getByTestId('canvas').first().boundingBox())!;
    const below = Math.min(box.y + box.height + 40, canvas.y + canvas.height - 10);
    expect(below).toBeGreaterThan(box.y + box.height);
    await win.mouse.move(box.x + 40, below);
    for (let i = 0; i < 5; i++) await win.mouse.wheel(-60, 0);
    await expect.poll(async () => (await workspace(win)).tabs[0]!.pan.x).toBeGreaterThan(before.x + 100);
    expect((await inPages<number>(app, 'scrollY'))[0]).toBe(scrolled);

    // A pan that carries on over the Hatch, with no pause, stays a pan.
    await win.mouse.wheel(0, 40);
    await win.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < 5; i++) await win.mouse.wheel(0, 40);
    await win.waitForTimeout(300);
    expect((await inPages<number>(app, 'scrollY'))[0]).toBe(scrolled);
  } finally {
    await app.close();
    await site.close();
  }
});

test('in Fit to view a two-finger swipe goes back, and a three-finger swipe moves to the next Hatch', async () => {
  const site = await serveSite();
  const { app, win } = await launch(freshHome());
  try {
    await openHatch(win, `${site.url}/index.html`);
    await openHatch(win, `${site.url}/docs.html`);
    await expect.poll(async () => (await workspace(win)).tabs[0]!.hatches.length).toBe(2);
    const hatches = (await workspace(win)).tabs[0]!.hatches;
    await win.getByTestId('hatch-list').locator('li .row-main').first().click();
    await inPages(app, `location.href = ${JSON.stringify(`${site.url}/gallery.html`)}`);
    await expect.poll(async () => (await inPages<string>(app, 'location.pathname'))[0]).toBe('/gallery.html');
    await win.getByTestId('fit-toggle').click();
    await expect(win.getByTestId('zoom-level')).toHaveText('Fit');

    // Fingers moving right scroll the page left, which goes back.
    await win.evaluate(`{
      const page = document.querySelector('[data-page="${hatches[0]!.id}"]');
      for (let i = 0; i < 12; i++) page.sendInputEvent({ type: 'mouseWheel', x: 300, y: 300, deltaX: 25, deltaY: 0, canScroll: true, hasPreciseScrollingDeltas: true });
    }`);
    await expect.poll(async () => (await inPages<string>(app, 'location.pathname'))[0]).toBe('/index.html');

    // macOS sends the three-finger swipe to the window.
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.send('window:swipe', 'left'));
    await expect.poll(async () => (await workspace(win)).tabs[0]!.hatches.map((h) => h.template)).toEqual(['desktop', 'fit']);
  } finally {
    await app.close();
    await site.close();
  }
});

test('New Hatch searches Google for text that is no link, with suggestions as the user types', async () => {
  const site = await serveSite();
  const { app, win } = await launch(freshHome(), 0, { HATCH_SUGGEST_URL: `${site.url}/suggest?q=` });
  try {
    await win.getByTestId('new-hatch').click();
    await win.getByTestId('new-hatch-url').fill('awwwards');
    await expect(win.getByTestId('search-rows').getByRole('option')).toHaveCount(4);
    await expect(win.getByTestId('search-row-suggestion').first()).toContainText('awwwards fonts');
    // The arrows move to a suggestion, and Enter searches for it.
    await win.getByTestId('new-hatch-url').press('ArrowDown');
    await win.getByTestId('new-hatch-url').press('ArrowDown');
    await win.getByTestId('new-hatch-url').press('Enter');
    await expect.poll(async () => (await workspace(win)).tabs[0]!.hatches[0]?.url).toBe('https://www.google.com/search?q=awwwards%20fonts');

    // A link still opens as a link, with no search rows.
    await win.getByTestId('new-hatch').click();
    await win.getByTestId('new-hatch-url').fill(`${site.url}/docs.html`);
    await expect(win.getByTestId('search-rows')).toHaveCount(0);
  } finally {
    await app.close();
    await site.close();
  }
});
