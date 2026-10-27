// Review states of the contextual canvas at a working zoom with both columns shut, and once on a narrow canvas.
// Each state is captured to test-results/screens/ for a design check, and each checks what the screen must show.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import type { Workspace } from '@shared/types';
import { capture, freshHome, launch, serveSite } from './helpers';

let app: ElectronApplication;
let win: Page;
let agent: Client;
let site: Awaited<ReturnType<typeof serveSite>>;
let home: string;

const tab = () => (JSON.parse(readFileSync(join(home, 'workspace.json'), 'utf8')) as Workspace).tabs[0]!;
const settle = () => win.waitForTimeout(700);
const call = (name: string, args: Record<string, unknown> = {}) => agent.callTool({ name, arguments: args });
const header = (id: string) => win.getByTestId(`header-${id}`);
const zoom = async () => Number((await win.getByTestId('zoom-level').textContent())!.replace('%', ''));

/** Screen boxes of every Hatch title, which no arrangement other than an explicit alignment may lay over one another. */
async function titlesOverlap(): Promise<boolean> {
  const boxes = await Promise.all(tab().hatches.map((h) => header(h.id).boundingBox()));
  return boxes.some((a, i) => boxes.some((b, j) => j > i && a && b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height));
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  site = await serveSite();
  home = freshHome();
  ({ app, win } = await launch(home, 0));
  const { url } = JSON.parse(readFileSync(join(home, 'server.json'), 'utf8'));
  agent = new Client({ name: 'scout', version: '1.0.0' });
  await agent.connect(new StreamableHTTPClientTransport(new URL(`${url}?agent=scout`)));
  for (const page of ['index.html', 'docs.html', 'gallery.html']) await call('open_hatch', { to: `${site.url}/${page}`, width: 480, height: 360 });
  await expect.poll(() => { try { return tab().hatches.length; } catch { return 0; } }, { timeout: 15_000 }).toBe(3);
  const [a, , c] = tab().hatches;
  await call('add_note', { text: 'Pricing is the practical side.', hatch: a!.id });
  await call('add_note', { text: 'The gallery shows the visual side.', hatch: c!.id });
  await call('finish_working');
  await win.getByTestId('show-all').click();
  await settle();
});

test.afterAll(async () => {
  await agent.close().catch(() => {});
  await app.close();
  await site.close();
});

test('tidy at a working zoom with both columns shut: titles never overlap, and the notice sits clear of the bar', async () => {
  const [a, b, c] = tab().hatches;
  await header(a!.id).click();
  await header(b!.id).click({ modifiers: ['Shift'] });
  await header(c!.id).click({ modifiers: ['Shift'] });
  // Shut both columns first, so the canvas has the window, then tidy and fit the selection to it.
  if (await win.getByTestId('sidebar-close').isVisible()) await win.getByTestId('sidebar-close').click();
  if (await win.getByTestId('canvas-list').isVisible()) await win.getByTestId('left-toggle').click();
  await win.getByTestId('arrange').click();
  await win.getByTestId('fit-selection').click();
  await win.getByTestId('arrange').click();
  await win.getByTestId('arrange-tidy').click();
  await settle();
  expect(await zoom()).toBeGreaterThanOrEqual(60);
  expect(await zoom()).toBeLessThanOrEqual(75);
  expect(await titlesOverlap()).toBe(false);
  // The notice sits under the top strip and never on the selection bar.
  const notice = (await win.getByTestId('layout-notice').boundingBox())!;
  const bar = (await win.getByTestId('selection-bar').boundingBox())!;
  expect(notice.y + notice.height < bar.y || bar.y + bar.height < notice.y).toBe(true);
  await capture(app, 'test-results/screens/36-review-tidy.png');
});

test('a named group with its More menu open', async () => {
  await win.getByTestId('group-selection').click();
  await win.getByTestId('group-name-field').fill('Repair references');
  await win.getByTestId('group-name-field').press('Enter');
  await win.getByTestId('group-name').click();
  await win.getByTestId('selection-more').click();
  await expect(win.getByTestId('more-menu')).toBeVisible();
  await expect(win.getByTestId('selection-outline')).toHaveCount(0);
  await expect(win.locator('.group-outline')).toHaveCount(1);
  await capture(app, 'test-results/screens/37-review-group-more.png');
  await win.keyboard.press('Escape');
});

test('the prompt with Review shut, then open', async () => {
  await win.getByTestId('group-name').click();
  await win.getByTestId('add-prompt').click();
  await win.getByTestId('prompt-text').fill('Find three examples of repair as a design issue, beyond laptops and phones.');
  await expect(win.getByTestId('prompt-review-list')).toHaveCount(0);
  await capture(app, 'test-results/screens/38-review-prompt.png');
  await win.getByTestId('prompt-review').click();
  await expect(win.getByTestId('prompt-review-list')).toBeVisible();
  await capture(app, 'test-results/screens/39-review-prompt-review.png');
  await win.keyboard.press('Escape');
});

test('a narrow canvas with both columns open keeps the bar and its menu inside the canvas', async () => {
  await win.keyboard.press('Escape');
  await win.getByTestId('left-toggle').click();
  const [a, b] = tab().hatches;
  await header(a!.id).click();
  await header(b!.id).click({ modifiers: ['Shift'] });
  await expect(win.getByTestId('sidebar-close')).toBeVisible();
  await win.getByTestId('arrange').click();
  const canvas = (await win.locator('.canvas:not(.behind)').boundingBox())!;
  for (const id of ['selection-bar', 'arrange-menu']) {
    const box = (await win.getByTestId(id).boundingBox())!;
    expect(box.x, id).toBeGreaterThanOrEqual(canvas.x);
    expect(box.x + box.width, id).toBeLessThanOrEqual(canvas.x + canvas.width);
  }
  await capture(app, 'test-results/screens/40-review-narrow.png');
});
