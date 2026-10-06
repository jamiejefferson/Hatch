// A pin on a canvas row keeps the canvas: its copy follows it while it is open, it stays in the Canvases list after it closes,
// a click opens it again, and unpinning forgets it. There is no separate saved canvases section (JJ, 1 Oct 2026).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { freshHome, inPages, launch, openHatch, serveSite, showCanvasPanel } from './helpers';

type Saved = { id: string; name: string; hatches: { url: string; width: number }[] };

test('a pinned canvas follows its changes, stays listed after it closes, opens again, and unpins', async () => {
  const site = await serveSite();
  const home = freshHome();
  const { app, win } = await launch(home, 0);
  const saved = (): Saved[] => {
    try {
      return JSON.parse(readFileSync(join(home, 'canvases.json'), 'utf8')) as Saved[];
    } catch {
      return [];
    }
  };
  try {
    await openHatch(win, `${site.url}/index.html`);
    await showCanvasPanel(win);
    await expect(win.getByTestId('saved-canvases')).toHaveCount(0);

    // Every canvas shows whether it is saved, and a press on the pin saves it under its own name.
    const canvases = win.getByTestId('canvas-list');
    const row = canvases.locator('li').first();
    // The pin stays where it is when the pointer reaches the row, so a press meant for it never lands on close.
    await win.mouse.move(800, 600);
    const resting = await row.getByTestId('pin-canvas').boundingBox();
    await row.hover();
    expect(await row.getByTestId('pin-canvas').boundingBox()).toEqual(resting);
    await row.getByTestId('pin-canvas').click();
    await expect(row.getByTestId('pin-canvas')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => saved().map((c) => c.name)).toEqual(['Canvas']);

    // The copy follows the canvas: a second page and a new name both reach it.
    await openHatch(win, `${site.url}/docs.html`);
    await win.getByTestId('template-tablet').click();
    await row.getByRole('tab').dblclick();
    await row.getByRole('textbox', { name: 'Canvas name' }).fill('Research');
    await row.getByRole('textbox', { name: 'Canvas name' }).press('Enter');
    await expect.poll(() => saved().map((c) => [c.name, c.hatches.length, c.hatches[1]?.width])).toEqual([['Research', 2, 768]]);

    // Closed, the canvas stays in the list, quieter, and a click opens it with both pages.
    await row.hover();
    await canvases.getByRole('button', { name: 'Close Research' }).click();
    await expect.poll(async () => (await inPages<string>(app, 'document.title')).length).toBe(0);
    const away = win.getByTestId('pinned-away');
    await expect(away).toHaveCount(1);
    await expect(away).toContainText('Research');
    // A saved canvas shows once: Recently closed leaves it out, and reopening it twice makes no second copy.
    await expect(win.getByTestId('recently-closed')).toHaveCount(0);
    await away.locator('.row-main').click();
    await app.evaluate(({ Menu }) => {
      const file = Menu.getApplicationMenu()!.items.find((i) => i.label === 'File')!;
      file.submenu!.items.find((i) => i.label === 'Reopen Closed Hatch or Canvas')!.click();
    });
    await expect(canvases.getByRole('tab', { name: 'Research' })).toHaveCount(1);
    await expect(win.getByRole('tab', { name: 'Research' })).toHaveAttribute('aria-selected', 'true');
    await expect.poll(async () => (await inPages<string>(app, 'document.title')).length).toBe(2);
    await expect(away).toHaveCount(0);

    // The reopened canvas is still pinned to the same copy, and unpinning forgets the copy while the canvas stays open.
    const reopened = canvases.locator('li.current');
    await expect(reopened.getByTestId('pin-canvas')).toHaveAttribute('aria-pressed', 'true');
    await reopened.getByTestId('pin-canvas').click();
    await expect.poll(() => saved()).toEqual([]);
    await expect(canvases.locator('li.current')).toContainText('Research');

    // A pinned canvas that has closed unpins from its row, and leaves the list.
    await reopened.hover();
    await reopened.getByTestId('pin-canvas').click();
    await expect.poll(() => saved().length).toBe(1);
    await reopened.hover();
    await canvases.getByRole('button', { name: 'Close Research' }).click();
    await away.getByTestId('pin-canvas').click();
    await expect(away).toHaveCount(0);
    await expect.poll(() => saved()).toEqual([]);
  } finally {
    await app.close();
    await site.close();
  }
});
