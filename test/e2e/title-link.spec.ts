// A click on a Hatch's title turns it into the page's link, on the canvas and in Fit to view.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Workspace } from '@shared/types';
import { freshHome, launch, openHatch, serveSite } from './helpers';

const hatches = (home: string) => (JSON.parse(readFileSync(join(home, 'workspace.json'), 'utf8')) as Workspace).tabs[0]!.hatches;

test('a click on the title edits the link, Enter goes there and Esc puts the title back', async () => {
  const site = await serveSite();
  const home = freshHome();
  const { app, win } = await launch(home);
  try {
    await openHatch(win, `${site.url}/index.html`);
    await win.waitForTimeout(700);
    const id = hatches(home)[0]!.id;

    // On the canvas: the title becomes a field holding the link, all of it selected.
    await win.getByTestId(`title-${id}`).click();
    const field = win.getByTestId(`title-link-${id}`);
    await expect(field).toBeFocused();
    await expect(field).toHaveValue(`${site.url}/index.html`);
    await win.keyboard.type(`${site.url}/docs.html`);
    await win.keyboard.press('Enter');
    await expect(field).toHaveCount(0);
    await expect(win.getByTestId('link-field')).toHaveValue(`${site.url}/docs.html`);

    // Esc leaves the page where it is.
    await win.getByTestId(`title-${id}`).click();
    await win.keyboard.type('nowhere');
    await win.keyboard.press('Escape');
    await expect(win.getByTestId(`title-link-${id}`)).toHaveCount(0);
    await expect(win.getByTestId('link-field')).toHaveValue(`${site.url}/docs.html`);

    // A drag on the title still moves the Hatch and opens no field.
    const box = (await win.getByTestId(`title-${id}`).boundingBox())!;
    const before = hatches(home)[0]!;
    await win.mouse.move(box.x + 10, box.y + box.height / 2);
    await win.mouse.down();
    await win.mouse.move(box.x + 10, box.y + box.height / 2 + 80, { steps: 6 });
    await win.mouse.up();
    await expect(win.getByTestId(`title-link-${id}`)).toHaveCount(0);
    await win.waitForTimeout(700);
    expect(hatches(home)[0]!.y).toBeGreaterThan(before.y);

    // In Fit to view the title in the top strip does the same.
    await win.getByTestId('fit-toggle').click();
    await win.getByTestId(`title-${id}`).click();
    await expect(win.getByTestId(`title-link-${id}`)).toBeFocused();
    await win.keyboard.type(`${site.url}/index.html`);
    await win.keyboard.press('Enter');
    await expect(win.getByTestId('link-field')).toHaveValue(`${site.url}/index.html`);
  } finally {
    await app.close();
    await site.close();
  }
});
