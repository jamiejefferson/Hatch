// The Hatch panel lists every canvas, saves the current one under a name, and opens a saved canvas as a new tab.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { freshHome, inPages, launch, openHatch, serveSite, showCanvasPanel } from './helpers';

type Saved = { name: string; hatches: { url: string; width: number }[] };

test('a canvas is saved by name, closed, and opened again with its Hatches', async () => {
  const site = await serveSite();
  const home = freshHome();
  const { app, win } = await launch(home, 0);
  const saved = (): Saved[] => JSON.parse(readFileSync(join(home, 'canvases.json'), 'utf8')) as Saved[];
  try {
    await openHatch(win, `${site.url}/index.html`);
    await openHatch(win, `${site.url}/docs.html`);
    await win.getByTestId('template-tablet').click();
    await showCanvasPanel(win);

    // Every open canvas is listed, and the current one carries its Hatch count.
    const canvases = win.getByTestId('canvas-list');
    await expect(canvases.locator('li')).toHaveCount(1);
    await expect(canvases).toContainText('2 Hatches');

    // The field offers the canvas's own name. The user names it and saves.
    await expect(win.getByTestId('canvas-name')).toHaveValue('Canvas');
    await win.getByTestId('canvas-name').fill('Research');
    await win.getByTestId('save-canvas').click();
    await expect(win.getByText('Hatch saved this canvas as Research.')).toBeVisible();
    await expect(win.getByTestId('saved-canvas-list')).toContainText('Research');
    await expect.poll(() => saved().map((c) => c.name)).toEqual(['Research']);
    expect(saved()[0]!.hatches.map((h) => h.url)).toEqual([`${site.url}/index.html`, `${site.url}/docs.html`]);
    expect(saved()[0]!.hatches[1]!.width).toBe(768);

    // Saving again under the same name keeps one saved canvas.
    await win.getByTestId('save-canvas').click();
    await expect.poll(() => saved().length).toBe(1);

    // The canvas closes, and the saved one opens as a new tab with both pages.
    await canvases.getByRole('button', { name: 'Close Canvas' }).click();
    await expect.poll(async () => (await inPages<string>(app, 'document.title')).length).toBe(0);
    await win.getByTestId('saved-canvas-list').getByRole('button', { name: /^Research/ }).click();
    await expect(win.getByRole('tab', { name: 'Research' })).toHaveAttribute('aria-selected', 'true');
    await expect.poll(async () => (await inPages<string>(app, 'document.title')).length).toBe(2);
    await expect(canvases.locator('li')).toHaveCount(2);
    await expect(canvases.locator('li.current')).toContainText('Research');

    // A row in the list switches the canvas, and the saved canvas can be removed.
    await canvases.getByRole('button', { name: /^Canvas 0 Hatches/ }).click();
    await expect(canvases.locator('li.current')).toContainText('0 Hatches');
    await win.getByRole('button', { name: 'Remove the saved canvas Research' }).click();
    await expect(win.getByTestId('saved-canvases')).toHaveCount(0);
    await expect.poll(() => saved()).toEqual([]);
  } finally {
    await app.close();
    await site.close();
  }
});
