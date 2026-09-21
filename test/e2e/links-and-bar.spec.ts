// The link a user copies for an agent, the control bar's Close button and its zoomed-out form, and the start-up sequence.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { expect, test } from '@playwright/test';
import { capture, freshHome, inPages, launch, openHatch, serveSite, showCanvasPanel } from './helpers';

test('a copied Hatch link takes an agent to that exact Hatch, in a tab it did not hold', async () => {
  const site = await serveSite();
  const home = freshHome();
  const { app, win } = await launch(home, 0);
  const { url } = JSON.parse(readFileSync(join(home, 'server.json'), 'utf8'));
  const clipboard = (): Promise<string> => app.evaluate(({ clipboard: c }) => c.readText());
  try {
    await openHatch(win, `${site.url}/index.html`);
    const bar = win.locator('[data-testid^="header-"]');
    await bar.click({ button: 'right' });
    await win.getByTestId('copy-hatch-link').click();
    await expect(win.getByText('Link to this Hatch copied')).toBeVisible();
    const link = await clipboard();
    expect(link).toMatch(/^hatch:@hatch_\w+$/);

    // The same menu saves the page to Links, once.
    await bar.click({ button: 'right' });
    await win.getByTestId('menu-save-link').click();
    await expect(win.getByText('Hatch saved this link in Links.')).toBeVisible();
    expect(JSON.parse(readFileSync(join(home, 'links.json'), 'utf8')).map((l: { url: string }) => l.url)).toContain(`${site.url}/index.html`);
    await bar.click({ button: 'right' });
    await expect(win.getByTestId('menu-save-link')).toBeDisabled();
    await expect(win.getByTestId('menu-save-link')).toHaveText('This link is saved in Links');
    await win.keyboard.press('Escape');

    await win.getByTestId('canvas').first().click({ button: 'right', position: { x: 20, y: 500 } });
    await win.getByTestId('copy-canvas-link').click();
    expect(await clipboard()).toMatch(/^hatch:@tab_\w+$/);

    // The user moves to a second tab, which is the one a new agent would otherwise claim.
    await win.getByRole('button', { name: 'New tab' }).click();
    await openHatch(win, `${site.url}/docs.html`);

    const agent = new Client({ name: 'pointed', version: '1.0.0' });
    await agent.connect(new StreamableHTTPClientTransport(new URL(`${url}?agent=pointed`)));
    const call = async (name: string, args: Record<string, unknown> = {}): Promise<string> => ((await agent.callTool({ name, arguments: args })) as { content: { text: string }[] }).content[0]!.text;
    expect(await call('select_hatch', { hatch: link })).toContain(link.slice('hatch:@'.length));
    expect(await call('snapshot')).toContain('Simple pricing');
    expect(await call('list_hatches')).not.toContain('docs.html');
    await agent.close();
  } finally {
    await app.close();
    await site.close();
  }
});

test('the control bar closes its Hatch, and a zoomed-out canvas shows the title until the pointer reaches it', async () => {
  const site = await serveSite();
  const { app, win } = await launch(freshHome(), 0);
  try {
    await openHatch(win, `${site.url}/index.html`);
    await openHatch(win, `${site.url}/docs.html`);
    await expect(win.locator('.hatch-bar')).toHaveCount(1);

    // Two steps out from 62% is 40%, below the point where the bar gives way to the title.
    await showCanvasPanel(win);
    await win.getByRole('button', { name: 'Zoom out' }).click();
    await win.getByRole('button', { name: 'Zoom out' }).click();
    await expect(win.getByTestId('zoom-level')).toHaveText('40%');
    await win.getByTestId('hatch-list').locator('.hatch-row').last().click();
    await expect(win.locator('.hatch-bar')).toHaveCount(0);
    await win.locator('.hatch-label.selected').hover();
    await expect(win.locator('.hatch-bar')).toHaveCount(1);

    await win.locator('[data-testid^="bar-close-"]').click();
    await expect.poll(async () => (await inPages<string>(app, 'document.title')).length).toBe(1);
  } finally {
    await app.close();
    await site.close();
  }
});

test('the start-up sequence shows the logo, the strapline and the version, then leaves', async () => {
  const { app, win } = await launch(freshHome(), 0, { HATCH_INTRO: '1' });
  try {
    const intro = win.getByTestId('intro');
    await expect(intro).toBeVisible();
    await expect(intro.getByText('Open the Web')).toBeVisible();
    await expect(intro.getByText(/^Version \d+\.\d+\.\d+$/)).toBeVisible();
    await win.waitForTimeout(900);
    await capture(app, 'test-results/screens/18-intro.png');
    await expect(intro).toHaveCount(0, { timeout: 5000 });
  } finally {
    await app.close();
  }
});

test('a pop-up is blocked on the canvas with a way into Fit to view, and opens there', async () => {
  const site = await serveSite();
  const { app, win } = await launch(freshHome(), 0);
  const said = async (): Promise<string> => (await inPages<string>(app, "document.getElementById('said').textContent"))[0]!;
  const press = (): Promise<unknown> => inPages(app, "document.getElementById('provider').click()");
  try {
    await openHatch(win, `${site.url}/popup-login.html`);
    await expect.poll(async () => (await inPages<string>(app, 'document.title'))[0]).toContain('Sign in');
    await press();
    await expect(win.getByTestId('popup-blocked')).toBeVisible();
    expect(await said()).toBe('The pop-up was blocked');
    // The page stays where it was: a pop-up never loads in the Hatch itself.
    expect((await inPages<string>(app, 'location.pathname'))[0]).toBe('/popup-login.html');

    await win.getByTestId('popup-fit').click();
    await expect(win.locator('.tab .fit-bar')).toBeVisible();
    await expect(win.getByTestId('popup-blocked')).toHaveCount(0);
    await press();
    // The provider window answers its opener and closes, which only a real pop-up can do.
    await expect.poll(said).toBe('Signed in as sam@studio.example');
  } finally {
    await app.close();
    await site.close();
  }
});

test('a double tap on empty canvas opens a new Hatch where the user tapped', async () => {
  const site = await serveSite();
  const home = freshHome();
  const { app, win } = await launch(home, 0);
  try {
    await openHatch(win, `${site.url}/index.html`);
    const canvas = (await win.getByTestId('canvas').first().boundingBox())!;
    await win.mouse.dblclick(canvas.x + 80, canvas.y + canvas.height - 120);
    await win.getByTestId('new-hatch-url').fill(`${site.url}/docs.html`);
    await win.getByTestId('new-hatch-url').press('Enter');
    await expect.poll(async () => (await inPages<string>(app, 'document.title')).length).toBe(2);
    // The workspace saves 400 ms after a change.
    await win.waitForTimeout(700);
    const hatches = (JSON.parse(readFileSync(join(home, 'workspace.json'), 'utf8')) as { tabs: { hatches: { x: number; y: number }[] }[] }).tabs[0]!.hatches;
    // The first Hatch sits at the top of the canvas, and the new one sits far below it, under the tap.
    expect(hatches[1]!.y).toBeGreaterThan(hatches[0]!.y + 600);
  } finally {
    await app.close();
    await site.close();
  }
});

test('an agent takes an element out of a page: markup, CSS and an image, and reads around an element with no outline', async () => {
  const site = await serveSite();
  const home = freshHome();
  const { app, win } = await launch(home, 0);
  const { url } = JSON.parse(readFileSync(join(home, 'server.json'), 'utf8'));
  const agent = new Client({ name: 'taker', version: '1.0.0' });
  await agent.connect(new StreamableHTTPClientTransport(new URL(`${url}?agent=taker`)));
  const call = async (name: string, args: Record<string, unknown> = {}): Promise<{ text: string; isError: boolean }> => {
    const r = (await agent.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean };
    return { text: r.content[0]!.text, isError: r.isError ?? false };
  };
  try {
    await call('navigate', { to: `${site.url}/index.html` });
    const outline = (await call('snapshot')).text;
    const heading = outline.split('\n').find((l) => l.includes('heading 1'))!.match(/\[(e\d+)\]/)![1]!;

    // The grab reads as deeply as script does, so the same setting gates it.
    const refused = await call('grab_element', { ref: heading });
    expect(refused.isError).toBe(true);
    expect(refused.text).toContain('Settings');
    await win.getByRole('tab', { name: 'Settings' }).click();
    await win.getByRole('switch', { name: 'Let agents run script in pages' }).click();
    await expect(win.getByRole('switch', { name: 'Let agents run script in pages' })).toHaveAttribute('aria-checked', 'true');
    const grabbed = await call('grab_element', { ref: heading });
    expect(grabbed.isError, grabbed.text).toBe(false);
    expect(grabbed.text).toMatch(/<h1[^>]*style="[^"]*font-size/);
    expect(grabbed.text).toContain('Simple pricing');
    const onClipboard = await app.evaluate(async ({ clipboard }) => {
      const [item] = await clipboard.read();
      return ((await item!.getType('text/html')) as Blob).text();
    });
    expect(onClipboard).toContain('<x-paper-html>');
    expect(onClipboard).toContain('Simple pricing');

    expect((await call('get_css', { ref: heading })).text).toMatch(/^h1[^{]* \{\n  [a-z-]+: /);

    // Each match carries its place, which tells repeated buttons apart.
    const found = (await call('find', { query: 'button start free trial' })).text.split('\n');
    expect(found.length).toBeGreaterThan(1);
    for (const line of found) expect(line).toMatch(/at \d+,\d+ {2}\d+ × \d+/);

    // A comment's anchor is often a plain <div>, which has no line of its own. snapshot answers with its nearest container and says so.
    const dir = join(home, 'sites', new URL(site.url).host.replace(/[^A-Za-z0-9.-]+/g, '_'));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html.md'), ['# Comments on /index.html', '', '## 1 · Spacer', '- id: c_spacer01', '- status: open', '- unread: no', '- anchor: {"tag":"div","cssPath":"#tall","text":""}', '', '### You · 2026-09-18T10:00:00.000Z', 'Is this spacer needed?', ''].join('\n'));
    const comment = (await call('get_comment', { id: 'c_spacer01' })).text;
    const spacer = comment.match(/\[(e\d+)\]/)![1]!;
    const around = await call('snapshot', { root_ref: spacer });
    expect(around.isError, around.text).toBe(false);
    expect(around.text).toContain('carries no lines of its own');
    expect(around.text).toContain('Simple pricing');

    // An argument a tool cannot use is refused, and status takes a copied link.
    expect((await call('get_guide', { topic: 'tools', hatch: 'x' })).isError).toBe(true);
    expect((await call('get_guide', { topic: 'tools' })).text).toContain('- grab_element(ref, clipboard?, hatch?)');
    expect((await call('status')).text).toContain('taker');
  } finally {
    await agent.close();
    await app.close();
    await site.close();
  }
});

test('an agent that gives no name is named after its app, and status says how to fix it', async () => {
  const home = freshHome();
  const { app } = await launch(home, 0);
  const { url } = JSON.parse(readFileSync(join(home, 'server.json'), 'utf8'));
  const agent = new Client({ name: 'nameless', version: '1.0.0' });
  await agent.connect(new StreamableHTTPClientTransport(new URL(url)));
  try {
    const status = ((await agent.callTool({ name: 'status', arguments: {} })) as { content: { text: string }[] }).content[0]!.text;
    expect(status).toMatch(/You are agent "unnamed-[a-z0-9._-]+"/);
    expect(status).toContain('?agent=');
  } finally {
    await agent.close();
    await app.close();
  }
});
