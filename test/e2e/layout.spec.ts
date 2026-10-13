// The layout: canvases and Hatches in a left column, page tools in a vertical toolbar, and three tabs in the sidebar.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { freshHome, launch, openHatch, serveSite } from './helpers';

test('the left column, the toolbar and the sidebar tabs each do one job', async () => {
  const site = await serveSite();
  const home = freshHome();
  const { app, win } = await launch(home);
  try {
    // With no Hatch selected, the toolbar's page tools wait and the Hatch tab speaks for the canvas.
    await expect(win.getByTestId('tool-reload')).toBeDisabled();
    await expect(win.getByTestId('canvas-settings')).toBeVisible();

    await openHatch(win, `${site.url}/index.html`);
    await expect(win.getByTestId('hatch-list').locator('li')).toHaveCount(1);
    await expect(win.getByTestId('canvas-title')).toHaveText('Canvas');
    await expect(win.getByTestId('tool-reload')).toBeEnabled();

    // The page and agent views share one button, which says which view it shows next.
    const view = win.getByTestId('view-toggle');
    await expect(view).toHaveAttribute('aria-pressed', 'false');
    await view.click();
    await expect(view).toHaveAttribute('aria-pressed', 'true');
    await expect(view).toHaveAccessibleName('Show the page');
    await view.click();
    await expect(view).toHaveAttribute('aria-pressed', 'false');

    // The selected Hatch's title row holds Fit to view and close, and the strip takes them over in Fit to view.
    await win.getByTestId('fit-toggle').click();
    await expect(win.locator('.top-strip .fit-bar')).toBeVisible();
    await expect(win.getByTestId('zoom-level')).toHaveText('Fit');
    await win.getByTestId('leave-fit').click();
    await expect(win.getByTestId('zoom-level')).toHaveText(/%$/);

    // Library holds projects and links.
    await win.getByTestId('left-library').click();
    await expect(win.getByTestId('library-projects')).toBeVisible();
    await expect(win.getByTestId('library-links')).toBeVisible();
    await win.getByTestId('left-canvases').click();

    // Comments has its own tab, and Settings holds the sign-ins.
    await win.getByTestId('panel-comments').click();
    await expect(win.getByTestId('no-comments')).toBeVisible();
    await win.getByTestId('panel-settings').click();
    await expect(win.getByRole('heading', { name: 'Sign-ins' })).toBeVisible();

    // One switch hides both side columns, and the choice lasts with the workspace.
    await expect(win.getByTestId('sidebar-toggle')).toHaveCount(0);
    await win.getByTestId('panels-toggle').click();
    await expect(win.getByTestId('left-column')).toHaveCount(0);
    await expect(win.locator('.sidebar')).toHaveCount(0);
    // The workspace saves 400 ms after a change.
    await win.waitForTimeout(700);
    const saved = JSON.parse(readFileSync(join(home, 'workspace.json'), 'utf8')) as { leftOpen?: boolean; sidebarOpen?: boolean };
    expect([saved.leftOpen, saved.sidebarOpen]).toEqual([false, false]);
    await win.getByTestId('panels-toggle').click();
    await expect(win.getByTestId('left-column')).toBeVisible();
    await expect(win.locator('.sidebar')).toBeVisible();

    // With only the sidebar open, the switch closes it, and the next press opens both.
    await win.getByTestId('panels-toggle').click();
    await win.getByTestId('panel-settings').click();
    await expect(win.locator('.sidebar')).toBeVisible();
    await expect(win.getByTestId('left-column')).toHaveCount(0);
    await win.getByTestId('panels-toggle').click();
    await expect(win.locator('.sidebar')).toHaveCount(0);
    await win.getByTestId('panels-toggle').click();
    await expect(win.getByTestId('left-column')).toBeVisible();
    await expect(win.locator('.sidebar')).toBeVisible();
  } finally {
    await app.close();
    await site.close();
  }
});
