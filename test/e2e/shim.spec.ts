// The stdio shim: an agent app starts it as a command. It must work while Hatch is closed, and drive Hatch once it runs.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { expect, test } from '@playwright/test';
import { freshHome, launch, serveSite } from './helpers';

const SHIM = resolve('out/main/hatch-mcp.js');
type Reply = { content: { type: string; text?: string }[]; isError?: boolean };

async function connect(home: string, mode?: 'auto', onTools?: (names: string[]) => void): Promise<Client> {
  const client = new Client(
    { name: 'stdio-agent', version: '1.0.0' },
    { ...(mode ? { versionNegotiation: { mode } } : {}), ...(onTools ? { listChanged: { tools: { onChanged: (_error, tools) => onTools((tools ?? []).map((t) => t.name)) } } } : {}) },
  );
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [SHIM], env: { ...process.env, HATCH_HOME: home, HATCH_AGENT: 'desk-agent' } as Record<string, string> }));
  return client;
}

test('an agent that starts before Hatch keeps its connection, then drives Hatch once it opens', async () => {
  const site = await serveSite();
  const home = freshHome();
  let announced: string[] = [];
  const early = await connect(home, undefined, (names) => (announced = names));
  try {
    // Hatch is closed: the shim answers on its own and says what to do.
    expect((await early.listTools()).tools.map((t) => t.name)).toEqual(['status']);
    const closed = (await early.callTool({ name: 'status', arguments: {} })) as Reply;
    expect(closed.isError).toBe(true);
    expect(closed.content[0]!.text).toContain('Open the Hatch app');

    const { app, win } = await launch(home, 0);
    try {
      await expect.poll(() => existsSync(join(home, 'tools.json'))).toBe(true);
      const opened = (await early.callTool({ name: 'navigate', arguments: { to: `${site.url}/index.html` } })) as Reply;
      expect(opened.isError ?? false, opened.content[0]!.text).toBe(false);
      // The agent held the one-tool list, so the shim tells it to fetch the full one. A real agent app calls only what it has listed.
      await expect.poll(() => announced).toEqual(expect.arrayContaining(['navigate', 'snapshot']));
      expect(((await early.callTool({ name: 'snapshot', arguments: {} })) as Reply).content[0]!.text).toContain('heading 1');
      // The name from HATCH_AGENT reaches the Activity panel.
      await win.getByRole('tab', { name: 'Activity' }).click();
      await expect(win.getByTestId('activity-entry').first()).toBeVisible();
      expect(readFileSync(join(home, 'logs', readdirSync(join(home, 'logs'))[0]!), 'utf8')).toContain('desk-agent');

      // A second shim, on the current protocol, lists every tool and receives an image.
      const modern = await connect(home, 'auto');
      const names = (await modern.listTools()).tools.map((t) => t.name);
      expect(names).toEqual(expect.arrayContaining(['navigate', 'snapshot', 'list_comments', 'fill_credentials', 'get_element']));
      await modern.close();
    } finally {
      await app.close();
    }

    // Hatch closed again. The shim now lists the full tool set from tools.json, and a call explains itself.
    const names = (await early.listTools()).tools.map((t) => t.name);
    expect(names.length).toBeGreaterThan(30);
    const after = (await early.callTool({ name: 'snapshot', arguments: {} })) as Reply;
    expect(after.content[0]!.text).toContain('Hatch is not running');
  } finally {
    await early.close();
    await site.close();
  }
});
