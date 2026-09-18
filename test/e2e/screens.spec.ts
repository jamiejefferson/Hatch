// Captures the main states as images, so a person or an agent can compare them with the design screens.
import { mkdirSync } from 'node:fs';
import { test, type ElectronApplication, type Page } from '@playwright/test';
import { capture, freshHome, launch, openHatch, serveSite } from './helpers';

const OUT = process.env.HATCH_SCREENS ?? 'test-results/screens';

test('capture the canvas, Fit to view, the collapsed sidebar and the New Hatch modal', async () => {
  mkdirSync(OUT, { recursive: true });
  const site = await serveSite();
  let app: ElectronApplication | undefined;
  try {
    let win: Page;
    ({ app, win } = await launch(freshHome()));
    await capture(app, `${OUT}/0-empty.png`);
    await openHatch(win, `${site.url}/index.html`);
    await openHatch(win, `${site.url}/docs.html`);
    await win.getByTestId('template-tablet').click();
    await win.locator('[data-testid^="shield-"]').click();
    await win.waitForTimeout(500);
    await capture(app, `${OUT}/1-canvas.png`);

    await win.getByTestId('fit-toggle').click();
    await win.waitForTimeout(500);
    await capture(app, `${OUT}/2-fit.png`);
    await win.getByTestId('fit-toggle').click();

    await win.getByRole('button', { name: 'Show all Hatches' }).click();
    await win.getByTestId('show-all').click();
    await win.waitForTimeout(400);
    await capture(app, `${OUT}/1b-hatches.png`);
    await win.getByTestId('hatch-list').locator('.hatch-row').first().click();

    await win.getByTestId('sidebar-toggle').click();
    await win.waitForTimeout(300);
    await capture(app, `${OUT}/3-sidebar-collapsed.png`);
    await win.getByTestId('sidebar-toggle').click();

    await win.getByTestId('save-link').click();
    await win.getByTestId('new-hatch').click();
    await win.waitForTimeout(300);
    await capture(app, `${OUT}/4-new-hatch.png`);
  } finally {
    await app?.close();
    await site.close();
  }
});
