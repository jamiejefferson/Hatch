// Canvases belong to no agent: an agent opens, names, lists, selects and closes them, works in one another agent
// holds, and a canvas it opened stays open after it finishes (JJ, 22 Sep 2026).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { expect, test } from '@playwright/test';
import { freshHome, launch, serveSite } from './helpers';

type Content = { type: string; text?: string };

async function connect(url: string, agent: string): Promise<Client> {
  const client = new Client({ name: agent, version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${url}?agent=${agent}`)));
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}): Promise<{ text: string; isError: boolean }> {
  const r = (await client.callTool({ name, arguments: args })) as { content: Content[]; isError?: boolean };
  return { text: r.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n'), isError: !!r.isError };
}

test('an agent opens, names, shares, lists and closes canvases, and a canvas outlives its agent', async () => {
  const site = await serveSite();
  const home = freshHome();
  const { app, win } = await launch(home, 0);
  const { url } = JSON.parse(readFileSync(join(home, 'server.json'), 'utf8'));
  const alpha = await connect(url, 'alpha');
  const beta = await connect(url, 'beta');
  const tabs = win.locator('.tabs [role="tab"]');

  try {
    // The window starts with one canvas, which status names.
    const first = await call(alpha, 'status');
    expect(first.text).toContain('You hold the canvas');
    expect(first.text).toContain('the only one open');

    // open_canvas adds a named tab behind the user's, and the agent now holds it.
    const opened = await call(alpha, 'open_canvas', { name: 'Pricing review' });
    const canvasId = opened.text.match(/Opened canvas (\S+)/)![1]!;
    await expect(tabs).toHaveCount(2);
    await expect(tabs.nth(1)).toContainText('Pricing review');
    expect((await call(alpha, 'navigate', { to: `${site.url}/docs.html` })).text).toContain('docs.html');
    const listed = await call(alpha, 'list_canvases');
    expect(listed.text).toContain(`${canvasId} (yours)`);
    expect(listed.text).toContain('"Pricing review"');
    expect(listed.text).toContain('1 Hatch');

    // A second agent works in that same canvas by naming it, while alpha still holds it.
    const shared = await call(beta, 'open_hatch', { to: `${site.url}/index.html`, canvas: canvasId, preset: 'mobile' });
    expect(shared.isError).toBe(false);
    expect(shared.text).toContain('Opened Hatch');
    expect((await call(alpha, 'list_hatches')).text.split('\n')).toHaveLength(2);
    expect((await call(beta, 'list_hatches', { canvas: canvasId })).text).toContain('390 × 844');

    // A canvas id that names nothing is refused with a pointer.
    const missing = await call(beta, 'select_canvas', { canvas: 'no-such-canvas' });
    expect(missing.isError).toBe(true);
    expect(missing.text).toContain('list_canvases');

    // Finishing leaves the canvas and its pages where they are.
    await call(alpha, 'finish_working');
    await alpha.close();
    await expect(tabs).toHaveCount(2);
    await expect(tabs.nth(1)).toContainText('Pricing review');

    // beta closes it; the window keeps its first canvas.
    const closed = await call(beta, 'close_canvas', { canvas: canvasId });
    expect(closed.isError).toBe(false);
    expect(closed.text).toContain('One canvas remains');
    await expect(tabs).toHaveCount(1);
    expect((await call(beta, 'list_canvases')).text).not.toContain(canvasId);
  } finally {
    await beta.close().catch(() => undefined);
    await app.close();
    await site.close();
  }
});
