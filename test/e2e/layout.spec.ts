// The layout: canvases and Hatches in a left column, page history and Hatch jumps in the top strip, page tools in a vertical toolbar, and three tabs in the sidebar.
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

    // The left switch moves the left column alone, and the choice lasts with the workspace.
    await expect(win.getByTestId('sidebar-toggle')).toHaveCount(0);
    await win.getByTestId('left-toggle').click();
    await expect(win.getByTestId('left-column')).toHaveCount(0);
    await expect(win.locator('.sidebar')).toBeVisible();
    // The workspace saves 400 ms after a change.
    await win.waitForTimeout(700);
    const saved = JSON.parse(readFileSync(join(home, 'workspace.json'), 'utf8')) as { leftOpen?: boolean; sidebarOpen?: boolean };
    expect([saved.leftOpen, saved.sidebarOpen]).toEqual([false, true]);
    await win.getByTestId('left-toggle').click();
    await expect(win.getByTestId('left-column')).toBeVisible();

    // A second press on Settings closes the sidebar, and a press on Feedback opens it on Feedback.
    await win.getByTestId('panel-settings').click();
    await expect(win.locator('.sidebar')).toHaveCount(0);
    await win.getByTestId('panel-settings').click();
    await expect(win.getByRole('heading', { name: 'Sign-ins' })).toBeVisible();
    await win.getByTestId('sidebar-close').click();
    await expect(win.locator('.sidebar')).toHaveCount(0);

    // Selecting a Hatch opens the closed sidebar on the Hatch tab, and the comment tool opens it on Comments.
    await win.getByTestId('hatch-list').locator('li .row-main').first().click();
    await expect(win.getByTestId('panel-hatch')).toHaveAttribute('aria-selected', 'true');
    await win.getByTestId('sidebar-close').click();
    await win.getByTestId('add-comment').click();
    await expect(win.getByTestId('panel-comments')).toHaveAttribute('aria-selected', 'true');
    await win.keyboard.press('Escape');
  } finally {
    await app.close();
    await site.close();
  }
});

test('back and forward act on the selected page, and « and » step through the Hatches', async () => {
  const site = await serveSite();
  const { app, win } = await launch(freshHome());
  try {
    await openHatch(win, `${site.url}/index.html`);
    await openHatch(win, `${site.url}/index.html`);
    await openHatch(win, `${site.url}/index.html`);
    await expect(win.getByTestId('hatch-list').locator('li')).toHaveCount(3);
    const count = win.getByTestId('strip-count');
    await expect(count).toHaveText('Hatch 3 of 3');

    // » wraps from the last Hatch to the first, and « wraps back.
    await win.getByTestId('hatch-next').click();
    await expect(count).toHaveText('Hatch 1 of 3');
    await win.getByTestId('hatch-previous').click();
    await expect(count).toHaveText('Hatch 3 of 3');
    await win.getByTestId('hatch-previous').click();
    await expect(count).toHaveText('Hatch 2 of 3');

    // With nothing selected the count reads the total, and » starts at the first.
    await win.keyboard.press('Escape');
    await expect(count).toHaveText('3 Hatches');
    await win.getByTestId('hatch-next').click();
    await expect(count).toHaveText('Hatch 1 of 3');

    // In Fit to view the jump swaps the Hatch that fills the window.
    await win.getByTestId('fit-toggle').click();
    await expect(win.getByTestId('zoom-level')).toHaveText('Fit');
    await win.getByTestId('hatch-next').click();
    await expect(win.getByTestId('zoom-level')).toHaveText('Fit');
    await expect(win.locator('[data-testid="hatch-list"] li').nth(1)).toHaveClass(/current/);

    // Back and forward follow the selected Hatch's history and wait while it has none.
    await win.getByTestId('leave-fit').click();
    await expect(win.getByTestId('tool-back')).toBeDisabled();
    await expect(win.getByTestId('tool-forward')).toBeDisabled();
  } finally {
    await app.close();
    await site.close();
  }
});
