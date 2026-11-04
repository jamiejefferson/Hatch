// The comment tool stays on through any number of comments, until the user presses it again, presses Esc or double-clicks the empty canvas.
import { expect, test, type Page } from '@playwright/test';
import { capture, freshHome, inPages, launch, openHatch, serveSite } from './helpers';

/** Clicks through the comment tool's shield onto the page's element, whatever the canvas zoom. */
async function pickElement(win: Page, app: Parameters<typeof inPages>[0], selector: string, pageIndex = 0): Promise<void> {
  const rects = await inPages<{ x: number; y: number; width: number }>(app, `(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, width: innerWidth }; })()`);
  const rect = rects[pageIndex]!;
  const shield = win.locator('.pick-shield');
  const box = (await shield.boundingBox())!;
  const zoom = box.width / rect.width;
  await shield.click({ position: { x: rect.x * zoom, y: rect.y * zoom } });
}

async function comment(win: Page, app: Parameters<typeof inPages>[0], selector: string, text: string, pageIndex = 0): Promise<void> {
  await pickElement(win, app, selector, pageIndex);
  await expect(win.getByTestId('draft')).toBeVisible();
  await win.getByTestId('composer').fill(text);
  await win.getByTestId('composer').press('Enter');
  await expect(win.getByTestId('draft')).toHaveCount(0);
}

/** A point in the window where the canvas shows this element, with nothing over it. */
function spotOn(win: Page, css: string): Promise<{ x: number; y: number }> {
  return win.evaluate<{ x: number; y: number }>(`(() => {
    const box = document.querySelector('[data-testid="canvas"]').getBoundingClientRect();
    for (let y = box.bottom - 20; y > box.top; y -= 40) for (let x = box.right - 20; x > box.left; x -= 40) if (document.elementFromPoint(x, y)?.matches(${JSON.stringify(css)})) return { x, y };
    throw new Error('The canvas does not show ' + ${JSON.stringify(css)});
  })()`);
}

test('the tool stays on for one comment after another, and each way out turns it off', async () => {
  const site = await serveSite();
  const { app, win } = await launch(freshHome());
  const tool = win.getByTestId('add-comment');
  try {
    await openHatch(win, site.url);
    await expect(win.locator('webview')).toHaveCount(1);
    await expect.poll(async () => (await inPages<string>(app, 'document.readyState'))[0]).toBe('complete');

    await tool.click();
    await expect(tool).toHaveAttribute('aria-pressed', 'true');
    await expect(win.getByTestId('pick-hint')).toContainText('double-click the canvas');
    await capture(app, 'test-results/screens/comment-tool-on.png');

    // Two comments from one press. Each lands as a pin, and no thread covers the page.
    await comment(win, app, 'h1', 'Shorten this heading.');
    await expect(win.getByTestId('pin-1')).toBeVisible();
    await expect(win.getByTestId('thread')).toHaveCount(0);
    await expect(tool).toHaveAttribute('aria-pressed', 'true');
    // The hint has done its job by now, and it would cover the page between comments.
    await expect(win.getByTestId('pick-hint')).toHaveCount(0);
    await comment(win, app, '.plan:nth-child(2) button', 'Say what the trial includes.');
    await expect(win.getByTestId('pin-2')).toBeVisible();
    await expect(tool).toHaveAttribute('aria-pressed', 'true');

    // A click on another element moves an open draft there, and the words stay.
    await pickElement(win, app, 'h1');
    await win.getByTestId('composer').fill('Half a thought');
    await pickElement(win, app, '.plan:nth-child(1) h2');
    await expect(win.getByTestId('draft')).toContainText('Solo');
    await expect(win.getByTestId('composer')).toHaveValue('Half a thought');
    await expect(win.getByTestId('composer')).toBeFocused();

    // Esc takes the draft first, and the tool second.
    await win.keyboard.press('Escape');
    await expect(win.getByTestId('draft')).toHaveCount(0);
    await expect(tool).toHaveAttribute('aria-pressed', 'true');
    await win.keyboard.press('Escape');
    await expect(tool).toHaveAttribute('aria-pressed', 'false');
    await expect(win.locator('.pick-shield')).toHaveCount(0);

    // With the tool off, a pin opens its thread and the next comment opens as before.
    await win.getByTestId('pin-1').click();
    await expect(win.getByTestId('thread')).toContainText('Shorten this heading');
    await win.getByRole('button', { name: 'Close this thread' }).click();

    // A pin stays readable with the tool on, and the tool survives it. The hint returns with the new press.
    await tool.click();
    await expect(win.getByTestId('pick-hint')).toBeVisible();
    await win.getByTestId('pin-2').click();
    await expect(win.getByTestId('thread')).toContainText('Say what the trial includes');
    await expect(tool).toHaveAttribute('aria-pressed', 'true');
    await pickElement(win, app, 'h1');
    await expect(win.getByTestId('thread')).toHaveCount(0);
    await expect(win.getByTestId('draft')).toBeVisible();

    // A second press turns it off and takes the empty draft with it.
    await tool.click();
    await expect(tool).toHaveAttribute('aria-pressed', 'false');
    await expect(win.getByTestId('draft')).toHaveCount(0);

    // A draft with words in it outlives the tool, and pinning it opens its thread.
    await tool.click();
    await pickElement(win, app, 'h1');
    await win.getByTestId('composer').fill('Keep these words');
    await tool.click();
    await expect(win.getByTestId('composer')).toHaveValue('Keep these words');
    await win.getByTestId('composer').press('Enter');
    await expect(win.getByTestId('thread')).toContainText('Keep these words');
    await win.getByRole('button', { name: 'Close this thread' }).click();

    // A single tap on empty canvas changes nothing. A double-click turns the tool off, keeps the Hatch selected and opens no New Hatch box.
    await tool.click();
    const spot = await spotOn(win, '[data-testid="canvas"]');
    await win.mouse.click(spot.x, spot.y);
    await win.waitForTimeout(450);
    await expect(tool).toHaveAttribute('aria-pressed', 'true');
    await expect(tool).toBeEnabled();
    await win.mouse.dblclick(spot.x, spot.y);
    await expect(tool).toHaveAttribute('aria-pressed', 'false');
    await expect(win.locator('.pick-shield')).toHaveCount(0);
    await expect(tool).toBeEnabled();
    await expect(win.getByTestId('new-hatch-modal')).toBeHidden();

    // With the tool off, a double-click on empty canvas opens New Hatch as it always has.
    await win.mouse.dblclick(spot.x, spot.y);
    await expect(win.getByTestId('new-hatch-modal')).toBeVisible();
    await win.keyboard.press('Escape');
  } finally {
    await app.close();
    await site.close();
  }
});

test('a scroll over the page moves it while the tool is on', async () => {
  const site = await serveSite();
  const { app, win } = await launch(freshHome());
  try {
    await openHatch(win, `${site.url}/long.html`);
    await expect.poll(async () => (await inPages<string>(app, 'document.readyState'))[0]).toBe('complete');
    await win.getByTestId('add-comment').click();
    const shield = (await win.locator('.pick-shield').boundingBox())!;
    const before = await win.locator('.world').getAttribute('style');
    await win.mouse.move(shield.x + shield.width / 2, shield.y + shield.height / 2);
    await win.mouse.wheel(0, 400);
    await expect.poll(async () => (await inPages<number>(app, 'scrollY'))[0], { timeout: 5000 }).toBeGreaterThan(0);
    // The page scrolled and the canvas stayed where it was.
    expect(await win.locator('.world').getAttribute('style')).toBe(before);
    await expect(win.getByTestId('add-comment')).toHaveAttribute('aria-pressed', 'true');
  } finally {
    await app.close();
    await site.close();
  }
});

test('the tool follows the user to another Hatch, ends with its Hatch or its canvas, and gives way to the note and grab tools', async () => {
  const site = await serveSite();
  const { app, win } = await launch(freshHome());
  const tool = win.getByTestId('add-comment');
  try {
    await openHatch(win, site.url);
    await openHatch(win, `${site.url}/docs.html`);
    await expect(win.locator('webview')).toHaveCount(2);
    await expect.poll(async () => (await inPages<string>(app, 'document.readyState')).every((s) => s === 'complete')).toBe(true);

    // Both pages on screen, because a new Hatch pans the canvas to itself.
    await win.getByTestId('show-all').click();
    await tool.click();
    await expect(tool).toHaveAttribute('aria-pressed', 'true');
    const second = win.locator('.pick-shield');
    const from = await second.getAttribute('data-hatch');

    // A tap on the other Hatch moves the tool there, and the next click pins a comment on it.
    const otherId = await win.locator(`.shield:not([data-hatch="${from}"])`).first().getAttribute('data-hatch');
    const spot = await spotOn(win, `.shield[data-hatch="${otherId}"]`);
    await win.mouse.click(spot.x, spot.y);
    await expect(tool).toHaveAttribute('aria-pressed', 'true');
    await expect(second).toHaveAttribute('data-hatch', otherId!);
    await comment(win, app, 'h1', 'Comment on the first page.');
    await expect(win.getByTestId('pin-1')).toBeVisible();

    // The note tool and the tool for Paper each replace it.
    await win.getByTestId('add-note').click();
    await expect(tool).toHaveAttribute('aria-pressed', 'false');
    await tool.click();
    await expect(win.getByTestId('add-note')).toHaveAttribute('aria-pressed', 'false');
    await expect(tool).toHaveAttribute('aria-pressed', 'true');
    await win.getByTestId('grab-element').click();
    await expect(tool).toHaveAttribute('aria-pressed', 'false');
    await win.keyboard.press('Escape');
    await expect(win.locator('.pick-shield')).toHaveCount(0);

    // Closing the Hatch ends the tool, and the button waits for a selection.
    await tool.click();
    await expect(tool).toHaveAttribute('aria-pressed', 'true');
    await win.locator('.pick-shield').waitFor();
    await win.evaluate('document.activeElement?.blur()');
    await win.keyboard.press('Delete');
    await expect(win.locator('webview')).toHaveCount(1);
    await expect(tool).toHaveAttribute('aria-pressed', 'false');
    await expect(tool).toBeDisabled();
  } finally {
    await app.close();
    await site.close();
  }
});
