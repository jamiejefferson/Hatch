// Milestone 0: a person opens two sites side by side, zooms out, drags one Hatch taller and switches the other to Fit to view.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { freshHome, inPages, launch, openHatch, serveSite, showCanvasPanel } from './helpers';

let site: Awaited<ReturnType<typeof serveSite>>;
let app: ElectronApplication;
let win: Page;
const home = freshHome();

test.beforeAll(async () => {
  site = await serveSite();
  ({ app, win } = await launch(home));
});
test.afterAll(async () => {
  await app?.close();
  await site.close();
});

const sizes = (): Promise<{ w: number; h: number; id: string; y: number }[]> => inPages(app, '({ w: innerWidth, h: innerHeight, id: window.__loadId, y: scrollY })');

test.describe.configure({ mode: 'serial' });

test('an empty tab offers New Hatch, and a bad link shows an error', async () => {
  await expect(win.getByText('This tab has no pages yet.')).toBeVisible();
  await win.getByTestId('new-hatch').click();
  await win.getByTestId('new-hatch-url').fill('not a link');
  await win.getByTestId('new-hatch-url').press('Enter');
  await expect(win.getByRole('alert')).toHaveText('A link has no spaces.');
  await win.keyboard.press('Escape');
  await expect(win.getByTestId('new-hatch-modal')).toBeHidden();
});

test('two sites open side by side at their real layout width', async () => {
  await openHatch(win, `${site.url}/index.html`);
  await openHatch(win, `${site.url.replace('http://', '')}/docs.html`);
  await expect.poll(async () => (await sizes()).map((s) => `${s.w}x${s.h}`)).toEqual(['960x752', '960x752']);
  // A tab is a canvas, so it keeps its own name while its pages change.
  await expect(win.locator('.tabs').getByRole('tab', { name: 'Canvas' })).toBeVisible();
  await expect(win.getByRole('heading', { name: 'Getting started | Acme Docs' })).toBeVisible();
  await expect(win.getByTestId('link-field')).toHaveValue(`${site.url}/docs.html`);
});

test('zooming out keeps the layout width', async () => {
  const selected = await win.locator('[data-testid^="header-"] button').first().evaluate((b) => b.closest('[data-testid]')!.getAttribute('data-testid')!);
  await showCanvasPanel(win);
  await expect(win.getByTestId('hatch-list').locator('li')).toHaveCount(2);
  await expect(win.getByTestId('zoom-level')).toHaveText('62%');
  await win.getByRole('button', { name: 'Zoom out' }).click();
  await expect(win.getByTestId('zoom-level')).toHaveText('50%');
  expect((await sizes()).map((s) => s.w)).toEqual([960, 960]);
  // The test that follows sizes the Hatch that was selected.
  await win.getByTestId(selected).click();
});

test('a template changes the page size with no reload', async () => {
  const before = await sizes();
  await win.getByTestId('template-tablet').click();
  await expect.poll(async () => (await sizes())[1]).toMatchObject({ w: 768, h: 1024, id: before[1]!.id });
});

test('dragging the bottom handle makes the Hatch taller with no reload', async () => {
  const before = (await sizes())[1]!;
  const handle = await win.getByTestId('handle-y').boundingBox();
  await win.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
  await win.mouse.down();
  await win.mouse.move(handle!.x + handle!.width / 2, handle!.y + 104, { steps: 5 });
  await win.mouse.up();
  // 100 screen pixels at 50% zoom add 200 page pixels.
  await expect.poll(async () => (await sizes())[1]!.h).toBeGreaterThan(before.h + 150);
  expect((await sizes())[1]!.id).toBe(before.id);
  await expect(win.getByTestId('size-h')).not.toHaveValue('1024');
});

test('an unselected Hatch leaves the wheel to the canvas, and the selected Hatch scrolls', async () => {
  const shield = win.locator('[data-testid^="shield-"]');
  await expect(shield).toHaveCount(1);
  const box = (await shield.boundingBox())!;
  await win.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await win.mouse.wheel(0, 120);
  await win.waitForTimeout(300);
  expect((await sizes())[0]!.y).toBe(0);

  await win.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(win.getByTestId('link-field')).toHaveValue(`${site.url}/index.html`);
  const moved = (await win.locator('[data-testid^="header-"]').first().boundingBox())!;
  await win.mouse.move(moved.x + 200, moved.y + 150);
  // The first wheel event after a tap releases the shield that waits for a double tap, and the ones after it scroll the page.
  await win.mouse.wheel(0, 1);
  await win.mouse.wheel(0, 120);
  await expect.poll(async () => (await sizes())[0]!.y).toBeGreaterThan(0);
});

test('Fit to view fills the canvas area, and leaving it restores the size', async () => {
  const before = (await sizes())[0]!;
  await win.getByTestId('fit-toggle').click();
  const canvas = (await win.getByTestId('canvas').boundingBox())!;
  // The control bar moves into the tab, so the page takes the whole canvas area.
  await expect.poll(async () => (await sizes())[0]).toMatchObject({ w: Math.round(canvas.width), h: Math.round(canvas.height), id: before.id });
  await expect(win.locator('.tab .fit-bar')).toBeVisible();

  // Fit to view is a toggle: the same control releases the Hatch to its size on the canvas.
  await win.getByTestId('leave-fit').click();
  await expect.poll(async () => (await sizes())[0]).toMatchObject({ w: 960, h: 752, id: before.id });
  await expect(win.locator('.tab .fit-bar')).toBeHidden();
});

test('a double tap on an unselected Hatch fits it to the view, and Esc returns to the canvas', async () => {
  const shield = win.locator('[data-testid^="shield-"]');
  const box = (await shield.boundingBox())!;
  await win.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  await expect(win.locator('.tab .fit-bar')).toBeVisible();

  // Esc from inside the page reaches Hatch as well as the page.
  await win.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await win.keyboard.press('Escape');
  await expect(win.locator('.tab .fit-bar')).toBeHidden();
  await expect(win.getByTestId('fit-toggle')).toHaveAttribute('aria-pressed', 'false');

  await win.locator('[data-testid^="bar-close-"]').click();
  await expect.poll(async () => (await sizes()).length).toBe(1);
  await openHatch(win, `${site.url}/docs.html`);
  await expect.poll(async () => (await sizes()).length).toBe(2);
});

test('a link that asks for a new window opens in the same Hatch', async () => {
  const count = (await sizes()).length;
  await inPages(app, "document.querySelector('a[target=_blank]')?.click()");
  await expect.poll(async () => (await inPages<string>(app, 'document.title'))[1]).toBe('Pricing | Acme');
  expect((await sizes()).length).toBe(count);
});

test('the workspace returns after a restart', async () => {
  await win.waitForTimeout(600);
  await app.close();
  const saved = JSON.parse(readFileSync(join(home, 'workspace.json'), 'utf8'));
  expect(saved.tabs[0].hatches).toHaveLength(2);
  expect(saved.tabs[0].zoom).toBe(0.5);

  ({ app, win } = await launch(home));
  await expect.poll(async () => (await sizes()).length).toBe(2);
  await showCanvasPanel(win);
  await expect(win.getByTestId('zoom-level')).toHaveText('50%');
});
