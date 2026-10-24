// Dark mode for Hatch's own interface, and a toolbar that hides behind a handle at the left edge in full screen while the left column is shut (JJ, 1 Oct 2026).
// The tests run a hidden window, which cannot enter full screen, so they send the window's full-screen and pointer signals themselves.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { freshHome, launch } from './helpers';

const push = (app: import('@playwright/test').ElectronApplication, channel: string, value: unknown) => app.evaluate(({ BrowserWindow }, [c, v]) => BrowserWindow.getAllWindows()[0]!.webContents.send(c as string, v), [channel, value] as const);
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

    // Outside full screen the toolbar stays when the left column shuts.
    await win.getByTestId('left-toggle').click();
    await expect(win.getByTestId('toolbar')).toBeVisible();
    await expect(win.getByTestId('toolbar-edge')).toHaveCount(0);

    // In full screen it tucks away, and the handle grows stronger as the pointer nears the edge.
    await push(app, 'window:fullscreen', true);
    const edge = win.getByTestId('toolbar-edge');
    await expect(edge).toBeVisible();
    await expect(win.getByTestId('toolbar-away')).toHaveAttribute('inert', '');
    const handle = edge.locator('.edge-handle');
    await push(app, 'pointer:edge', 160);
    await expect(handle).toHaveAttribute('data-near', '0.00');
    await push(app, 'pointer:edge', 40);
    await expect(handle).toHaveAttribute('data-near', '0.75');

    // Resting the pointer on the edge slides the toolbar in, its buttons work, and leaving slides it away.
    const box = (await edge.boundingBox())!;
    await win.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(win.getByTestId('toolbar-peek')).toBeVisible();
    await win.waitForTimeout(400);
    await win.getByTestId('add-note').click();
    await expect(win.getByTestId('add-note')).toHaveAttribute('aria-pressed', 'true');
    await win.keyboard.press('Escape');
    await win.mouse.move(box.x + 600, box.y + box.height / 2);
    await expect(win.getByTestId('toolbar-away')).toHaveCount(1);
    await expect(edge).toBeVisible();

    // Leaving full screen brings the toolbar back in place.
    await push(app, 'window:fullscreen', false);
    await expect(edge).toHaveCount(0);
    await expect(win.getByTestId('toolbar')).toBeVisible();
    await push(app, 'window:fullscreen', true);
    await win.waitForTimeout(800);
  } finally {
    await app.close();
  }

  // Both choices last. Switched off, the toolbar stays while the left column is shut.
  ({ app, win } = await launch(home, 0));
  try {
    await expect(win.locator('html')).toHaveAttribute('data-theme', 'dark');
    await push(app, 'window:fullscreen', true);
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
