// A new user meets the two ways to connect an agent. The screen leaves for good once an agent calls.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { expect, test } from '@playwright/test';
import { capture, freshHome, launch } from './helpers';

test('first run shows both connections and closes when the first agent calls', async () => {
  const home = freshHome();
  let { app, win } = await launch(home, 0);
  try {
    await expect(win.getByTestId('first-run')).toBeVisible();
    const { url } = JSON.parse(readFileSync(join(home, 'server.json'), 'utf8'));
    await expect(win.getByTestId('connect-url')).toHaveText(`${url}?agent=your-agent-name`);
    await expect(win.getByTestId('connect-command')).toContainText('hatch-mcp');
    await capture(app, 'test-results/screens/16-first-run.png');

    const agent = new Client({ name: 'first', version: '1.0.0' });
    await agent.connect(new StreamableHTTPClientTransport(new URL(`${url}?agent=first`)));
    await agent.callTool({ name: 'status', arguments: {} });
    await expect(win.getByTestId('first-run')).toHaveCount(0);
    await expect(win.getByText('This tab has no pages yet.')).toBeVisible();

    await win.getByRole('tab', { name: 'Settings' }).click();
    await expect(win.getByRole('heading', { name: 'Connect an agent' })).toBeVisible();
    await win.waitForTimeout(300);
    await capture(app, 'test-results/screens/17-settings.png');
    await app.close();

    ({ app, win } = await launch(home, 0));
    await expect(win.getByText('This tab has no pages yet.')).toBeVisible();
    await expect(win.getByTestId('first-run')).toHaveCount(0);
  } finally {
    await app.close();
  }
});

test('a busy port moves Hatch to the next one and says so', async () => {
  // HATCH_MCP_PORT is left unset here, so Hatch wants 42824. The test holds that port first.
  const blocker = createServer();
  const held = await new Promise<boolean>((ok) => blocker.once('error', () => ok(false)).listen(42824, '127.0.0.1', () => ok(true)));
  const home = freshHome();
  const { _electron: electron } = await import('@playwright/test');
  const env = { ...process.env, HATCH_HOME: home, HATCH_PROXY_PORT: '0', HATCH_HIDDEN: '1', HATCH_GUIDE: '0' } as Record<string, string>;
  delete env.HATCH_MCP_PORT;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const win = await app.firstWindow();
    await expect(win.getByTestId('connection-banner')).toContainText('Port 42824 was busy');
    const { port } = JSON.parse(readFileSync(join(home, 'server.json'), 'utf8'));
    expect(port).toBeGreaterThan(42824);
    await expect(win.getByTestId('connection-banner')).toContainText(String(port));
  } finally {
    await app.close();
    if (held) blocker.close();
  }
});
