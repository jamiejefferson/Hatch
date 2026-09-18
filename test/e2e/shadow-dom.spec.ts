// Controls inside a shadow root: document.elementFromPoint answers with the host, so the cover check must look inside it.
// A real agent met this on developer.mozilla.org, where every click and fill was refused as "covered".
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { expect, test } from '@playwright/test';
import { freshHome, launch, serveSite } from './helpers';

test('click and fill reach controls inside a web component', async () => {
  const site = await serveSite();
  const home = freshHome();
  const { app } = await launch(home, 0);
  const { url } = JSON.parse(readFileSync(join(home, 'server.json'), 'utf8'));
  const agent = new Client({ name: 'piercer', version: '1.0.0' });
  await agent.connect(new StreamableHTTPClientTransport(new URL(`${url}?agent=piercer`)));
  const call = async (name: string, args: Record<string, unknown> = {}): Promise<string> => ((await agent.callTool({ name, arguments: args })) as { content: { text: string }[] }).content[0]!.text;

  try {
    await call('navigate', { to: `${site.url}/components.html` });
    const outline = await call('snapshot');
    const refOf = (label: string): string => outline.split('\n').find((l) => l.includes(label))!.match(/\[(e\d+)\]/)![1]!;

    await call('fill', { ref: refOf('textbox "Find"'), text: 'grid' });
    await call('click', { ref: refOf('button "Search"') });
    expect(await call('snapshot')).toContain('Searched for grid');
  } finally {
    await app.close();
    await site.close();
  }
});
