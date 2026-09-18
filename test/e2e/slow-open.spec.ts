// A real agent opened a Next.js project during its first compile and open_hatch answered "did not finish opening", although the Hatch had opened.
// The page used to register with the main process at dom-ready, which a slow first answer holds back. It now registers when it attaches.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { expect, test } from '@playwright/test';
import { freshHome, launch, serveSite } from './helpers';

test('open_hatch reports a slow page as still loading, and wait_for picks it up', async () => {
  const site = await serveSite();
  const home = freshHome();
  const { app } = await launch(home, 0);
  const { url } = JSON.parse(readFileSync(join(home, 'server.json'), 'utf8'));
  const agent = new Client({ name: 'patient', version: '1.0.0' });
  await agent.connect(new StreamableHTTPClientTransport(new URL(`${url}?agent=patient`)));
  const call = async (name: string, args: Record<string, unknown> = {}): Promise<{ text: string; isError: boolean }> => {
    const r = (await agent.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean };
    return { text: r.content[0]!.text, isError: r.isError ?? false };
  };

  try {
    const opened = await call('open_hatch', { to: `${site.url}/first-compile`, timeout_s: 11 });
    expect(opened.isError, opened.text).toBe(false);
    expect(opened.text).toContain('still loading');
    await call('wait_for', { text: 'Compiled page arrived', timeout_s: 10 });
    expect((await call('snapshot')).text).toContain('Compiled page arrived');
  } finally {
    await app.close();
    await site.close();
  }
});
