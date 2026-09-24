// A window whose renderer has died shows black and answers nothing. Hatch reloads its interface, which brings the saved workspace back.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { expect, test } from '@playwright/test';
import { freshHome, inPages, launch, openHatch, serveSite } from './helpers';

test('the interface comes back with its Hatches after its renderer dies, and an agent can carry on', async () => {
  const site = await serveSite();
  const home = freshHome();
  const { app, win } = await launch(home, 0);
  try {
    await openHatch(win, `${site.url}/index.html`);
    await expect.poll(async () => (await inPages<string>(app, 'document.title')).length).toBe(1);
    // The workspace saves 400 ms after a change.
    await win.waitForTimeout(700);

    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.forcefullyCrashRenderer());
    // Hatch opens a new window, so the Playwright page object for the old one is no use. The check goes through the main process,
    // in a plain loop: expect.poll never sees the new window when its first call lands during the swap.
    let up = false;
    for (let i = 0; i < 30 && !up; i++) {
      await new Promise((r) => setTimeout(r, 500));
      up = await app
        .evaluate(async ({ BrowserWindow }) => {
          const wins = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed() && !w.webContents.isCrashed());
          if (wins.length !== 1 || wins[0]!.webContents.isLoading()) return false;
          return wins[0]!.webContents.executeJavaScript('!!document.querySelector("[data-testid=canvas]")').catch(() => false) as Promise<boolean>;
        })
        .catch(() => false);
    }
    expect(up).toBe(true);
    await expect.poll(async () => (await inPages<string>(app, 'document.title')).length, { timeout: 15_000 }).toBe(1);
    await expect.poll(() => readFileSync(join(home, 'crash.log'), 'utf8')).toContain('renderer went away');

    const { url } = JSON.parse(readFileSync(join(home, 'server.json'), 'utf8'));
    const agent = new Client({ name: 'after', version: '1.0.0' });
    await agent.connect(new StreamableHTTPClientTransport(new URL(`${url}?agent=after`)));
    const status = ((await agent.callTool({ name: 'list_hatches', arguments: {} })) as { content: { text: string }[] }).content[0]!.text;
    expect(status).toContain('index.html');
    await agent.close();
  } finally {
    await app.close();
    await site.close();
  }
});
