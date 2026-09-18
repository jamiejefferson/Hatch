// Typed text and keys must reach a page that has never had a click, and a page the user has clicked away from.
// Chrome drops CDP's Input.insertText and Input.dispatchKeyEvent in both cases with no error, so Hatch sends them through Electron.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { expect, test } from '@playwright/test';
import { freshHome, inPages, launch, serveSite } from './helpers';

test('fill and press_key land with no click before them, and after the user clicks in Hatch', async () => {
  const site = await serveSite();
  const home = freshHome();
  const { app, win } = await launch(home, 0);
  const { url } = JSON.parse(readFileSync(join(home, 'server.json'), 'utf8'));
  const agent = new Client({ name: 'typist', version: '1.0.0' });
  await agent.connect(new StreamableHTTPClientTransport(new URL(`${url}?agent=typist`)));
  const call = async (name: string, args: Record<string, unknown> = {}): Promise<string> => ((await agent.callTool({ name, arguments: args })) as { content: { text: string }[] }).content[0]!.text;
  const state = async (): Promise<string> => (await inPages<string>(app, `document.activeElement.getAttribute('name') + '|' + document.querySelector('[name=email]').value`))[0]!;

  try {
    await call('navigate', { to: `${site.url}/login.html` });
    const ref = (await call('snapshot')).split('\n').find((l) => l.includes('textbox "Email"'))!.match(/\[(e\d+)\]/)![1]!;

    await call('press_key', { key: 'x', ref });
    expect(await state()).toBe('email|x');
    await call('fill', { ref, text: 'first' });
    expect(await state()).toBe('email|first');

    // The user clicks in Hatch's own interface, which takes input focus away from the page.
    await win.getByRole('tab', { name: 'Links' }).click();
    await call('press_key', { key: 'k' });
    expect(await state()).toBe('email|firstk');
    await call('press_key', { key: 'Tab' });
    expect(await state()).toBe('password|firstk');
    await call('press_key', { key: 'Shift+Tab' });
    await call('press_key', { key: 'Meta+a' });
    await call('press_key', { key: 'Backspace' });
    expect(await state()).toBe('email|');

    await call('fill', { ref, text: 'sam@studio.example' });
    expect(await state()).toBe('email|sam@studio.example');
    expect(await call('press_key', { key: 'Enter' })).toContain('/account.html');
  } finally {
    await app.close();
    await site.close();
  }
});
