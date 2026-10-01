// Dark mode for Hatch's own interface, and a hidden sidebar that waits at the right edge behind a handle (JJ, 1 Oct 2026).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { freshHome, launch } from './helpers';

const background = (win: import('@playwright/test').Page) => win.evaluate<string>('getComputedStyle(document.body).backgroundColor');

test('dark mode changes the interface and lasts, and the hidden sidebar slides out at the right edge', async () => {
  const home = freshHome();
  let { app, win } = await launch(home, 0);
  try {
    const light = await background(win);
    await win.getByTestId('panel-settings').click();
    await win.getByTestId('theme-dark').click();
    await expect(win.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect.poll(() => background(win)).not.toBe(light);
    await expect.poll(() => JSON.parse(readFileSync(join(home, 'settings.json'), 'utf8')).theme).toBe('dark');

    // With the sidebar hidden, the handle marks the edge, and resting the pointer there slides the sidebar out over the canvas.
    await win.getByTestId('sidebar-toggle').click();
    await expect(win.locator('.sidebar')).toHaveCount(0);
    const edge = win.getByTestId('sidebar-edge');
    await expect(edge).toBeVisible();
    const box = (await edge.boundingBox())!;
    await win.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(win.getByTestId('sidebar-peek')).toBeVisible();
    await win.mouse.move(box.x - 600, box.y + box.height / 2);
    await expect(win.getByTestId('sidebar-peek')).toHaveCount(0);
    await expect(edge).toBeVisible();
    await win.waitForTimeout(800);
  } finally {
    await app.close();
  }

  // Both choices last. Switched off, the edge does nothing.
  ({ app, win } = await launch(home, 0));
  try {
    await expect(win.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(win.getByTestId('sidebar-edge')).toBeVisible();
    await win.getByTestId('sidebar-toggle').click();
    await win.getByTestId('panel-settings').click();
    await win.getByTestId('appearance').getByRole('switch').click();
    await win.getByTestId('theme-light').click();
    await expect(win.locator('html')).toHaveAttribute('data-theme', 'light');
    await win.getByTestId('sidebar-toggle').click();
    await expect(win.getByTestId('sidebar-edge')).toHaveCount(0);
  } finally {
    await app.close();
  }
});
