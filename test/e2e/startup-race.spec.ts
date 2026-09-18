// An agent that starts before Hatch calls the instant the port opens. That call must open a page that survives start-up.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { _electron as electron, expect, test } from '@playwright/test';
import { freshHome, serveSite } from './helpers';

test('a call that lands while Hatch is still starting opens its page', async () => {
  const site = await serveSite();
  const home = freshHome();
  const starting = electron.launch({ args: ['.'], env: { ...process.env, HATCH_HOME: home, HATCH_MCP_PORT: '0', HATCH_PROXY_PORT: '0', HATCH_HIDDEN: '1', HATCH_GUIDE: '0' } as Record<string, string> });
  try {
    // No wait for the window: the call goes out as soon as the lockfile names a port.
    await expect.poll(() => existsSync(join(home, 'server.json')), { timeout: 20_000, intervals: [10] }).toBe(true);
    const { url } = JSON.parse(readFileSync(join(home, 'server.json'), 'utf8'));
    const agent = new Client({ name: 'early', version: '1.0.0' });
    await agent.connect(new StreamableHTTPClientTransport(new URL(`${url}?agent=early`)));
    const opened = (await agent.callTool({ name: 'navigate', arguments: { to: `${site.url}/index.html` } })) as { content: { text: string }[]; isError?: boolean };
    expect(opened.isError ?? false, opened.content[0]!.text).toBe(false);
    expect(opened.content[0]!.text).toContain('Opened Hatch');
    const read = (await agent.callTool({ name: 'snapshot', arguments: {} })) as { content: { text: string }[] };
    expect(read.content[0]!.text).toContain('heading 1');
  } finally {
    await (await starting).close();
    await site.close();
  }
});
