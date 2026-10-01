// Duplicating a Hatch from its row, the menu and a Cmd-drag, and closing the selected Hatch with the Delete key.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { Workspace } from '@shared/types';
import { freshHome, launch, openHatch, serveSite } from './helpers';

const hatches = (home: string) => (JSON.parse(readFileSync(join(home, 'workspace.json'), 'utf8')) as Workspace).tabs[0]!.hatches;
const rows = (win: Page) => win.getByTestId('hatch-list').locator('li');

test('a Hatch duplicates from its row, the menu and a Cmd-drag, and Delete closes the selected one', async () => {
  const site = await serveSite();
  const home = freshHome();
  const { app, win } = await launch(home);
  try {
    await openHatch(win, `${site.url}/index.html`);
    await expect(rows(win)).toHaveCount(1);

    // The row's duplicate button opens the same page at the same size, to the right, and selects it.
    await rows(win).first().hover();
    await rows(win).first().getByRole('button', { name: /^Duplicate/ }).click();
    await expect(rows(win)).toHaveCount(2);
    await expect(rows(win).nth(1)).toHaveClass(/current/);
    await win.waitForTimeout(700);
    const [first, second] = hatches(home);
    expect(second!.url).toBe(first!.url);
    expect([second!.width, second!.height]).toEqual([first!.width, first!.height]);
    expect(second!.x).toBeGreaterThan(first!.x + first!.width);

    // Cmd+D from the File menu duplicates the selected Hatch.
    await app.evaluate(({ Menu }) => {
      const file = Menu.getApplicationMenu()!.items.find((i) => i.label === 'File')!;
      file.submenu!.items.find((i) => i.label === 'Duplicate Hatch')!.click();
    });
    await expect(rows(win)).toHaveCount(3);

    // A Cmd-drag on a Hatch's title leaves it in place and drops a copy where the pointer lets go.
    await win.getByTestId('show-all').click();
    const id = hatches(home)[0]!.id;
    const title = win.getByTestId(`header-${id}`);
    const box = (await title.boundingBox())!;
    const before = hatches(home)[0]!;
    await win.keyboard.down('Meta');
    await win.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await win.mouse.down();
    await win.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 120, { steps: 6 });
    await win.mouse.up();
    await win.keyboard.up('Meta');
    await expect(rows(win)).toHaveCount(4);
    await win.waitForTimeout(700);
    const after = hatches(home);
    expect(after[0]).toMatchObject({ x: before.x, y: before.y });
    expect(after[3]!.x).toBe(before.x);
    expect(after[3]!.y).toBeGreaterThan(before.y);

    // Delete closes the selected Hatch while the focus sits in Hatch's own interface.
    await win.getByTestId('toolbar').click({ position: { x: 4, y: 300 } });
    await win.keyboard.press('Backspace');
    await expect(rows(win)).toHaveCount(3);

    // Typing in a field never closes a Hatch.
    await win.getByTestId(`header-${id}`).click();
    await win.getByTestId('link-field').focus();
    await win.keyboard.press('Backspace');
    await expect(rows(win)).toHaveCount(3);
  } finally {
    await app.close();
    await site.close();
  }
});
