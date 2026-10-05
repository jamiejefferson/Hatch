// Action buttons open a web app the user reaches for often. Each sits in the toolbar with an icon the user picks,
// opens its app in Fit to view, and a second press returns to the Hatch it opened (the user, 5 Oct 2026).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Settings, Workspace } from '@shared/types';
import { capture, freshHome, launch, serveSite } from './helpers';

const read = <T>(home: string, file: string): T => JSON.parse(readFileSync(join(home, file), 'utf8')) as T;

test('the user adds an action button, it opens its app in Fit to view, returns to the same Hatch, and edits and removes', async () => {
  const site = await serveSite();
  const home = freshHome();
  let { app, win } = await launch(home, 0);
  try {
    // A new button takes a name, an address and an icon.
    await win.getByTestId('add-action').click();
    await expect(win.getByTestId('action-editor')).toBeVisible();
    await win.getByTestId('action-save').click();
    await expect(win.getByRole('alert')).toContainText('Give the button a name.');
    await win.getByTestId('action-name').fill('Spreadsheet');
    await expect(win.getByRole('alert')).toHaveCount(0);
    await win.getByTestId('action-url').fill(`${site.url}/gallery.html`);
    await win.getByTestId('action-icon-spreadsheet').click();
    await capture(app, 'test-results/screens/action-editor.png');
    await win.getByTestId('action-save').click();
    await expect(win.getByTestId('action-editor')).toBeHidden();

    const [button] = read<Settings>(home, 'settings.json').actionButtons;
    expect(button).toMatchObject({ name: 'Spreadsheet', url: `${site.url}/gallery.html`, icon: 'spreadsheet' });
    const press = win.getByRole('button', { name: 'Open Spreadsheet' });

    // A press opens the app in a Hatch that fills the window.
    await press.click();
    await expect(win.getByTestId('zoom-level')).toHaveText('Fit');
    await expect(press).toHaveAttribute('aria-pressed', 'true');
    // The pressed button keeps the accent under the pointer, which rests on it after the click.
    expect(await press.evaluate((el) => el.ownerDocument.defaultView!.getComputedStyle(el).backgroundColor)).toBe('rgb(233, 197, 52)');
    await expect.poll(() => read<Workspace>(home, 'workspace.json').tabs[0]!.hatches.map((h) => [h.action, h.template])).toEqual([[button!.id, 'fit']]);
    await capture(app, 'test-results/screens/action-open.png');

    // Leaving Fit to view and pressing again returns to the same Hatch, so the app keeps its place.
    await win.keyboard.press('Escape');
    await expect(win.getByTestId('zoom-level')).not.toHaveText('Fit');
    await press.click();
    await expect(win.getByTestId('zoom-level')).toHaveText('Fit');
    await expect.poll(() => read<Workspace>(home, 'workspace.json').tabs[0]!.hatches.length).toBe(1);
  } finally {
    await app.close();
  }

  // The button and the Hatch it opened survive a restart, and a press still finds that Hatch.
  ({ app, win } = await launch(home, 0));
  try {
    const press = win.getByRole('button', { name: 'Open Spreadsheet' });
    await expect(press).toBeVisible();
    await win.keyboard.press('Escape');
    await press.click();
    await expect(win.getByTestId('zoom-level')).toHaveText('Fit');
    expect(read<Workspace>(home, 'workspace.json').tabs[0]!.hatches).toHaveLength(1);

    // A right-click edits the button, and the editor removes it.
    await press.click({ button: 'right' });
    await expect(win.getByTestId('action-name')).toHaveValue('Spreadsheet');
    await win.getByTestId('action-name').fill('Sheets');
    await win.getByTestId('action-icon-chart').click();
    await win.getByTestId('action-save').click();
    await expect(win.getByRole('button', { name: 'Open Sheets' })).toBeVisible();
    expect(read<Settings>(home, 'settings.json').actionButtons[0]).toMatchObject({ name: 'Sheets', icon: 'chart' });

    await win.getByRole('button', { name: 'Open Sheets' }).click({ button: 'right' });
    await win.getByTestId('action-remove').click();
    await expect(win.getByRole('button', { name: 'Open Sheets' })).toHaveCount(0);
    expect(read<Settings>(home, 'settings.json').actionButtons).toEqual([]);
  } finally {
    await app.close();
    await site.close();
  }
});
