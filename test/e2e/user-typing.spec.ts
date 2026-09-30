// The user's own keystrokes must reach the page they click into. After the user touched Hatch's interface or another
// app, a real click left the keyboard with Hatch's body and every key went nowhere (trial feedback, 29 Sep 2026).
// Only real input shows this: Playwright's keyboard and sendInputEvent on the window never reach a webview. So the test
// shows the window, clicks through CoreGraphics and types through System Events, which needs Accessibility access for
// the terminal. It runs when HATCH_SHOW=1 and types only while this Hatch is the frontmost app.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { freshHome, inPages, launch, openHatch, serveSite } from './helpers';

test.skip(!process.env.HATCH_SHOW, 'Real keyboard input needs a shown window: run with HATCH_SHOW=1.');

const CLICK = join('test-results', 'real-input', 'click');

function osa(...lines: string[]): string {
  return execFileSync('osascript', lines.flatMap((l) => ['-e', l])).toString().trim();
}

async function toFront(app: ElectronApplication): Promise<void> {
  const pid = await app.evaluate(() => process.pid);
  osa(`tell application "System Events" to set frontmost of (first process whose unix id is ${pid}) to true`, 'delay 0.4');
}

/** Clicks the element a selector names inside the first page, with the real pointer. */
async function realClick(app: ElectronApplication, win: Page, selector: string): Promise<void> {
  const content = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getContentBounds());
  const r = (await inPages<{ x: number; y: number }>(app, `(() => { const b = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: b.left + 20, y: b.top + b.height / 2 }; })()`))[0]!;
  const view = (await win.locator('webview').first().boundingBox())!;
  const scale = await win.evaluate<number>(`(() => { const w = document.querySelector('webview'); return w.getBoundingClientRect().width / w.offsetWidth; })()`);
  execFileSync(CLICK, [String(content.x + view.x + r.x * scale), String(content.y + view.y + r.y * scale)]);
  await win.waitForTimeout(600);
}

/** Types at the end of the focused field: Command+Right Arrow first, because the click may have put the caret mid-word. */
function type(text: string): void {
  const front = osa('tell application "System Events" to set p to name of first process whose frontmost is true', 'if p is "Electron" then', 'tell application "System Events" to key code 124 using command down', `tell application "System Events" to keystroke "${text}"`, 'end if', 'return p');
  if (front !== 'Electron') throw new Error(`${front} is in front, so the test typed nothing.`);
}

test('the user types into a page after clicking it, after using Hatch panels and after switching apps', async () => {
  if (!existsSync(CLICK)) {
    mkdirSync(join('test-results', 'real-input'), { recursive: true });
    execFileSync('swiftc', ['-O', join('test', 'e2e', 'real-input', 'click.swift'), '-o', CLICK]);
  }
  const site = await serveSite();
  const { app, win } = await launch(freshHome());
  const value = async (): Promise<string> => (await inPages<string>(app, `document.querySelector('[name=email]').value`))[0]!;
  try {
    await openHatch(win, `${site.url}/login.html`);
    await win.waitForTimeout(1500);
    await toFront(app);

    // The first tap selects the Hatch, and the second reaches the page.
    await realClick(app, win, '[name=email]');
    await realClick(app, win, '[name=email]');
    type('sam');
    await expect.poll(value).toBe('sam');

    // A click in Hatch's interface takes the keyboard. A click back in the page returns it.
    await win.getByTestId('panel-hatch').click();
    await realClick(app, win, '[name=email]');
    type('@studio');
    await expect.poll(value).toBe('sam@studio');

    // Another app takes the keyboard, and a click in the page after coming back returns it.
    osa('tell application "Finder" to activate', 'delay 0.4');
    await toFront(app);
    await realClick(app, win, '[name=email]');
    type('.example');
    await expect.poll(value).toBe('sam@studio.example');
  } finally {
    await app.close();
    await site.close();
  }
});
