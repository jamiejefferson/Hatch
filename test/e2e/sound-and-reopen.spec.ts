// The speaker beside a Hatch's title mutes its sound, the mute lasts, and a closed Hatch or canvas comes back.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type ElectronApplication } from '@playwright/test';
import type { Workspace } from '@shared/types';
import { freshHome, launch, openHatch, serveSite } from './helpers';

// The interface writes the workspace a moment after each change, so the first reads may find no file.
const workspace = (home: string): Workspace => {
  try {
    return JSON.parse(readFileSync(join(home, 'workspace.json'), 'utf8')) as Workspace;
  } catch {
    return { version: 1, tabs: [{ id: '', hatches: [], selectedHatchId: null, pan: { x: 0, y: 0 }, zoom: 1 }], activeTabId: '', sidebarOpen: true };
  }
};
const muted = (app: ElectronApplication) =>
  app.evaluate(({ webContents }) => webContents.getAllWebContents().find((w) => w.getURL().endsWith('/sound.html'))?.isAudioMuted() ?? null);
const fileMenu = (app: ElectronApplication, label: string) =>
  app.evaluate(({ Menu }, label) => {
    const file = Menu.getApplicationMenu()!.items.find((i) => i.label === 'File')!;
    file.submenu!.items.find((i) => i.label === label)!.click();
  }, label);

test('the speaker on a playing Hatch mutes it, and a closed Hatch and a closed canvas reopen as they were', async () => {
  const site = await serveSite();
  const home = freshHome();
  const { app, win } = await launch(home);
  try {
    await openHatch(win, `${site.url}/sound.html`);
    await expect.poll(() => workspace(home).tabs[0]!.hatches.length).toBe(1);
    const id = workspace(home).tabs[0]!.hatches[0]!.id;

    // The speaker shows while the page plays, and a press mutes the page.
    const speaker = win.getByTestId(`sound-${id}`);
    await expect(speaker).toHaveAttribute('aria-label', 'Mute this Hatch', { timeout: 10_000 });
    await speaker.click();
    await expect(speaker).toHaveAttribute('aria-label', 'Let this Hatch play sound');
    await expect.poll(() => muted(app)).toBe(true);
    await expect.poll(() => workspace(home).tabs[0]!.hatches[0]!.muted).toBe(true);

    // A second press lets it play, and the right-click menu mutes it again.
    await speaker.click();
    await expect.poll(() => muted(app)).toBe(false);
    await win.getByTestId(`header-${id}`).click({ button: 'right', position: { x: 40, y: 10 } });
    await win.getByTestId('menu-mute').click();
    await expect.poll(() => muted(app)).toBe(true);

    // A closed Hatch lists under Recently closed, and Cmd+Shift+T brings it back at its place, still muted.
    const before = workspace(home).tabs[0]!.hatches[0]!;
    await win.getByTestId(`bar-close-${id}`).click();
    await expect(win.getByTestId('hatch-list').locator('li')).toHaveCount(0);
    await expect(win.getByTestId('closed-list').locator('li')).toHaveCount(1);
    await fileMenu(app, 'Reopen Closed Hatch or Canvas');
    await expect(win.getByTestId('hatch-list').locator('li')).toHaveCount(1);
    await expect(win.getByTestId('recently-closed')).toHaveCount(0);
    await expect.poll(() => workspace(home).tabs[0]!.hatches[0]?.url).toBe(before.url);
    expect(workspace(home).tabs[0]!.hatches[0]).toMatchObject({ x: before.x, y: before.y, width: before.width, height: before.height, muted: true });
    await expect.poll(() => muted(app)).toBe(true);

    // A closed canvas comes back from its row with its Hatch.
    await win.getByTestId('new-canvas').click();
    await expect(win.getByTestId('canvas-list').locator('li')).toHaveCount(2);
    await win.getByTestId('canvas-list').locator('li').first().hover();
    await win.getByTestId('canvas-list').locator('li').first().getByRole('button', { name: /^Close/ }).click();
    await expect(win.getByTestId('canvas-list').locator('li')).toHaveCount(1);
    await win.getByTestId('closed-list').locator('li').first().getByRole('button').click();
    await expect(win.getByTestId('canvas-list').locator('li')).toHaveCount(2);
    await expect(win.getByTestId('canvas-list').locator('li').first()).toHaveClass(/current/);
    await expect(win.getByTestId('hatch-list').locator('li')).toHaveCount(1);

    // Closing the last canvas leaves an empty one, which the reopened canvas replaces.
    await win.getByTestId('canvas-list').locator('li').nth(1).hover();
    await win.getByTestId('canvas-list').locator('li').nth(1).getByRole('button', { name: /^Close/ }).click();
    await fileMenu(app, 'Close Tab');
    await expect(win.getByTestId('hatch-list').locator('li')).toHaveCount(0);
    await fileMenu(app, 'Reopen Closed Hatch or Canvas');
    await expect(win.getByTestId('canvas-list').locator('li')).toHaveCount(1);
    await expect(win.getByTestId('hatch-list').locator('li')).toHaveCount(1);
  } finally {
    await app.close();
    await site.close();
  }
});
