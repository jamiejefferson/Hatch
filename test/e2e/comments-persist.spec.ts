// A comment belongs to the site's page, so it returns whenever that page opens: in a new Hatch, after a navigation, and after a restart.
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { expect, test } from '@playwright/test';
import { freshHome, launch, openHatch, serveSite } from './helpers';

test('a comment returns with its page in a new Hatch, after navigating away and back, and after a restart', async () => {
  const site = await serveSite();
  const home = freshHome();
  let { app, win } = await launch(home, 0);
  try {
    const { url } = JSON.parse(readFileSync(join(home, 'server.json'), 'utf8'));
    const agent = new Client({ name: 'pinner', version: '1.0.0' });
    await agent.connect(new StreamableHTTPClientTransport(new URL(`${url}?agent=pinner`)));
    const call = async (name: string, args: Record<string, unknown> = {}): Promise<string> => ((await agent.callTool({ name, arguments: args })) as { content: { text: string }[] }).content[0]!.text;
    await call('navigate', { to: `${site.url}/index.html` });
    const ref = (await call('snapshot')).split('\n').find((l) => l.includes('heading 1'))!.match(/\[(e\d+)\]/)![1]!;
    await call('add_comment', { ref, text: 'Make this heading warmer.' });
    await expect(win.getByTestId('pin-1')).toBeVisible();
    await call('finish_working');
    await agent.close();

    // A second Hatch on the same page shows the same comment.
    await openHatch(win, `${site.url}/index.html`);
    await expect(win.getByTestId('pin-1')).toHaveCount(2);

    // The same Hatch leaves the page and comes back.
    await win.getByTestId('link-field').fill(`${site.url}/docs.html`);
    await win.getByTestId('link-field').press('Enter');
    await expect(win.getByTestId('pin-1')).toHaveCount(1);
    await win.getByTestId('link-field').fill(`${site.url}/index.html`);
    await win.getByTestId('link-field').press('Enter');
    await expect(win.getByTestId('pin-1')).toHaveCount(2);

    await win.waitForTimeout(600);
    await app.close();
    ({ app, win } = await launch(home, 0));
    await expect(win.getByTestId('pin-1')).toHaveCount(2, { timeout: 10_000 });
  } finally {
    await app.close();
    await site.close();
  }
});

test('links and site comments land in the folders the user chose, and the saved links move with the choice', async () => {
  const site = await serveSite();
  const home = freshHome();
  const chosen = mkdtempSync(join(tmpdir(), 'hatch-chosen-'));
  const { app, win } = await launch(home, 0);
  try {
    await openHatch(win, `${site.url}/index.html`);
    await win.getByTestId('save-link').click();
    await expect.poll(() => existsSync(join(home, 'links.json'))).toBe(true);

    // The folder chooser is a macOS dialog, so the test sends the choice the dialog would return.
    await win.evaluate(`window.hatch.setSettings({ linksFolder: ${JSON.stringify(chosen)}, commentsFolder: ${JSON.stringify(chosen)} })`);
    await expect.poll(() => existsSync(join(chosen, 'links.json'))).toBe(true);
    expect(readFileSync(join(chosen, 'links.json'), 'utf8')).toContain('/index.html');
    await win.getByRole('tab', { name: 'Links' }).click();
    await expect(win.locator('.link-list li')).toHaveCount(1);

    const { url } = JSON.parse(readFileSync(join(home, 'server.json'), 'utf8'));
    const agent = new Client({ name: 'filer', version: '1.0.0' });
    await agent.connect(new StreamableHTTPClientTransport(new URL(`${url}?agent=filer`)));
    const call = async (name: string, args: Record<string, unknown> = {}): Promise<string> => ((await agent.callTool({ name, arguments: args })) as { content: { text: string }[] }).content[0]!.text;
    const ref = (await call('snapshot')).split('\n').find((l) => l.includes('heading 1'))!.match(/\[(e\d+)\]/)![1]!;
    await call('add_comment', { ref, text: 'Filed in the chosen folder.' });
    await agent.close();
    const siteFolder = readdirSync(chosen).find((n) => n.startsWith('127.0.0.1'))!;
    expect(readFileSync(join(chosen, siteFolder, 'index.html.md'), 'utf8')).toContain('Filed in the chosen folder.');
    expect(existsSync(join(home, 'sites'))).toBe(false);
  } finally {
    await app.close();
    await site.close();
  }
});
