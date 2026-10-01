// Dark mode for Hatch's own interface, and a toolbar that hides behind a handle at the left edge while the left column is shut (JJ, 1 Oct 2026).
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

    // With the left column shut, the toolbar hides, the handle marks the left edge, and resting the pointer there slides the toolbar out.
    await expect(win.getByTestId('toolbar')).toBeVisible();
    await win.getByTestId('left-toggle').click();
    await expect(win.getByTestId('toolbar')).toHaveCount(0);
    const edge = win.getByTestId('toolbar-edge');
    const box = (await edge.boundingBox())!;
    await win.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(win.getByTestId('toolbar-peek')).toBeVisible();
    await win.getByTestId('add-note').click();
    await expect(win.getByTestId('add-note')).toHaveAttribute('aria-pressed', 'true');
    await win.keyboard.press('Escape');
    await win.mouse.move(box.x + 600, box.y + box.height / 2);
    await expect(win.getByTestId('toolbar-peek')).toHaveCount(0);
    await expect(edge).toBeVisible();
    await win.waitForTimeout(800);
  } finally {
    await app.close();
  }

  // Both choices last. Switched off, the toolbar stays while the left column is shut.
  ({ app, win } = await launch(home, 0));
  try {
    await expect(win.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(win.getByTestId('toolbar-edge')).toBeVisible();
    await win.getByTestId('panel-settings').click();
    await win.getByTestId('appearance').getByRole('switch').click();
    await win.getByTestId('theme-light').click();
    await expect(win.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(win.getByTestId('toolbar-edge')).toHaveCount(0);
    await expect(win.getByTestId('toolbar')).toBeVisible();
  } finally {
    await app.close();
  }
});
