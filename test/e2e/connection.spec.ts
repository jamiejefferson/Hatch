// Hatch needs no setup before an agent uses it. Settings holds the details the user hands to the agent.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { expect, test } from '@playwright/test';
import { capture, freshHome, launch } from './helpers';

test('a fresh Hatch opens on its canvas, and Settings holds the details an agent needs', async () => {
  const home = freshHome();
  const { app, win } = await launch(home, 0);
  try {
    // Hatch asks for no setup. The empty canvas is the first thing a new user meets.
    await expect(win.getByText('This tab has no pages yet.')).toBeVisible();
    await expect(win.getByText('Connect an agent')).toHaveCount(0);

    await win.getByRole('tab', { name: 'Settings' }).click();
    await expect(win.getByRole('heading', { name: 'Details for your agent' })).toBeVisible();
    // A build run from source has no place in the macOS browser list, so the button waits for the installed app.
    await expect(win.getByTestId('make-default')).toBeDisabled();
    await win.getByText('Set it up by hand').click();
    const { url } = JSON.parse(readFileSync(join(home, 'server.json'), 'utf8'));
    await expect(win.getByTestId('connect-url')).toHaveText(`${url}?agent=your-agent-name`);
    await expect(win.getByTestId('connect-command')).toContainText('hatch-mcp');
    await win.waitForTimeout(300);
    await capture(app, 'test-results/screens/17-settings.png');

    // An agent that was handed the address works with no step inside Hatch.
    const agent = new Client({ name: 'first', version: '1.0.0' });
    await agent.connect(new StreamableHTTPClientTransport(new URL(`${url}?agent=first`)));
    const status = await agent.callTool({ name: 'status', arguments: {} });
    expect(status.isError).toBeFalsy();
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
  const env = { ...process.env, HATCH_HOME: home, HATCH_PROXY_PORT: '0', HATCH_HIDDEN: '1', HATCH_GUIDE: '0', HATCH_WELCOME: '0' } as Record<string, string>;
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
